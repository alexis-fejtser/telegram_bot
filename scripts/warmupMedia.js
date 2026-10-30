import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { connectDB } from '../src/services/db.js';
import { syncAssetsFromDB } from '../src/services/mediaStore.js';
import { loadSettings, getSettings } from '../src/services/settingsService.js';
import { createTelegramAgent, attachTelegramRetry } from '../src/services/telegramTransport.js';
import { applyTelegrafMultipartFix } from '../src/services/telegrafMultipartFix.js';
import { warmupMediaCache } from '../src/services/mediaWarmup.js';
import { createModuleLogger } from '../src/config/logger.js';

const log = createModuleLogger('script:warmupMedia');

async function main() {
    try {
        console.log('🔥 Инициализация скрипта прогрева медиа в file-id кэш...');

        applyTelegrafMultipartFix();

        await connectDB();
        await syncAssetsFromDB();
        await loadSettings();

        const settings = getSettings();
        const botToken = settings.botToken || process.env.BOT_TOKEN;
        const managerId = settings.managerId || process.env.MANAGER_ID;

        if (!botToken) {
            console.error('❌ Ошибка: токен бота не задан (BOT_TOKEN в .env или настройки в БД)');
            process.exit(1);
        }

        if (!managerId) {
            console.error('❌ Ошибка: MANAGER_ID не задан. Укажите MANAGER_ID в .env или панели настроек.');
            process.exit(1);
        }

        const force = process.argv.includes('--force') || process.argv.includes('-f');

        console.log(`🤖 Создание экземпляра бота для MANAGER_ID: ${managerId} (force: ${force})`);

        const telegramAgent = createTelegramAgent();
        const bot = new Telegraf(botToken, {
            telegram: {
                agent: telegramAgent,
                attachmentAgent: telegramAgent,
            },
        });
        attachTelegramRetry(bot.telegram);

        const botInfo = await bot.telegram.getMe();
        console.log(`✅ Подключено к боту: @${botInfo.username} (${botInfo.id})`);

        const result = await warmupMediaCache({
            bot,
            managerId,
            force,
            delayMs: 800,
            onProgress: ({ current, total, item, result: itemRes }) => {
                const icon = itemRes.status === 'warmed' ? '🔥' : itemRes.status === 'skipped' ? '⏩' : '❌';
                const detail = itemRes.fileId ? `file_id: ${itemRes.fileId.slice(0, 20)}...` : (itemRes.error || itemRes.reason);
                console.log(`[${current}/${total}] ${icon} ${item.key} (${item.mediaType}): ${detail}`);
            },
        });

        console.log('\n=========================================');
        console.log('🎉 ПРОГРЕВ МЕДИАФАЙЛОВ ЗАВЕРШЁН!');
        console.log(`📦 Всего элементов: ${result.total}`);
        console.log(`🔥 Успешно прогрето (новые file_id): ${result.warmed}`);
        console.log(`⏩ Пропущено (уже в кэше): ${result.skipped}`);
        console.log(`❌ Ошибок: ${result.failed}`);
        console.log('=========================================\n');

        process.exit(0);
    } catch (err) {
        console.error('❌ Фатальная ошибка прогрева медиа:', err.message);
        if (err.stack) console.error(err.stack);
        process.exit(1);
    }
}

main();

