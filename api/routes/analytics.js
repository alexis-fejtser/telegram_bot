import express from 'express';
import { Op } from 'sequelize';
import { User } from '../../src/models/User.js';
import { MessageHistory } from '../../src/models/MessageHistory.js';
import { Question } from '../../src/models/Question.js';
import { createModuleLogger } from '../../src/config/logger.js';

const log = createModuleLogger('api:analytics');
const router = express.Router();

function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePositiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isFinite(parsed) || parsed < 1) return fallback;

    return Math.min(parsed, max);
}

router.get('/summary', async (req, res) => {
    try {
        const totalUsers = await User.count();
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const activeToday = await User.count({
            where: { lastInteractionAt: { [Op.gte]: todayStart } },
        });
        const totalQuestions = await Question.count();
        const pendingQuestions = await Question.count({
            where: { status: 'pending' },
        });

        res.json({
            totalUsers,
            activeToday,
            totalQuestions,
            pendingQuestions,
        });
    } catch (error) {
        log.error('Analytics summary error:', { message: error.message });
        res.status(500).json({ error: error.message });
    }
});

router.get('/activity', async (req, res) => {
    try {
        const data = [];
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            date.setHours(0, 0, 0, 0);

            const nextDate = new Date(date);
            nextDate.setDate(date.getDate() + 1);

            const count = await User.count({
                where: {
                    firstInteractionAt: {
                        [Op.gte]: date,
                        [Op.lt]: nextDate,
                    },
                },
            });

            const dayFormatted = String(date.getDate()).padStart(2, '0');
            const monthFormatted = String(date.getMonth() + 1).padStart(2, '0');
            data.push({
                date: `${dayFormatted}.${monthFormatted}`,
                users: count,
            });
        }
        res.json(data);
    } catch (error) {
        log.error('Analytics activity error:', { message: error.message });
        res.status(500).json({ error: error.message });
    }
});

router.get('/users', async (req, res) => {
    try {
        const { search, scene } = req.query;
        const page = parsePositiveInt(req.query.page, 1);
        const limit = parsePositiveInt(req.query.limit, 20, 100);

        const where = {};

        if (scene) {
            const sceneValue = String(scene);
            where.currentScene = sceneValue === '__main_menu__' ? null : sceneValue;
        }

        const searchTerm = search ? String(search).trim() : '';

        if (searchTerm) {
            const escapedTerm = escapeRegex(searchTerm);
            const conditions = [
                { username: { [Op.regexp]: escapedTerm } },
                { firstName: { [Op.regexp]: escapedTerm } },
                { lastName: { [Op.regexp]: escapedTerm } },
                { currentScene: { [Op.regexp]: escapedTerm } },
            ];

            if (/^\d+$/.test(searchTerm)) {
                const numericId = Number(searchTerm);
                if (Number.isSafeInteger(numericId)) {
                    conditions.push({ telegramId: numericId });
                }
            }

            where[Op.or] = conditions;
        }

        const users = await User.findAll({
            where,
            order: [['lastInteractionAt', 'DESC']],
            offset: (page - 1) * limit,
            limit,
        });

        const total = await User.count({ where });

        res.json({
            users,
            totalPages: Math.max(1, Math.ceil(total / limit)),
            currentPage: page,
            total,
        });
    } catch (error) {
        log.error('Users list error:', { message: error.message });
        res.status(500).json({ error: error.message });
    }
});

router.get('/users/:telegramId', async (req, res) => {
    try {
        const numericId = Number(req.params.telegramId);

        if (!Number.isSafeInteger(numericId)) {
            return res.status(400).json({ error: 'telegramId должен быть числом' });
        }

        const user = await User.findOne({ where: { telegramId: numericId } });

        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        res.json(user);
    } catch (error) {
        log.error('User lookup error:', { message: error.message });
        res.status(500).json({ error: error.message });
    }
});

router.get('/users/:telegramId/history', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const limit = parsePositiveInt(req.query.limit, 100, 500);
        const numericId = Number(telegramId);

        if (!Number.isSafeInteger(numericId)) {
            return res.status(400).json({ error: 'telegramId должен быть числом' });
        }

        const history = await MessageHistory.findAll({
            where: { telegramId: numericId },
            order: [['timestamp', 'DESC']],
            limit,
        });

        res.json(history);
    } catch (error) {
        log.error('User history error:', { message: error.message });
        res.status(500).json({ error: error.message });
    }
});

export default router;
