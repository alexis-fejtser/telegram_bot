import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { createModuleLogger } from '../src/config/logger.js';
import { User } from '../src/models/User.js';

import analyticsRouter from './routes/analytics.js';
import questionsRouter from './routes/questions.js';
import assetsRouter from './routes/assets.js';
import scenesRouter from './routes/scenes.js';
import authRouter from './routes/auth.js';
import settingsRouter from './routes/settings.js';

const log = createModuleLogger('api');

export function createApiServer(botInstance) {
    const app = express();

    app.use(cors());
    app.use(express.json());
    if (botInstance) {
        app.set('bot', botInstance);
    }

    // --- STATIC UPLOADS (медиатека) ---
    // Доступны как по корню /uploads, так и по подпути /tgbot/uploads
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });
    app.use('/uploads', express.static(uploadsDir));
    app.use('/tgbot/uploads', express.static(uploadsDir));

    // --- ROUTES ---
    const apiRouter = express.Router();
    apiRouter.use('/analytics', analyticsRouter);
    apiRouter.use('/questions', questionsRouter(botInstance));
    apiRouter.use('/assets', assetsRouter(botInstance));
    apiRouter.use('/scenes', scenesRouter);
    apiRouter.use('/auth', authRouter);
    apiRouter.use('/settings', settingsRouter);

    // --- DIRECT CHAT MESSAGING ---
    apiRouter.post('/chat/send', async (req, res) => {
        try {
            const { telegramId, text } = req.body;
            if (!telegramId || !text) {
                return res.status(400).json({ error: 'telegramId and text are required' });
            }

            const dbUser = await User.findOne({ where: { telegramId: Number(telegramId) } });
            if (dbUser && dbUser.status === 'blocked') {
                return res.status(400).json({ error: 'Пользователь заблокировал бота. Отправка сообщений невозможна.' });
            }

            if (botInstance) {
                try {
                    await botInstance.telegram.sendMessage(telegramId, text, { parse_mode: 'HTML' });
                    log.info(`💬 Direct message sent to ${telegramId}: ${text}`);
                } catch (tgError) {
                    if (tgError.message?.includes('blocked') || tgError.message?.includes('Forbidden') || tgError.code === 403) {
                        await User.update(
                            { status: 'blocked', statusUpdatedAt: new Date() },
                            { where: { telegramId: Number(telegramId) } }
                        );
                        return res.status(400).json({ error: 'Пользователь заблокировал бота.' });
                    }
                    throw tgError;
                }
            }

            res.json({ success: true });
        } catch (error) {
            log.error('Direct chat send error:', { message: error.message });
            res.status(500).json({ error: error.message });
        }
    });

    // Монтируем API как по корню (/api), так и по префиксу (/tgbot/api)
    app.use('/api', apiRouter);
    app.use('/tgbot/api', apiRouter);

    // Serve React client static files in production
    const clientDist = path.resolve(process.cwd(), 'client/dist');
    app.use(express.static(clientDist));
    app.use('/tgbot', express.static(clientDist));

    // Редирект с /tgbot на /tgbot/ для сохранения контекста относительных путей в браузере
    app.get('/tgbot', (req, res) => {
        res.redirect(301, '/tgbot/');
    });

    // Fallback для SPA (поддерживает и /tgbot/*, и прямые маршруты)
    app.get(/.*/, (req, res) => {
        if (
            req.path.startsWith('/api') ||
            req.path.startsWith('/tgbot/api') ||
            req.path.startsWith('/uploads') ||
            req.path.startsWith('/tgbot/uploads')
        ) {
            return res.status(404).json({ error: 'Not found' });
        }
        const indexPath = path.join(clientDist, 'index.html');
        if (fs.existsSync(indexPath)) {
            return res.sendFile(indexPath);
        }
        res.status(404).json({ error: 'Client build not found' });
    });

    return app;
}
