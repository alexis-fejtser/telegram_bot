import { session } from 'telegraf';

import { logger } from './config/logger.js';
import { showMainMenu } from './mainMenu.js';
import { resetUserSession } from './state/resetUserSession.js';

import {
    handleDeepLinkStart,
    prepareDeepLinkStart,
    getStartPayload,
} from './deepLinks.js';
import { handleQuestionMessage } from './actions.js';
import { trackUser, logActivity } from './services/tracker.js';
import { User } from './models/User.js';
import { getSettings } from './services/settingsService.js';
import { warmupMediaCache } from './services/mediaWarmup.js';

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

/**
 * Регистрирует все базовые хэндлеры бота.
 * Вызывается из bootstrap() ДО подключения stage.middleware()
 * и ДО registerSceneActions(bot).
 */
export function registerHandlers(botInstance) {
    // ERROR HANDLER
    botInstance.catch((error, ctx) => {
        logger.error('❌ BOT ERROR:', {
            message: error.message,
            stack: error.stack,
            updateType: ctx?.updateType,
            chatId: ctx?.chat?.id,
            userId: ctx?.from?.id,
            update: ctx?.update,
        });
    });

    // UPDATE LOGGING MIDDLEWARE
    botInstance.use(async (ctx, next) => {
        logger.info('📨 update', {
            userId: ctx.from?.id,
            chatId: ctx.chat?.id,
            updateType: ctx.updateType,
            text: ctx.message?.text || null,
            callbackData: ctx.callbackQuery?.data || null,
        });

        return next();
    });

    // GLOBAL USER TRACKING MIDDLEWARE
    // Фиксирует в базе любого пользователя при любом взаимодействии с ботом
    // (текст, команды, inline-кнопки, кнопка "🏠 Главное меню" и т.д.).
    // Это позволяет собирать старых пользователей, которые были запущены
    // до появления базы данных: достаточно любого их действия в боте.
    botInstance.use(async (ctx, next) => {
        if (ctx.from && !ctx.from.is_bot) {
            const memberStatus = ctx.myChatMember?.new_chat_member?.status;
            const isBlockedEvent = memberStatus === 'kicked' || memberStatus === 'left';

            // События блокировки обрабатываются отдельным my_chat_member-хэндлером,
            // чтобы не помечать заблокировавшего бота пользователя как активного.
            if (!isBlockedEvent) {
                await trackUser(ctx);
            }
        }

        return next();
    });

    // MIDDLEWARE ORDER
    botInstance.use(session());

    botInstance.use(async (ctx, next) => {
        if (isResetCommand(ctx)) {
            resetUserSession(ctx);

            if (ctx.message?.text?.startsWith('/start')) {
                await prepareDeepLinkStart(ctx);
            }
        }

        return next();
    });

    // COMMANDS & CHAT MEMBER STATUS
    botInstance.on('my_chat_member', async (ctx) => {
        try {
            const newStatus = ctx.myChatMember?.new_chat_member?.status;
            const telegramId = ctx.from?.id;
            if (!telegramId || !newStatus) return;

            if (newStatus === 'kicked' || newStatus === 'left') {
                await User.update(
                    { status: 'blocked', statusUpdatedAt: new Date() },
                    { where: { telegramId } }
                );
                await logActivity(telegramId, 'bot_blocked', { reason: newStatus });
                logger.info(`🚫 User ${telegramId} blocked/left the bot (${newStatus})`);
            } else if (newStatus === 'member') {
                // upsert: если пользователь пришёл впервые через разблокировку,
                // trackUser создаст запись в БД, а не только обновит существующую.
                await trackUser(ctx, { status: 'active' });
                await logActivity(telegramId, 'bot_unblocked', {});
                logger.info(`✅ User ${telegramId} unblocked/joined the bot`);
            }
        } catch (error) {
            logger.error('Error handling my_chat_member:', { message: error.message });
        }
    });

    botInstance.start(async (ctx) => {
        const payload = getStartPayload(ctx);

        await trackUser(ctx, {
            currentScene: null,
            currentStep: 0,
            payload: payload || null,
        });

        await logActivity(ctx.from.id, payload ? 'deeplink_start' : 'bot_start', {
            payload: payload || null,
        });

        const handledDeepLink = await handleDeepLinkStart(ctx);

        if (handledDeepLink) {
            return;
        }

        await showMainMenu(ctx);
    });

    botInstance.command('menu', async (ctx) => {
        await logActivity(ctx.from.id, 'menu_opened', {});
        await showMainMenu(ctx);
    });

    botInstance.command('exit', async (ctx) => {
        await showMainMenu(ctx);
    });

    // WARMUP MEDIA COMMAND ДЛЯ МЕНЕДЖЕРА
    botInstance.command(['warmup', 'warmup_media'], async (ctx) => {
        try {
            const settings = getSettings();
            const managerId = settings.managerId || process.env.MANAGER_ID;
            const senderId = String(ctx.from?.id);

            if (!managerId || senderId !== String(managerId)) {
                return ctx.reply('⛔ Команда прогрева доступна только менеджеру бота.');
            }

            const text = ctx.message?.text || '';
            const force = text.includes('force');

            await ctx.reply(`🔥 Запуск прогрева медиа в file-id кэш... (принудительно: ${force ? 'да' : 'нет'})`);

            const result = await warmupMediaCache({
                bot: botInstance,
                managerId,
                force,
            });

            await ctx.reply(
                `📊 <b>Прогрев завершён:</b>\n` +
                `• Всего элементов: ${result.total}\n` +
                `• 🔥 Прогрето: ${result.warmed}\n` +
                `• ⏩ Уже в кэше: ${result.skipped}\n` +
                `• ❌ Ошибок: ${result.failed}`,
                { parse_mode: 'HTML' }
            );
        } catch (error) {
            logger.error('Ошибка при выполнении /warmup:', { message: error.message });
            await ctx.reply(`❌ Ошибка прогрева: ${error.message}`);
        }
    });

    botInstance.hears('🏠 Главное меню', async (ctx) => {
        await logActivity(ctx.from.id, 'menu_opened', {});
        await showMainMenu(ctx);
    });

    botInstance.on('text', async (ctx) => {
        const questionResult = await handleQuestionMessage(ctx);

        if (questionResult.handled) {
            return;
        }

        await ctx.reply(
            'Выберите сценарий в меню или нажмите /menu.'
        );
    });
}
