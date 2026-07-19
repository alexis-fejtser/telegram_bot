import { Scenes } from 'telegraf';

import {
    LEAD_NEXT_DELAY_MS,
    STEP_DELAY_MS,
    STEP_TIMEOUT_MS,
} from '../config.js';

import { showMainMenu } from '../mainMenu.js';

import {
    handleQuestionMessage,
    sendConsultationPhone,
    startQuestionFlow,
} from '../actions.js';

import {
    getMediaKey,
    getMediaSource,
    invalidateCachedFileId,
    isWrongTelegramFileIdentifierError,
    rememberTelegramFileId,
} from '../services/mediaStore.js';

import {
    getStartPayload,
    resolveDeepLinkPayload,
} from '../deepLinks.js';

import { deleteUserState } from '../state/userState.js';

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
        ctx.session.flows[sceneId] = {
            index: 0,
        };
    }

    return ctx.session.flows[sceneId];
}

function normalizeStepIndex(index, maxIndex) {
    const numericIndex = Number(index);

    if (!Number.isFinite(numericIndex)) {
        return 0;
    }

    if (numericIndex < 0) {
        return 0;
    }

    if (numericIndex > maxIndex) {
        return maxIndex;
    }

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

    if (timer) {
        clearTimeout(timer);
    }

    timers.delete(key);
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

async function delayWithCancel(ms, isActive) {
    const interval = 200;
    let passed = 0;

    while (passed < ms) {
        if (!isActive()) {
            return false;
        }

        const currentDelay = Math.min(interval, ms - passed);

        await delay(currentDelay);

        passed += currentDelay;
    }

    return isActive();
}

async function enqueue(chatId, task) {
    const currentQueue = sendQueues.get(chatId) || Promise.resolve();

    const nextQueue = currentQueue
        .catch(() => {})
        .then(task);

    sendQueues.set(chatId, nextQueue);

    return nextQueue;
}

function buildMessageOptions(message) {
    const keyboard = message.keyboard || undefined;
    const caption = message.caption || message.text || '';
    const parseMode = message.parseMode || undefined;

    return {
        caption,
        parse_mode: parseMode,
        ...(keyboard || {}),
    };
}

async function sendPhotoWithFallback(ctx, message) {
    const key = getMediaKey(message);

    try {
        const response = await ctx.replyWithPhoto(
            getMediaSource(message, { preferCache: true }),
            buildMessageOptions(message)
        );

        rememberTelegramFileId(message, response);

        return response;
    } catch (error) {
        if (!isWrongTelegramFileIdentifierError(error)) {
            throw error;
        }

        console.warn(`⚠️ Telegram rejected cached photo file_id. Fallback to local file: ${key}`);

        invalidateCachedFileId(key);

        const response = await ctx.replyWithPhoto(
            getMediaSource(message, { preferCache: false }),
            buildMessageOptions(message)
        );

        rememberTelegramFileId(message, response);

        return response;
    }
}

async function sendVideoWithFallback(ctx, message) {
    const key = getMediaKey(message);

    try {
        const response = await ctx.replyWithVideo(
            getMediaSource(message, { preferCache: true }),
            buildMessageOptions(message)
        );

        rememberTelegramFileId(message, response);

        return response;
    } catch (error) {
        if (!isWrongTelegramFileIdentifierError(error)) {
            throw error;
        }

        console.warn(`⚠️ Telegram rejected cached video file_id. Fallback to local file: ${key}`);

        invalidateCachedFileId(key);

        const response = await ctx.replyWithVideo(
            getMediaSource(message, { preferCache: false }),
            buildMessageOptions(message)
        );

        rememberTelegramFileId(message, response);

        return response;
    }
}

async function sendVideoNoteWithFallback(ctx, message) {
    const key = getMediaKey(message);
    const keyboard = message.keyboard || undefined;

    try {
        const response = await ctx.replyWithVideoNote(
            getMediaSource(message, { preferCache: true }),
            keyboard
        );

        rememberTelegramFileId(message, response);

        return response;
    } catch (error) {
        if (!isWrongTelegramFileIdentifierError(error)) {
            throw error;
        }

        console.warn(`⚠️ Telegram rejected cached videoNote file_id. Fallback to local file: ${key}`);

        invalidateCachedFileId(key);

        const response = await ctx.replyWithVideoNote(
            getMediaSource(message, { preferCache: false }),
            keyboard
        );

        rememberTelegramFileId(message, response);

        return response;
    }
}

async function sendMessage(ctx, message) {
    const keyboard = message.keyboard || undefined;
    const parseMode = message.parseMode || undefined;

    let response = null;

    switch (message.type) {
        case 'copy':
            response = await ctx.telegram.copyMessage(
                ctx.chat.id,
                message.fromChatId,
                message.messageId,
                {
                    ...(keyboard || {}),
                }
            );
            break;

        case 'photo':
            response = await sendPhotoWithFallback(ctx, message);
            break;

        case 'video':
            response = await sendVideoWithFallback(ctx, message);
            break;

        case 'videoNote':
            response = await sendVideoNoteWithFallback(ctx, message);
            break;

        case 'text':
            response = await ctx.reply(
                message.text,
                {
                    parse_mode: parseMode,
                    ...(keyboard || {}),
                }
            );
            break;

        default:
            console.warn(`Unknown message type: ${message.type}`);
            break;
    }

    return response;
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

function hardResetInsideScene(ctx) {
    if (ctx.chat?.id) {
        resetFlowRuntimeForChat(ctx.chat.id);
    }

    if (!ctx.session) {
        ctx.session = {};
    }

    delete ctx.session.__scenes;
    delete ctx.session.flows;

    delete ctx.session.firstSceneStepIndex;
    delete ctx.session.secondSceneStepIndex;
    delete ctx.session.thirtySceneStepIndex;

    delete ctx.session.leadMode;
    delete ctx.session.returnScene;
    delete ctx.session.returnStepIndex;
    delete ctx.session.pendingDeepLink;

    if (ctx.from?.id) {
        deleteUserState(ctx.from.id);
    }
}

export function createFlowScene({ sceneId, steps }) {
    const scene = new Scenes.BaseScene(sceneId);

    async function renderStep(ctx, index) {
        const chatId = ctx.chat.id;
        const step = steps[index];

        clearTimer(chatId, sceneId);

        if (!step) {
            delete ctx.session.flows?.[sceneId];
            return ctx.scene.leave();
        }

        setFlowIndex(ctx, sceneId, index);

        const token = createRenderToken(chatId, sceneId);

        await enqueue(chatId, async () => {
            for (let i = 0; i < step.messages.length; i++) {
                if (!isActiveRender(chatId, sceneId, token)) {
                    return;
                }

                const message = step.messages[i];

                if (i !== 0) {
                    const stillActive = await delayWithCancel(
                        STEP_DELAY_MS,
                        () => isActiveRender(chatId, sceneId, token)
                    );

                    if (!stillActive) {
                        return;
                    }
                }

                if (!isActiveRender(chatId, sceneId, token)) {
                    return;
                }

                await sendMessage(ctx, message);
            }
        });

        if (!isActiveRender(chatId, sceneId, token)) {
            return false;
        }

        const timer = setTimeout(async () => {
            try {
                if (isActiveRender(chatId, sceneId, token)) {
                    await goNext(ctx);
                }
            } catch (error) {
                console.error('Auto-next error:', error);
            }
        }, STEP_TIMEOUT_MS);

        timers.set(getRuntimeKey(chatId, sceneId), timer);

        return true;
    }

    async function renderCurrentStep(ctx) {
        const state = getFlowState(ctx, sceneId);
        return renderStep(ctx, state.index || 0);
    }

    async function goNext(ctx) {
        const chatId = ctx.chat.id;
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

    function hasNextStep(ctx) {
        const state = getFlowState(ctx, sceneId);
        const currentIndex = state.index || 0;

        return currentIndex + 1 < steps.length;
    }

    async function goNextAfterLeadDelay(ctx, token) {
        const chatId = ctx.chat.id;

        const stillActive = await delayWithCancel(
            LEAD_NEXT_DELAY_MS,
            () => isActiveRender(chatId, sceneId, token)
        );

        if (!stillActive) {
            return;
        }

        if (!hasNextStep(ctx)) {
            delete ctx.session.flows?.[sceneId];
            await ctx.scene.leave();
            return;
        }

        await goNext(ctx);
    }

    async function handleStartInsideScene(ctx) {
        const payload = getStartPayload(ctx);
        const deepLink = resolveDeepLinkPayload(payload);

        hardResetInsideScene(ctx);

        await ctx.scene.leave();

        if (deepLink) {
            return ctx.scene.enter(deepLink.sceneId, {
                reset: true,
                startIndex: deepLink.stepIndex,
                fromDeepLink: true,
                payload: deepLink.payload,
            });
        }

        return showMainMenu(ctx);
    }

    async function handleMenuInsideScene(ctx) {
        hardResetInsideScene(ctx);
        await ctx.scene.leave();
        return showMainMenu(ctx);
    }

    scene.enter(async (ctx) => {
        const maxIndex = Math.max(steps.length - 1, 0);

        const startIndexFromDeepLink = ctx.scene.state?.startIndex;
        const shouldUseDeepLinkIndex = startIndexFromDeepLink !== undefined;

        const initialIndex = shouldUseDeepLinkIndex
            ? normalizeStepIndex(startIndexFromDeepLink, maxIndex)
            : ctx.scene.state?.reset === false
                ? getFlowState(ctx, sceneId).index || 0
                : 0;

        setFlowIndex(ctx, sceneId, initialIndex);

        return renderStep(ctx, initialIndex);
    });

    scene.leave((ctx) => {
        clearTimer(ctx.chat.id, sceneId);
        createRenderToken(ctx.chat.id, sceneId);
    });

    // ВАЖНО:
    // Эти команды нужны внутри сцены.
    // Иначе активная сцена ловит /start как обычный текст.
    scene.command('start', async (ctx) => {
        return handleStartInsideScene(ctx);
    });

    scene.command('menu', async (ctx) => {
        return handleMenuInsideScene(ctx);
    });

    scene.command('exit', async (ctx) => {
        return handleMenuInsideScene(ctx);
    });

    scene.command('stop', async (ctx) => {
        return handleMenuInsideScene(ctx);
    });

    scene.action('next', async (ctx) => {
        await ctx.answerCbQuery();
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
        await ctx.answerCbQuery();
        return handleMenuInsideScene(ctx);
    });

    scene.hears('🏠 Главное меню', async (ctx) => {
        return handleMenuInsideScene(ctx);
    });

    scene.on('text', async (ctx) => {
        const text = ctx.message?.text || '';

        // Дополнительная страховка, если scene.command по какой-то причине не сработал
        if (text.startsWith('/start')) {
            return handleStartInsideScene(ctx);
        }

        if (
            text.startsWith('/menu') ||
            text.startsWith('/exit') ||
            text.startsWith('/stop')
        ) {
            return handleMenuInsideScene(ctx);
        }

        const result = await handleQuestionMessage(ctx);

        if (result.handled) {
            if (result.shouldGoNext && result.returnScene === sceneId) {
                const token = createRenderToken(ctx.chat.id, sceneId);

                return goNextAfterLeadDelay(ctx, token);
            }

            if (result.returnScene && result.returnScene !== sceneId) {
                return ctx.scene.enter(result.returnScene, {
                    reset: false,
                });
            }

            return;
        }

        if (text === '🏠 Главное меню') {
            return handleMenuInsideScene(ctx);
        }

        return ctx.reply(
            'Выберите действие под сообщением или нажмите "🏠 Главное меню".'
        );
    });

    return scene;
}