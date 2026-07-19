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
    getMediaSource,
    rememberTelegramFileId,
} from '../services/mediaStore.js';

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

async function sendMessage(ctx, message) {
    const keyboard = message.keyboard || undefined;
    const caption = message.caption || message.text || '';
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
            response = await ctx.replyWithPhoto(
                getMediaSource(message),
                {
                    caption,
                    parse_mode: parseMode,
                    ...(keyboard || {}),
                }
            );
            break;

        case 'video':
            response = await ctx.replyWithVideo(
                getMediaSource(message),
                {
                    caption,
                    parse_mode: parseMode,
                    ...(keyboard || {}),
                }
            );
            break;

        case 'videoNote':
            response = await ctx.replyWithVideoNote(
                getMediaSource(message),
                keyboard
            );
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

    if (message.type !== 'copy') {
        rememberTelegramFileId(message, response);
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

        if (ctx.message.text === '🏠 Главное меню') {
            await ctx.scene.leave();
            return showMainMenu(ctx);
        }

        return ctx.reply(
            'Выберите действие под сообщением или нажмите "🏠 Главное меню".'
        );
    });

    return scene;
}