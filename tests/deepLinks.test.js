import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Scenes } from 'telegraf';

import { clearDatabase, connectTestDb, disconnectTestDb } from './helpers/db.js';
import { Scene } from '../src/models/Scene.js';
import { attachSceneStage } from '../src/flow/sceneRegistry.js';
import {
    getStartPayload,
    resolveDeepLinkPayload,
    prepareDeepLinkStart,
    handleDeepLinkStart,
} from '../src/deepLinks.js';

before(async () => {
    await connectTestDb();
});

beforeEach(async () => {
    await clearDatabase();
});

after(async () => {
    await disconnectTestDb();
});

test('getStartPayload извлекает параметр команды /start', () => {
    assert.equal(getStartPayload({ message: { text: '/start' } }), '');
    assert.equal(getStartPayload({ message: { text: '/start promo_1' } }), 'promo_1');
    assert.equal(getStartPayload({ message: { text: '/start    my_scene_3   ' } }), 'my_scene_3');
    assert.equal(getStartPayload({ message: { text: '/help promo_1' } }), '');
    assert.equal(getStartPayload({}), '');
});

test('resolveDeepLinkPayload резолвит сцену по sceneId и извлекает stepIndex', async () => {
    await Scene.create({
        sceneId: 'intro_scene',
        title: 'Вводная сцена',
        isActive: true,
        steps: [{ stepIndex: 0, messages: [] }, { stepIndex: 1, messages: [] }],
    });

    const direct = await resolveDeepLinkPayload('intro_scene');
    assert.deepEqual(direct, {
        sceneId: 'intro_scene',
        stepIndex: 0,
        payload: 'intro_scene',
    });

    const withStep = await resolveDeepLinkPayload('intro_scene_1');
    assert.deepEqual(withStep, {
        sceneId: 'intro_scene',
        stepIndex: 1,
        payload: 'intro_scene_1',
    });

    const invalid = await resolveDeepLinkPayload('unknown_scene');
    assert.equal(invalid, null);

    const empty = await resolveDeepLinkPayload('');
    assert.equal(empty, null);
});

test('resolveDeepLinkPayload резолвит сцену по aliases', async () => {
    await Scene.create({
        sceneId: 'target_scene',
        title: 'Сцена с алиасами',
        aliases: ['partner_ref', 'landing'],
        isActive: true,
        steps: [{ stepIndex: 0, messages: [] }],
    });

    const byAlias = await resolveDeepLinkPayload('partner_ref');
    assert.deepEqual(byAlias, {
        sceneId: 'target_scene',
        stepIndex: 0,
        payload: 'partner_ref',
    });

    const byAliasWithStep = await resolveDeepLinkPayload('landing_2');
    assert.deepEqual(byAliasWithStep, {
        sceneId: 'target_scene',
        stepIndex: 2,
        payload: 'landing_2',
    });
});

test('resolveDeepLinkPayload игнорирует неактивные сцены', async () => {
    await Scene.create({
        sceneId: 'disabled_scene',
        title: 'Выключенная сцена',
        isActive: false,
        steps: [],
    });

    const result = await resolveDeepLinkPayload('disabled_scene');
    assert.equal(result, null);
});

test('prepareDeepLinkStart и handleDeepLinkStart корректно готовят и выполняют переход', async () => {
    const stage = new Scenes.Stage([]);
    attachSceneStage(stage);

    await Scene.create({
        sceneId: 'flow_one',
        title: 'Сцена потока',
        isActive: true,
        steps: [{ stepIndex: 0, messages: [] }],
    });

    const session = {};
    let enteredScene = null;
    let enteredState = null;

    const ctx = {
        message: { text: '/start flow_one_3' },
        session,
        scene: {
            enter: async (sceneId, state) => {
                enteredScene = sceneId;
                enteredState = state;
            },
        },
    };

    const prepared = await prepareDeepLinkStart(ctx);
    assert.ok(prepared);
    assert.equal(ctx.session.pendingDeepLink.sceneId, 'flow_one');
    assert.equal(ctx.session.pendingDeepLink.stepIndex, 3);

    const handled = await handleDeepLinkStart(ctx);
    assert.equal(handled, true);
    assert.equal(ctx.session.pendingDeepLink, undefined);
    assert.equal(enteredScene, 'flow_one');
    assert.deepEqual(enteredState, {
        reset: true,
        startIndex: 3,
        fromDeepLink: true,
        payload: 'flow_one_3',
    });
});

