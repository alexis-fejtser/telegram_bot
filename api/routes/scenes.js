import express from 'express';
import { Op } from 'sequelize';
import { Scene } from '../../src/models/Scene.js';
import { createModuleLogger } from '../../src/config/logger.js';

const log = createModuleLogger('api:scenes');
const router = express.Router();

// Инлайн-кнопки разрешены только у последнего сообщения в шаге.
// Даже если клиент прислал кнопки у промежуточных сообщений — сервер их срежет.
function sanitizeSteps(steps) {
    if (!Array.isArray(steps)) return [];

    return steps.map((step, stepIndex) => {
        const messages = Array.isArray(step?.messages) ? step.messages : [];
        return {
            ...step,
            stepIndex: Number.isFinite(Number(step?.stepIndex)) ? Number(step.stepIndex) : stepIndex,
            messages: messages.map((rawMessage, msgIndex) => {
                const { _key, ...message } = rawMessage || {};
                return {
                    ...message,
                    buttons: msgIndex === messages.length - 1 ? (message.buttons || []) : [],
                };
            }),
        };
    });
}

async function getNextOrder() {
    const lastScene = await Scene.findOne({
        where: { order: { [Op.ne]: null } },
        order: [['order', 'DESC']],
    });
    if (!lastScene || !Number.isFinite(lastScene.order)) {
        return 0;
    }
    return lastScene.order + 1;
}

router.get('/', async (req, res) => {
    try {
        const scenes = await Scene.findAll({
            order: [
                ['order', 'ASC'],
                ['createdAt', 'ASC'],
            ],
        });
        res.json(scenes);
    } catch (error) {
        log.error('Scenes list error:', { message: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Reorder scenes. Body: { order: [sceneId, sceneId, ...] }
router.post('/reorder', async (req, res) => {
    try {
        const { order } = req.body || {};

        if (!Array.isArray(order) || order.length === 0) {
            return res.status(400).json({ error: 'Поле order должно быть непустым массивом sceneId' });
        }

        if (order.some((id) => typeof id !== 'string' || !id.trim())) {
            return res.status(400).json({ error: 'Каждый элемент order должен быть непустой строкой' });
        }

        const uniqueIds = new Set(order);
        if (uniqueIds.size !== order.length) {
            return res.status(400).json({ error: 'order содержит дубликаты sceneId' });
        }

        const existingScenes = await Scene.findAll({
            where: { sceneId: { [Op.in]: order } },
        });
        if (existingScenes.length !== order.length) {
            const foundIds = new Set(existingScenes.map((s) => s.sceneId));
            const missing = order.filter((id) => !foundIds.has(id));
            return res.status(400).json({ error: `Сцены не найдены: ${missing.join(', ')}` });
        }

        const totalScenes = await Scene.count();
        if (totalScenes !== order.length) {
            return res.status(400).json({ error: 'order должен содержать все существующие сцены' });
        }

        for (let index = 0; index < order.length; index++) {
            await Scene.update({ order: index }, { where: { sceneId: order[index] } });
        }

        const scenes = await Scene.findAll({
            order: [
                ['order', 'ASC'],
                ['createdAt', 'ASC'],
            ],
        });
        log.info(`✅ Scenes reordered: ${order.join(', ')}`);
        res.json({ success: true, scenes });
    } catch (error) {
        log.error('Reorder scenes error:', { message: error.message });
        res.status(500).json({ error: error.message });
    }
});

router.get('/:sceneId', async (req, res) => {
    try {
        const { sceneId } = req.params;
        const scene = await Scene.findOne({ where: { sceneId } });
        if (!scene) {
            return res.status(404).json({ error: 'Scene not found' });
        }
        res.json(scene);
    } catch (error) {
        log.error('Get scene error:', { message: error.message });
        res.status(500).json({ error: error.message });
    }
});

router.put('/:sceneId', async (req, res) => {
    try {
        const { sceneId } = req.params;
        const { title, description, isActive, steps } = req.body;

        let scene = await Scene.findOne({ where: { sceneId } });
        const sanitizedSteps = sanitizeSteps(steps);

        if (!scene) {
            const order = await getNextOrder();
            scene = await Scene.create({
                sceneId,
                title,
                description,
                isActive,
                steps: sanitizedSteps,
                order,
            });
        } else {
            await scene.update({
                title,
                description,
                isActive,
                steps: sanitizedSteps,
            });
        }

        log.info(`✅ Scene updated/created: ${sceneId}`);
        res.json({ success: true, scene });
    } catch (error) {
        log.error('Update scene error:', { message: error.message });
        res.status(500).json({ error: error.message });
    }
});

router.post('/', async (req, res) => {
    try {
        const { sceneId, title, description, steps } = req.body;
        if (!sceneId || !title) {
            return res.status(400).json({ error: 'sceneId и title обязательны' });
        }

        const existing = await Scene.findOne({ where: { sceneId } });
        if (existing) {
            return res.status(400).json({ error: 'Scene already exists' });
        }

        const order = await getNextOrder();
        const scene = await Scene.create({
            sceneId,
            title,
            description,
            steps: sanitizeSteps(steps),
            order,
        });
        log.info(`✅ Scene created: ${sceneId} (order ${order})`);
        res.json({ success: true, scene });
    } catch (error) {
        log.error('Create scene error:', { message: error.message });
        res.status(500).json({ error: error.message });
    }
});

router.delete('/:sceneId', async (req, res) => {
    try {
        const { sceneId } = req.params;
        const scene = await Scene.findOne({ where: { sceneId } });
        if (scene) {
            await scene.destroy();
        }
        log.info(`✅ Scene deleted: ${sceneId}`);
        res.json({ success: true });
    } catch (error) {
        log.error('Delete scene error:', { message: error.message });
        res.status(500).json({ error: error.message });
    }
});

export default router;
