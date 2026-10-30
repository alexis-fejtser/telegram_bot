import { Telegraf, Scenes } from 'telegraf';

import { PORT } from './config/config.js';
import { logger } from './config/logger.js';
import { syncAssetsFromDB } from './services/mediaStore.js';
import { connectDB } from './services/db.js';
import { createApiServer } from '../api/server.js';
import { Scene } from './models/Scene.js';
import { createDynamicScene } from './flow/createDynamicScene.js';
import { attachSceneStage } from './flow/sceneRegistry.js';
import { getSettings, loadSettings } from './services/settingsService.js';
import { applyTelegrafMultipartFix } from './services/telegrafMultipartFix.js';
import { attachTelegramRetry, createTelegramAgent } from './services/telegramTransport.js';
import { registerHandlers } from './botHandlers.js';

import { registerSceneActions } from './mainMenu.js';

let bot = null;

// =====================
// BOOTSTRAP
// =====================
async function bootstrap() {
    try {
        logger.info('🚀 Запуск бота и инициализация сервисов...');

        // Фикс отправки медиа: multipart-тело telegraf зависает на Node 26
        // (фото/видео не отправляются, текстовые сообщения работают).
        applyTelegrafMultipartFix();

        // 1. Connect to MySQL
        await connectDB();
        await syncAssetsFromDB();

        // 2. Load settings (bot token, manager id, timers, lead texts)
        await loadSettings();
        const settings = getSettings();

        if (!settings.botToken) {
            logger.error('❌ Ошибка: токен бота не задан (BOT_TOKEN в .env или настройки в админ-панели)');
            process.exit(1);
        }

        if (!settings.managerId) {
            logger.warn(
                '⚠️ Внимание: MANAGER_ID не задан. Функция "Задать вопрос" не сможет отправлять сообщения менеджеру.'
            );
        }

        // transport-агент: без keepAlive, TLS 1.2 + IPv4, отдельный и для
        // загрузки медиа (attachmentAgent), где и происходили обрывы TLS.
        const telegramAgent = createTelegramAgent();

        bot = new Telegraf(settings.botToken, {
            telegram: {
                agent: telegramAgent,
                attachmentAgent: telegramAgent,
            },
        });

        // Все методы Telegraf (sendPhoto, sendMessage, getUpdates...) идут через
        // callApi: повторяем запрос при обрыве сокета/TLS, пересоздавая медиа-потоки.
        attachTelegramRetry(bot.telegram);

        registerHandlers(bot);

        // 3. Load active scenes from MySQL dynamically
        const dbScenes = await Scene.findAll({
            where: { isActive: true },
            order: [
                ['order', 'ASC'],
                ['createdAt', 'ASC'],
            ],
        });
        const scenesArray = dbScenes.map((s) => createDynamicScene(s.sceneId));

        const stage = new Scenes.Stage(scenesArray);
        bot.use(stage.middleware());

        // Сцены, созданные в админке после запуска бота, дорегистрируются
        // в этот Stage автоматически при первом обращении (см. sceneRegistry).
        attachSceneStage(stage);

        // ВАЖНО: registerSceneActions вызывается после stage.middleware()
        registerSceneActions(bot);

        logger.info(`✅ Загружено сцен из БД: ${scenesArray.length}`);

        // 4. Start Express API for React Admin Panel
        const app = createApiServer(bot);
        app.listen(PORT, () => {
            logger.info(`🌐 Admin Panel API server started on port ${PORT}`);
        });

        const botInfo = await bot.telegram.getMe();

        logger.info('✅ Telegram getMe OK:', {
            id: botInfo.id,
            username: botInfo.username,
            first_name: botInfo.first_name,
            is_bot: botInfo.is_bot,
        });

        const webhookInfo = await bot.telegram.getWebhookInfo();

        logger.info('ℹ️ Webhook info before delete:', {
            url: webhookInfo.url,
            pending_update_count: webhookInfo.pending_update_count,
            last_error_date: webhookInfo.last_error_date,
            last_error_message: webhookInfo.last_error_message,
        });

        await bot.telegram.deleteWebhook({
            drop_pending_updates: false,
        });

        logger.info('✅ Webhook deleted');

        // Регистрируем команды: у всех пользователей (включая старых)
        // появится кнопка "Меню" в чате, нажатие на неё активирует бота и запишет в базу.
        try {
            await bot.telegram.setMyCommands([
                { command: 'start', description: 'Перезапустить бота' },
                { command: 'menu', description: 'Открыть главное меню' },
            ]);
            logger.info('✅ Команды бота зарегистрированы (кнопка "Меню" в Telegram)');
        } catch (commandsError) {
            logger.warn('⚠️ Не удалось зарегистрировать команды бота:', {
                message: commandsError.message,
            });
        }

        try {
            await bot.launch({
                dropPendingUpdates: false,
                allowedUpdates: ['message', 'callback_query', 'my_chat_member'],
            });
            logger.info('✅ Бот запущен и готов к работе.');
        } catch (launchError) {
            logger.error('❌ Не удалось запустить Telegram бот (возможно, другой экземпляр уже запущен):', {
                message: launchError.message,
            });
        }
    } catch (error) {
        logger.error('❌ Критическая ошибка при запуске бота:', {
            message: error.message,
            stack: error.stack,
        });

        process.exit(1);
    }
}

bootstrap();

// =====================
// GRACEFUL STOP
// =====================
process.once('SIGINT', () => {
    logger.info('🛑 Остановка бота: SIGINT');
    if (bot) bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
    logger.info('🛑 Остановка бота: SIGTERM');
    if (bot) bot.stop('SIGTERM');
});
