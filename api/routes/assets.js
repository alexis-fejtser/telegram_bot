import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Asset } from '../../src/models/Asset.js';
import { setAssetOverride, getAllCachedFileIds } from '../../src/services/mediaStore.js';
import { warmupMediaCache } from '../../src/services/mediaWarmup.js';
import { createModuleLogger } from '../../src/config/logger.js';

const log = createModuleLogger('api:assets');
const router = express.Router();
let currentBotInstance = null;

export function setAssetsBotInstance(bot) {
    currentBotInstance = bot;
}

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const MEDIA_TYPES = ['photo', 'video', 'videoNote'];

function sanitizeBaseName(name) {
    return (name || 'file')
        .replace(/\.[^.]*$/, '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40) || 'file';
}

function detectMediaType(mimetype, fallback = 'photo') {
    if (mimetype?.startsWith('image/')) return 'photo';
    if (mimetype?.startsWith('video/')) return 'video';
    return fallback;
}

function normalizeStoredPath(absolutePath) {
    const relative = path.relative(process.cwd(), absolutePath);
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
        return relative.split(path.sep).join('/');
    }
    return absolutePath;
}

function resolveAbsolutePath(filePath) {
    if (!filePath) return null;
    return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 10);
        const stamp = Date.now().toString(36);
        const rand = crypto.randomBytes(3).toString('hex');
        cb(null, `${sanitizeBaseName(file.originalname)}_${stamp}${rand}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
});

async function generateAssetKey(originalName) {
    const base = sanitizeBaseName(originalName);
    for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = `${base}_${crypto.randomBytes(3).toString('hex')}`;
        const exists = await Asset.findOne({ where: { assetKey: candidate }, attributes: ['id'] });
        if (!exists) return candidate;
    }
    return `${base}_${Date.now().toString(36)}`;
}

// Список всех файлов медиатеки
router.get('/', async (req, res) => {
    try {
        const assets = await Asset.findAll({
            order: [['updatedAt', 'DESC']],
        });
        res.json(assets);
    } catch (error) {
        log.error('Assets list error:', { message: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Загрузка файла с компьютера и создание записи в медиатеке
router.post('/upload', (req, res) => {
    upload.single('file')(req, res, async (uploadError) => {
        if (uploadError) {
            log.error('Asset upload error:', { message: uploadError.message });
            return res.status(400).json({ error: `Не удалось загрузить файл: ${uploadError.message}` });
        }

        try {
            if (!req.file) {
                return res.status(400).json({ error: 'Файл не передан (поле file)' });
            }

            const requestedType = MEDIA_TYPES.includes(req.body.mediaType) ? req.body.mediaType : null;
            const mediaType = requestedType || detectMediaType(req.file.mimetype);
            const assetKey = (req.body.assetKey || '').trim() || (await generateAssetKey(req.file.originalname));
            const filePath = normalizeStoredPath(req.file.path);

            let asset = await Asset.findOne({ where: { assetKey } });
            if (!asset) {
                asset = await Asset.create({
                    assetKey,
                    filePath,
                    mediaType,
                    updatedAt: new Date(),
                });
            } else {
                await asset.update({
                    filePath,
                    mediaType,
                    updatedAt: new Date(),
                });
            }

            setAssetOverride(assetKey, filePath);

            log.info(`✅ Asset uploaded: ${assetKey} -> ${filePath} (${mediaType})`);
            res.json({ success: true, asset });
        } catch (error) {
            log.error('Asset upload error:', { message: error.message });
            res.status(500).json({ error: error.message });
        }
    });
});

// Отдача файла медиатеки (используется для превью в админке)
router.get('/:assetKey/file', async (req, res) => {
    try {
        const asset = await Asset.findOne({ where: { assetKey: req.params.assetKey } });
        if (!asset) {
            return res.status(404).json({ error: 'Asset not found' });
        }

        const absolutePath = resolveAbsolutePath(asset.filePath);
        if (!absolutePath || !fs.existsSync(absolutePath)) {
            return res.status(404).json({ error: `Файл не найден: ${asset.filePath}` });
        }

        res.sendFile(absolutePath);
    } catch (error) {
        log.error('Asset file serve error:', { message: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Обновление существующего asset (совместимость со старым API)
router.put('/:assetKey', upload.single('file'), async (req, res) => {
    try {
        const { assetKey } = req.params;
        const filePath = req.file
            ? normalizeStoredPath(req.file.path)
            : (req.body.filePath || '').trim();
        const mediaType = MEDIA_TYPES.includes(req.body.mediaType) ? req.body.mediaType : 'photo';

        if (!filePath) {
            return res.status(400).json({ error: 'File or filePath is required' });
        }

        let asset = await Asset.findOne({ where: { assetKey } });
        if (!asset) {
            asset = await Asset.create({
                assetKey,
                filePath,
                mediaType,
                updatedAt: new Date(),
            });
        } else {
            await asset.update({
                filePath,
                mediaType,
                updatedAt: new Date(),
            });
        }

        setAssetOverride(assetKey, filePath);

        log.info(`✅ Asset updated: ${assetKey} -> ${filePath}`);
        res.json({ success: true, asset });
    } catch (error) {
        log.error('Update asset error:', { message: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Удаление записи медиатеки (и файла, если он лежит в uploads/)
router.delete('/:assetKey', async (req, res) => {
    try {
        const asset = await Asset.findOne({ where: { assetKey: req.params.assetKey } });
        if (!asset) {
            return res.status(404).json({ error: 'Asset not found' });
        }

        const absolutePath = resolveAbsolutePath(asset.filePath);
        if (absolutePath && absolutePath.startsWith(UPLOADS_DIR) && fs.existsSync(absolutePath)) {
            try {
                fs.unlinkSync(absolutePath);
            } catch (unlinkError) {
                log.warn('Asset file unlink failed:', { message: unlinkError.message });
            }
        }

        await asset.destroy();

        log.info(`🗑️ Asset deleted: ${req.params.assetKey}`);
        res.json({ success: true });
    } catch (error) {
        log.error('Delete asset error:', { message: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Статус кэша Telegram file-id
router.get('/cache-status', (req, res) => {
    try {
        const cache = getAllCachedFileIds();
        res.json({
            cachedCount: Object.keys(cache).length,
            cachedKeys: Object.keys(cache),
        });
    } catch (error) {
        log.error('Cache status error:', { message: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Прогрев медиа в file-id кэш за счёт рассылки медиа на manager_id
const handleWarmup = async (req, res) => {
    try {
        const currentBot = currentBotInstance || req.app?.get('bot');
        if (!currentBot) {
            return res.status(400).json({
                error: 'Экземпляр Telegram-бота не инициализирован. Убедитесь, что бот запущен.',
            });
        }

        const force = Boolean(req.body?.force);
        const managerId = req.body?.managerId;
        const delayMs = req.body?.delayMs !== undefined ? Number(req.body.delayMs) : 600;

        const result = await warmupMediaCache({
            bot: currentBot,
            managerId,
            force,
            delayMs,
        });

        res.json(result);
    } catch (error) {
        log.error('Media warmup error:', { message: error.message });
        res.status(400).json({ error: error.message });
    }
};

router.post('/warmup', handleWarmup);
router.post('/warmup-cache', handleWarmup);

export default function assetsRouter(botOrReq, res, next) {
    if (botOrReq && (botOrReq.telegram || typeof botOrReq.use === 'function')) {
        currentBotInstance = botOrReq;
        return router;
    }
    return router(botOrReq, res, next);
}
