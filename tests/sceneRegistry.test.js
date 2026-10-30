import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { Scenes } from 'telegraf';

import { clearDatabase, connectTestDb, disconnectTestDb } from './helpers/db.js';
import { Scene } from '../src/models/Scene.js';
import { attachSceneStage, ensureSceneRegistered } from '../src/flow/sceneRegistry.js';

before(async () => {
    await connectTestDb();
});

beforeEach(async () => {
    await clearDatabase();
});

after(async () => {
    await disconnectTestDb();
});

test('sceneRegistry: отсутствующая или выключенная сцена не регистрируется', async () => {
    const stage = new Scenes.Stage([]);
    attachSceneStage(stage);

    assert.equal(await ensureSceneRegistered('missing_scene'), false);
    assert.equal(stage.scenes.has('missing_scene'), false);

    await Scene.create({
        sceneId: 'off_scene',
        title: 'Выключенная',
        isActive: false,
        steps: [{ stepIndex: 0, messages: [] }],
    });

    assert.equal(await ensureSceneRegistered('off_scene'), false);
    assert.equal(stage.scenes.has('off_scene'), false);
});

test('sceneRegistry: сцена, созданная после запуска, регистрируется при первом обращении', async () => {
    const stage = new Scenes.Stage([]);
    attachSceneStage(stage);

    await Scene.create({
        sceneId: 'late_scene',
        title: 'Новая ветка',
        isActive: true,
        steps: [{ stepIndex: 0, messages: [{ type: 'text', text: 'Первый шаг' }] }],
    });

    assert.equal(stage.scenes.has('late_scene'), false);

    assert.equal(await ensureSceneRegistered('late_scene'), true);
    assert.equal(stage.scenes.has('late_scene'), true);
    assert.equal(stage.scenes.get('late_scene').id, 'late_scene');

    // Повторное обращение не ломает реестр и не создаёт дубликатов.
    assert.equal(await ensureSceneRegistered('late_scene'), true);
    assert.equal(stage.scenes.size, 1);
});
