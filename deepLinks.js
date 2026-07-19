import { showMainReplyKeyboard } from './mainMenu.js';

const SCENE_ALIASES = {
    first: 'first_scene',
    branch_first: 'first_scene',

    second: 'second_scene',
    branch_second: 'second_scene',

    third: 'thirty_scene',
    thirty: 'thirty_scene',
    branch_third: 'thirty_scene',
    branch_thirty: 'thirty_scene',
};

export function getStartPayload(ctx) {
    const text = ctx.message?.text || '';

    if (!text.startsWith('/start')) {
        return '';
    }

    const parts = text.trim().split(/\s+/);

    return parts[1] || '';
}

export function resolveDeepLinkPayload(payload) {
    const cleanPayload = String(payload || '').trim();

    if (!cleanPayload) {
        return null;
    }

    const match = cleanPayload.match(/^(branch_)?(first|second|third|thirty)(?:_(\d+))?$/);

    if (!match) {
        return null;
    }

    const hasBranchPrefix = Boolean(match[1]);
    const branchName = match[2];
    const stepIndexRaw = match[3];

    const alias = hasBranchPrefix
        ? `branch_${branchName}`
        : branchName;

    const sceneId = SCENE_ALIASES[alias];

    if (!sceneId) {
        return null;
    }

    const stepIndex = stepIndexRaw !== undefined
        ? Number(stepIndexRaw)
        : 0;

    return {
        sceneId,
        stepIndex: Number.isFinite(stepIndex) && stepIndex >= 0
            ? stepIndex
            : 0,
        payload: cleanPayload,
    };
}

export function prepareDeepLinkStart(ctx) {
    const payload = getStartPayload(ctx);
    const deepLink = resolveDeepLinkPayload(payload);

    if (!deepLink) {
        delete ctx.session.pendingDeepLink;
        return null;
    }

    ctx.session.pendingDeepLink = deepLink;

    return deepLink;
}

export async function handleDeepLinkStart(ctx) {
    const deepLink = ctx.session?.pendingDeepLink;

    if (!deepLink) {
        return false;
    }

    delete ctx.session.pendingDeepLink;

    // Вход по глубокой ссылке минует главное меню,
    // поэтому отдельно показываем нижнюю кнопку.
    await showMainReplyKeyboard(ctx);

    await ctx.scene.enter(deepLink.sceneId, {
        reset: true,
        startIndex: deepLink.stepIndex,
        fromDeepLink: true,
        payload: deepLink.payload,
    });

    return true;
}