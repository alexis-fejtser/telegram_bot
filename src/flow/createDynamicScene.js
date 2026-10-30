import { Scenes, Markup } from 'telegraf';
import { showMainMenu, SCENE_UNAVAILABLE_TEXT } from '../mainMenu.js';
import { ensureSceneRegistered } from './sceneRegistry.js';
import { Scene } from '../models/Scene.js';
import { BOT_SETTINGS } from '../config/config.js';
import { getSettings } from '../services/settingsService.js';
import { handleQuestionMessage, sendConsultationPhone, startQuestionFlow } from '../actions.js';
import { getMediaKey, getMediaSource, invalidateCachedFileId, isWrongTelegramFileIdentifierError, rememberTelegramFileId } from '../services/mediaStore.js';
import { getStartPayload, resolveDeepLinkPayload } from '../deepLinks.js';
import { trackUser, logActivity } from '../services/tracker.js';
import { createModuleLogger } from '../config/logger.js';

const log = createModuleLogger('createDynamicScene');

const timers = new Map();
const sendQueues = new Map();
const renderTokens = new Map();

function getRuntimeKey(chatId, sceneId) {
    return `${chatId}:${sceneId}`;
}

function getFlowState(ctx, sceneId) {
    if (!ctx.session.flows) {
        ctx.session.flows = {};
    }
    if (!ctx.session.flows[sceneId]) {
        ctx.session.flows[sceneId] = { index: 0 };
    }
    return ctx.session.flows[sceneId];
}

function normalizeStepIndex(index, maxIndex) {
    const numericIndex = Number(index);
    if (!Number.isFinite(numericIndex) || numericIndex < 0) return 0;
    if (numericIndex > maxIndex) return maxIndex;
    return Math.floor(numericIndex);
}

function setFlowIndex(ctx, sceneId, index) {
    const state = getFlowState(ctx, sceneId);
    state.index = index;
    return state;
}

function clearTimer(chatId, sceneId) {
    const key = getRuntimeKey(chatId, sceneId);
    const timer = timers.get(key);
    if (timer) clearTimeout(timer);
    timers.delete(key);
}

export function resetFlowRuntimeForChat(chatId) {
    if (!chatId) return;

    const prefix = `${chatId}:`;

    for (const [key, timer] of timers.entries()) {
        if (key.startsWith(prefix)) {
            clearTimeout(timer);
            timers.delete(key);
        }
    }

    for (const key of renderTokens.keys()) {
        if (key.startsWith(prefix)) {
            renderTokens.set(key, (renderTokens.get(key) || 0) + 1);
        }
    }

    sendQueues.delete(chatId);
}

function createRenderToken(chatId, sceneId) {
    const key = getRuntimeKey(chatId, sceneId);
    const nextToken = (renderTokens.get(key) || 0) + 1;
    renderTokens.set(key, nextToken);
    return nextToken;
}

function isActiveRender(chatId, sceneId, token) {
    const key = getRuntimeKey(chatId, sceneId);
    return renderTokens.get(key) === token;
}

async function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(fn, retries = 3, delayMs = 1500) {
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            const description = error?.response?.description || error?.description || error?.message || '';
            const isNetworkError = 
                description.includes('socket hang up') ||
                description.includes('ECONNRESET') ||
                description.includes('ETIMEDOUT') ||
                error.code === 'ETIMEDOUT' ||
                error.code === 'ECONNRESET' ||
                error.name === 'FetchError';

            if (!isNetworkError && !isWrongTelegramFileIdentifierError(error)) {
                throw error;
            }

            if (attempt === retries) throw lastError;

            await delay(delayMs);
        }
    }
    throw lastError;
}

async function enqueue(chatId, task) {
    const currentQueue = sendQueues.get(chatId) || Promise.resolve();
    const nextQueue = currentQueue.catch(() => {}).then(task);
    sendQueues.set(chatId, nextQueue);
    return nextQueue;
}

function buildKeyboard(buttonsDef) {
    if (!buttonsDef || !buttonsDef.length) return undefined;
    const rows = buttonsDef.map((row) =>
        row.map((btn) => Markup.button.callback(btn.text, btn.action))
    );
    return Markup.inlineKeyboard(rows);
}

function buildMessageOptions(message, options) {
    // Инлайн-кнопки допустимы только у последнего сообщения в шаге
    const keyboard = options.allowInlineKeyboard === false ? undefined : buildKeyboard(message.buttons);
    const caption = message.caption || message.text || '';
    const parseMode = message.parseMode || undefined;
    const replyKeyboard =
        options.isFirstMessage && BOT_SETTINGS.replyKeyboard.enabled
            ? {
                reply_markup: {
                    keyboard: BOT_SETTINGS.replyKeyboard.keyboard,
                    resize_keyboard: true,
                    is_persistent: true,
                }
              }
            : {};

    return {
        caption,
        parse_mode: parseMode,
        ...(keyboard || {}),
        ...replyKeyboard,
    };
}

async function sendMessage(ctx, message, options = {}) {
    // Инлайн-кнопки допустимы только у последнего сообщения в шаге
    const keyboard = options.allowInlineKeyboard === false ? undefined : buildKeyboard(message.buttons);
    const replyKeyboard =
        options.isFirstMessage && BOT_SETTINGS.replyKeyboard.enabled
            ? {
                reply_markup: {
                    keyboard: BOT_SETTINGS.replyKeyboard.keyboard,
                    resize_keyboard: true,
                    is_persistent: true,
                }
              }
            : {};
    const parseMode = message.parseMode || undefined;
    let response = null;

    switch (message.type) {
        case 'photo':
            response = await withRetry(async () => {
                try {
                    return await ctx.replyWithPhoto(getMediaSource(message, { preferCache: true }), buildMessageOptions(message, options));
                } catch (error) {
                    if (!isWrongTelegramFileIdentifierError(error)) throw error;
                    invalidateCachedFileId(getMediaKey(message));
                    return await ctx.replyWithPhoto(getMediaSource(message, { preferCache: false }), buildMessageOptions(message, options));
                }
            });
            break;

        case 'video':
            response = await withRetry(async () => {
                try {
                    return await ctx.replyWithVideo(getMediaSource(message, { preferCache: true }), buildMessageOptions(message, options));
                } catch (error) {
                    if (!isWrongTelegramFileIdentifierError(error)) throw error;
                    invalidateCachedFileId(getMediaKey(message));
                    return await ctx.replyWithVideo(getMediaSource(message, { preferCache: false }), buildMessageOptions(message, options));
                }
            });
            break;

        case 'videoNote':
            response = await withRetry(async () => {
                try {
                    return await ctx.replyWithVideoNote(
                        getMediaSource(message, { preferCache: true }),
                        { ...(keyboard?.reply_markup ? { reply_markup: keyboard.reply_markup } : {}), ...replyKeyboard }
                    );
                } catch (error) {
                    if (!isWrongTelegramFileIdentifierError(error)) throw error;
                    invalidateCachedFileId(getMediaKey(message));
                    return await ctx.replyWithVideoNote(
                        getMediaSource(message, { preferCache: false }),
                        { ...(keyboard?.reply_markup ? { reply_markup: keyboard.reply_markup } : {}), ...replyKeyboard }
                    );
                }
            });
            break;

        case 'text':
        default:
            const replyMarkup = {
                ...(keyboard?.reply_markup || {}),
                ...(replyKeyboard?.reply_markup || {})
            };
            response = await withRetry(async () => {
                return await ctx.reply(message.text || message.caption || '', {
                    parse_mode: parseMode,
                    ...(Object.keys(replyMarkup).length > 0 ? { reply_markup: replyMarkup } : {})
                });
            });
            break;
    }

    if (response) {
        rememberTelegramFileId(message, response);
    }

    return response;
}

export function createDynamicScene(sceneId) {
    const scene = new Scenes.BaseScene(sceneId);

    async function getSceneSteps() {
        const sceneDoc = await Scene.findOne({
            where: {
                sceneId,
                isActive: true,
            },
        });
        return sceneDoc ? sceneDoc.steps : [];
    }

    async function renderStep(ctx, index) {
        const chatId = ctx.chat.id;
        const steps = await getSceneSteps();
        const step = steps[index];

        clearTimer(chatId, sceneId);

        if (!step) {
            delete ctx.session.flows?.[sceneId];
            return ctx.scene.leave();
        }

        setFlowIndex(ctx, sceneId, index);
        await trackUser(ctx, { currentScene: sceneId, currentStep: index });
        await logActivity(ctx.from?.id, 'step_render', { sceneId, stepIndex: index });

        const token = createRenderToken(chatId, sceneId);

        // Сообщения отправляются в фоне (очередь per chat): обработка update
        // не должна ждать полный рендер шага. Иначе длинные шаги (пауза
        // stepDelayMs между сообщениями + загрузка нового медиа) упираются
        // в Telegraf handlerTimeout (90 c), polling блокируется, а следующие
        // клики получают «query is too old».
        enqueue(chatId, async () => {
            for (let i = 0; i < step.messages.length; i++) {
                if (!isActiveRender(chatId, sceneId, token)) return;
                const message = step.messages[i];

                if (i !== 0) {
                    const stillActive = await delayWithCancel(getSettings().stepDelayMs, () => isActiveRender(chatId, sceneId, token));
                    if (!stillActive) return;
                }

                if (!isActiveRender(chatId, sceneId, token)) return;

                await sendMessage(ctx, message, {
                    isFirstMessage: (index === 0) && (i === 0),
                    // Кнопки выводит только последнее сообщение шага
                    allowInlineKeyboard: i === step.messages.length - 1,
                });
            }

            // Рендер не вытеснен новым (пользователь не переключил ветку) —
            // только после отправки всех сообщений включаем таймер автоперехода.
            if (!isActiveRender(chatId, sceneId, token)) return;

            const timer = setTimeout(async () => {
                try {
                    if (isActiveRender(chatId, sceneId, token)) {
                        await goNext(ctx);
                    }
                } catch (error) {
                    log.error('Auto-next error:', error);
                }
            }, getSettings().stepTimeoutMs);

            timers.set(getRuntimeKey(chatId, sceneId), timer);
        }).catch((error) => {
            log.error('Шаг: ошибка отправки сообщений:', {
                message: error.message,
                sceneId,
                stepIndex: index,
            });
        });

        return true;
    }

    async function goNext(ctx) {
        const chatId = ctx.chat.id;
        const steps = await getSceneSteps();
        const state = getFlowState(ctx, sceneId);
        const nextIndex = (state.index || 0) + 1;

        clearTimer(chatId, sceneId);
        createRenderToken(chatId, sceneId);

        if (nextIndex >= steps.length) {
            delete ctx.session.flows?.[sceneId];
            return ctx.scene.leave();
        }

        return renderStep(ctx, nextIndex);
    }

    async function goNextAfterLeadDelay(ctx, token) {
        const chatId = ctx.chat.id;

        const stillActive = await delayWithCancel(
            getSettings().leadNextDelayMs,
            () => isActiveRender(chatId, sceneId, token)
        );

        if (!stillActive) {
            return;
        }

        const steps = await getSceneSteps();
        const state = getFlowState(ctx, sceneId);
        if ((state.index || 0) + 1 >= steps.length) {
            delete ctx.session.flows?.[sceneId];
            await ctx.scene.leave();
            return;
        }

        await goNext(ctx);
    }

    scene.enter(async (ctx) => {
        const steps = await getSceneSteps();

        // Ветку удалили/очистили уже после регистрации сцены в Stage.
        if (!steps.length) {
            delete ctx.session.flows?.[sceneId];
            await ctx.scene.leave();
            await ctx.reply(SCENE_UNAVAILABLE_TEXT);
            return showMainMenu(ctx);
        }

        const maxIndex = Math.max(steps.length - 1, 0);
        const startIndex = ctx.scene.state?.startIndex !== undefined
            ? normalizeStepIndex(ctx.scene.state.startIndex, maxIndex)
            : 0;

        setFlowIndex(ctx, sceneId, startIndex);
        return renderStep(ctx, startIndex);
    });

    scene.leave((ctx) => {
        if (ctx.chat?.id) {
            clearTimer(ctx.chat.id, sceneId);
            createRenderToken(ctx.chat.id, sceneId);
        }
    });

    scene.command('start', async (ctx) => {
        const payload = getStartPayload(ctx);
        const deepLink = await resolveDeepLinkPayload(payload);
        await ctx.scene.leave();

        if (deepLink && await ensureSceneRegistered(deepLink.sceneId)) {
            return ctx.scene.enter(deepLink.sceneId, {
                reset: true,
                startIndex: deepLink.stepIndex,
                fromDeepLink: true,
                payload: deepLink.payload,
            });
        }
        return showMainMenu(ctx);
    });

    scene.command(['menu', 'exit', 'stop'], async (ctx) => {
        await ctx.scene.leave();
        return showMainMenu(ctx);
    });

    scene.action('next', async (ctx) => {
        try { await ctx.answerCbQuery(); } catch (e) {}
        return goNext(ctx);
    });

    scene.action('lead:question', async (ctx) => {
        const state = getFlowState(ctx, sceneId);
        clearTimer(ctx.chat.id, sceneId);
        createRenderToken(ctx.chat.id, sceneId);
        return startQuestionFlow(ctx, sceneId, state.index || 0);
    });

    scene.action('lead:consultation', async (ctx) => {
        clearTimer(ctx.chat.id, sceneId);
        const token = createRenderToken(ctx.chat.id, sceneId);
        await sendConsultationPhone(ctx);
        return goNextAfterLeadDelay(ctx, token);
    });

    scene.action('main_menu', async (ctx) => {
        try { await ctx.answerCbQuery(); } catch (e) {}
        await ctx.scene.leave();
        return showMainMenu(ctx);
    });

    scene.hears('🏠 Главное меню', async (ctx) => {
        await ctx.scene.leave();
        return showMainMenu(ctx);
    });

    scene.on('text', async (ctx) => {
        const result = await handleQuestionMessage(ctx);
        if (result.handled) {
            if (result.shouldGoNext) {
                // Возвращаемся к тому шагу, с которого был задан вопрос,
                // чтобы пользователь мог продолжить чтение сообщений сцены.
                const returnIndex = result.returnStepIndex ?? 0;
                const token = createRenderToken(ctx.chat.id, sceneId);
                await delayWithCancel(getSettings().leadNextDelayMs, () => isActiveRender(ctx.chat.id, sceneId, token));
                if (isActiveRender(ctx.chat.id, sceneId, token)) {
                    return renderStep(ctx, returnIndex);
                }
                return;
            }
            return;
        }
        return ctx.reply('Выберите действие под сообщением или нажмите "🏠 Главное меню".');
    });

    return scene;
}

async function delayWithCancel(ms, isActive) {
    const interval = 200;
    let passed = 0;
    while (passed < ms) {
        if (!isActive()) return false;
        await delay(Math.min(interval, ms - passed));
        passed += interval;
    }
    return isActive();
}


