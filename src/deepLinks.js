import { Scene } from './models/Scene.js';
import { ensureSceneRegistered } from './flow/sceneRegistry.js';

export function getStartPayload(ctx) {
    const text = ctx.message?.text || '';

    if (!text.startsWith('/start')) {
        return '';
    }

    const parts = text.trim().split(/\s+/);

    return parts[1] || '';
}

export async function resolveDeepLinkPayload(payload) {
    const cleanPayload = String(payload || '').trim();

    if (!cleanPayload) {
        return null;
    }

    const parts = cleanPayload.split('_');
    let stepIndex = 0;
    let baseQuery = cleanPayload;

    const lastPart = parts[parts.length - 1];
    if (parts.length > 1 && /^\d+$/.test(lastPart)) {
        stepIndex = Number(lastPart);
        baseQuery = parts.slice(0, -1).join('_');
    }

    // Query MySQL for matching scene by sceneId or aliases
    let scene = await Scene.findOne({
        where: {
            sceneId: baseQuery,
            isActive: true,
        },
    });

    if (!scene) {
        const activeScenes = await Scene.findAll({
            where: { isActive: true },
        });
        scene = activeScenes.find((s) => Array.isArray(s.aliases) && s.aliases.includes(baseQuery)) || null;
    }

    if (!scene) {
        return null;
    }

    return {
        sceneId: scene.sceneId,
        stepIndex: Number.isFinite(stepIndex) && stepIndex >= 0
            ? stepIndex
            : 0,
        payload: cleanPayload,
    };
}

export async function prepareDeepLinkStart(ctx) {
    const payload = getStartPayload(ctx);
    const deepLink = await resolveDeepLinkPayload(payload);

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

    const isAvailable = await ensureSceneRegistered(deepLink.sceneId);

    if (!isAvailable) {
        return false;
    }

    await ctx.scene.enter(deepLink.sceneId, {
        reset: true,
        startIndex: deepLink.stepIndex,
        fromDeepLink: true,
        payload: deepLink.payload,
    });

    return true;
}
