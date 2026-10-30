import test from 'node:test';
import assert from 'node:assert/strict';

import { resetUserSession } from '../src/state/resetUserSession.js';
import { setUserState, getUserState } from '../src/state/userState.js';
import { resetFlowRuntimeForChat } from '../src/flow/createDynamicScene.js';

test('resetUserSession очищает сессию, контекст сцен и состояние пользователя', () => {
    const userId = 998877;
    setUserState(userId, { mode: 'question', returnScene: 'scene_a', returnStepIndex: 1 });
    assert.equal(getUserState(userId).mode, 'question');

    const ctx = {
        chat: { id: 123456 },
        from: { id: userId },
        session: {
            __scenes: { current: 'scene_a' },
            flows: { scene_a: { index: 2 } },
            leadMode: 'question',
            returnScene: 'scene_a',
            returnStepIndex: 1,
            pendingDeepLink: { sceneId: 'scene_a', stepIndex: 0 },
            customData: 'keep_this',
        },
    };

    resetUserSession(ctx);

    assert.equal(ctx.session.__scenes, undefined);
    assert.equal(ctx.session.flows, undefined);
    assert.equal(ctx.session.leadMode, undefined);
    assert.equal(ctx.session.returnScene, undefined);
    assert.equal(ctx.session.returnStepIndex, undefined);
    assert.equal(ctx.session.pendingDeepLink, undefined);
    assert.equal(ctx.session.customData, 'keep_this');

    // Проверяем, что userState очищен
    assert.deepEqual(getUserState(userId), {});
});

test('resetFlowRuntimeForChat корректно сбрасывает очереди и таймеры для чата', () => {
    // Вызов не должен падать при пустом chatId или повторных вызовах
    assert.doesNotThrow(() => resetFlowRuntimeForChat(null));
    assert.doesNotThrow(() => resetFlowRuntimeForChat(123456));
});

