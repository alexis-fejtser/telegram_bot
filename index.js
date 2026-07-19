import { Telegraf, Scenes, session } from 'telegraf';
import ffmpeg from 'fluent-ffmpeg';

import {
    BOT_TOKEN,
    HEAVY_VIDEO_PATH,
    COMPRESSED_VIDEO_PATH,
    SHOULD_COMPRESS_VIDEO_ON_START,
    MANAGER_ID,
} from './config.js';

import { showMainMenu, registerSceneActions } from './mainMenu.js';
import { resetUserSession } from './state/resetUserSession.js';

import {
    handleDeepLinkStart,
    prepareDeepLinkStart,
} from './deepLinks.js';

import { firstScene } from './scenes/firstScene.js';
import { secondScene } from './scenes/secondScene.js';
import { thirtyScene } from './scenes/thirtyScene.js';

// =====================
// VALIDATION
// =====================
if (!BOT_TOKEN) {
    console.error('❌ Ошибка: переменная BOT_TOKEN не задана в .env');
    process.exit(1);
}

if (!MANAGER_ID) {
    console.warn(
        '⚠️ Внимание: MANAGER_ID не задан в .env. Функция "Задать вопрос" не сможет отправлять сообщения менеджеру.'
    );
}

// =====================
// BOT INIT
// =====================
const bot = new Telegraf(BOT_TOKEN);

const stage = new Scenes.Stage([
    firstScene,
    secondScene,
    thirtyScene,
]);

// =====================
// HELPERS
// =====================
function compressVideo(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .videoFilters([
                'scale=640:640',
                'setsar=1',
            ])
            .outputOptions([
                '-map 0:v:0',
                '-map 0:a?',
                '-c:v libx264',
                '-preset veryfast',
                '-crf 28',
                '-c:a aac',
                '-b:a 128k',
                '-pix_fmt yuv420p',
                '-movflags +faststart',
                '-shortest',
            ])
            .format('mp4')
            .save(outputPath)
            .on('end', () => {
                console.log('✅ Видео успешно подготовлено для Telegram-кружка со звуком.');
                resolve(outputPath);
            })
            .on('error', (error) => {
                console.error('❌ Ошибка сжатия видео:', error.message);
                reject(error);
            });
    });
}

function isResetCommand(ctx) {
    const text = ctx.message?.text;

    if (!text) {
        return false;
    }

    return (
        text.startsWith('/start') ||
        text.startsWith('/menu') ||
        text.startsWith('/exit') ||
        text === '🏠 Главное меню'
    );
}

// =====================
// ERROR HANDLER
// =====================
bot.catch((error, ctx) => {
    console.error('❌ BOT ERROR:', {
        message: error.message,
        stack: error.stack,
        updateType: ctx?.updateType,
        chatId: ctx?.chat?.id,
        userId: ctx?.from?.id,
        update: ctx?.update,
    });
});

// =====================
// MIDDLEWARE ORDER
// =====================
bot.use(session());

// ВАЖНО:
// Этот middleware стоит ДО stage.middleware().
// Он сбрасывает старую сцену ещё до того,
// как активная сцена сможет перехватить /start.
bot.use(async (ctx, next) => {
    if (isResetCommand(ctx)) {
        resetUserSession(ctx);

        if (ctx.message?.text?.startsWith('/start')) {
            prepareDeepLinkStart(ctx);
        }
    }

    return next();
});

// Подключаем сцены после сброса
bot.use(stage.middleware());

// =====================
// COMMANDS
// =====================
bot.start(async (ctx) => {
    const handledDeepLink = await handleDeepLinkStart(ctx);

    if (handledDeepLink) {
        return;
    }

    await showMainMenu(ctx);
});

bot.command('menu', async (ctx) => {
    await showMainMenu(ctx);
});

bot.command('exit', async (ctx) => {
    await showMainMenu(ctx);
});

bot.hears('🏠 Главное меню', async (ctx) => {
    await showMainMenu(ctx);
});

// Inline-кнопки выбора сцен из главного меню
registerSceneActions(bot);

// Fallback вне сцен
bot.on('text', async (ctx) => {
    await ctx.reply(
        'Выберите сценарий в меню или нажмите /menu.'
    );
});

// =====================
// BOOTSTRAP
// =====================
async function bootstrap() {
    try {
        console.log('🚀 Запуск бота...');

        const botInfo = await bot.telegram.getMe();

        console.log('✅ Telegram getMe OK:', {
            id: botInfo.id,
            username: botInfo.username,
            first_name: botInfo.first_name,
            is_bot: botInfo.is_bot,
        });

        const webhookInfo = await bot.telegram.getWebhookInfo();

        console.log('ℹ️ Webhook info before delete:', {
            url: webhookInfo.url,
            pending_update_count: webhookInfo.pending_update_count,
            last_error_date: webhookInfo.last_error_date,
            last_error_message: webhookInfo.last_error_message,
        });

        await bot.telegram.deleteWebhook({
            drop_pending_updates: false,
        });

        console.log('✅ Webhook deleted');

        if (SHOULD_COMPRESS_VIDEO_ON_START) {
            await compressVideo(HEAVY_VIDEO_PATH, COMPRESSED_VIDEO_PATH);
        }

        await bot.launch({
            dropPendingUpdates: false,
        });

        console.log('✅ Бот запущен и готов к работе.');
    } catch (error) {
        console.error('❌ Критическая ошибка при запуске бота:', {
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
    console.log('🛑 Остановка бота: SIGINT');
    bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
    console.log('🛑 Остановка бота: SIGTERM');
    bot.stop('SIGTERM');
});