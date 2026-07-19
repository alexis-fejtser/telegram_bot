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

import { firstScene } from './scenes/firstScene.js';
import { secondScene } from './scenes/secondScene.js';
import { thirtyScene } from './scenes/thirtyScene.js';

// =====================
// VALIDATION
// =====================
if (!BOT_TOKEN) {
    console.error('Ошибка: переменная BOT_TOKEN не задана в .env');
    process.exit(1);
}

if (!MANAGER_ID) {
    console.warn(
        'Внимание: MANAGER_ID не задан в .env. Функция "Задать вопрос" не сможет отправлять сообщения менеджеру.'
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
            .outputOptions([
                '-vf crop=iw:iw:0:(ih-iw)/2,scale=640:640',
                '-vcodec libx264',
                '-crf 28',
                '-acodec aac',
                '-b:a 128k',
            ])
            .save(outputPath)
            .on('end', () => {
                console.log('Видео успешно кадрировано в квадрат и сжато.');
                resolve(outputPath);
            })
            .on('error', (error) => {
                console.error('Ошибка сжатия видео:', error.message);
                reject(error);
            });
    });
}

// =====================
// MIDDLEWARE ORDER
// =====================
bot.use(session());

// ВАЖНО:
// Эти команды должны быть ДО stage.middleware(),
// иначе активная сцена может перехватить /start и вернуть старое состояние.

bot.command('menu', async (ctx) => {
    resetUserSession(ctx);
    await showMainMenu(ctx);
});

bot.command('exit', async (ctx) => {
    resetUserSession(ctx);
    await showMainMenu(ctx);
});

bot.hears('🏠 Главное меню', async (ctx) => {
    resetUserSession(ctx);
    await showMainMenu(ctx);
});

// Сцены подключаем после команд сброса
bot.use(stage.middleware());
bot.start(async (ctx) => {
    resetUserSession(ctx);

    const payload = ctx.startPayload;

    // Проверяем, пришел ли пользователь по глубокой ссылке
    if (payload) {
        if (payload === 'first_scene') {
            return ctx.scene.enter('first_scene'); // ID, указанный внутри createFlowScene
        }
        if (payload === 'second_scene') {
            return ctx.scene.enter('second_scene');
        }
        if (payload === 'thirty_scene') {
            return ctx.scene.enter('thirty_scene'); // Проверьте точный ID в файле thirtyScene.js
        }
    }
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
// ERROR HANDLER
// =====================
bot.catch((error, ctx) => {
    console.error('Bot error:', {
        error,
        updateType: ctx?.updateType,
        chatId: ctx?.chat?.id,
        userId: ctx?.from?.id,
    });
});

// =====================
// BOOTSTRAP
// =====================
async function bootstrap() {
    try {
        if (SHOULD_COMPRESS_VIDEO_ON_START) {
            await compressVideo(HEAVY_VIDEO_PATH, COMPRESSED_VIDEO_PATH);
        }

        await bot.launch();

        console.log('Бот запущен и готов к работе.');
    } catch (error) {
        console.error('Критическая ошибка при запуске бота:', error);
        process.exit(1);
    }
}

bootstrap();

// =====================
// GRACEFUL STOP
// =====================
process.once('SIGINT', () => {
    console.log('Остановка бота: SIGINT');
    bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
    console.log('Остановка бота: SIGTERM');
    bot.stop('SIGTERM');
});