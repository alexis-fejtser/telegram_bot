import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { startTestServer } from './helpers/app.js';
import { clearDatabase, disconnectTestDb } from './helpers/db.js';
import { loadSettings } from '../src/services/settingsService.js';
import { Scene } from '../src/models/Scene.js';
import { getMainMenuKeyboard } from '../src/mainMenu.js';

let server;

before(async () => {
    server = await startTestServer();
});

beforeEach(async () => {
    await clearDatabase();
    await loadSettings();
});

after(async () => {
    await server.close();
    await disconnectTestDb();
});

async function createScene(sceneId, title) {
    const { status, body } = await server.request('/api/scenes', {
        method: 'POST',
        body: {
            sceneId,
            title,
            description: `Описание ${title}`,
            steps: [
                {
                    stepIndex: 0,
                    messages: [{ type: 'text', text: `Текст ${title}`, buttons: [] }],
                },
            ],
        },
    });

    assert.equal(status, 200);
    return body.scene;
}

test('2.1.1: добавление сцены — order растёт, дубликат и пустые поля отклоняются', async () => {
    const first = await createScene('scene_a', 'Сцена A');
    const second = await createScene('scene_b', 'Сцена B');

    assert.equal(first.order, 0);
    assert.equal(second.order, 1);

    const duplicate = await server.request('/api/scenes', {
        method: 'POST',
        body: { sceneId: 'scene_a', title: 'Дубликат', steps: [] },
    });
    assert.equal(duplicate.status, 400);
    assert.equal(duplicate.body.error, 'Scene already exists');

    const invalid = await server.request('/api/scenes', {
        method: 'POST',
        body: { sceneId: '', title: '', steps: [] },
    });
    assert.equal(invalid.status, 400);

    const list = await server.request('/api/scenes');
    assert.equal(list.body.length, 2);
});

test('2.1.2: редактирование сцены — сохраняются название, описание, активность и шаги', async () => {
    await createScene('scene_edit', 'Старое название');

    const update = await server.request('/api/scenes/scene_edit', {
        method: 'PUT',
        body: {
            title: 'Новое название',
            description: 'Новое описание',
            isActive: false,
            steps: [
                {
                    stepIndex: 0,
                    messages: [{ type: 'text', text: 'Первый шаг', buttons: [] }],
                },
                {
                    stepIndex: 1,
                    messages: [{ type: 'text', text: 'Второй шаг', buttons: [] }],
                },
            ],
        },
    });

    assert.equal(update.status, 200);
    assert.equal(update.body.success, true);

    const { body: scene } = await server.request('/api/scenes/scene_edit');
    assert.equal(scene.title, 'Новое название');
    assert.equal(scene.description, 'Новое описание');
    assert.equal(scene.isActive, false);
    assert.equal(scene.steps.length, 2);
    assert.equal(scene.steps[1].messages[0].text, 'Второй шаг');
});

test('2.1.3: удаление сцены', async () => {
    await createScene('scene_del', 'Удаляемая');

    const { status, body } = await server.request('/api/scenes/scene_del', { method: 'DELETE' });
    assert.equal(status, 200);
    assert.equal(body.success, true);

    const notFound = await server.request('/api/scenes/scene_del');
    assert.equal(notFound.status, 404);

    const list = await server.request('/api/scenes');
    assert.equal(list.body.length, 0);
});

test('2.1.4: изменение порядка сцен сохраняется и отражается в списке', async () => {
    await createScene('scene_a', 'Сцена A');
    await createScene('scene_b', 'Сцена B');
    await createScene('scene_c', 'Сцена C');

    const reorder = await server.request('/api/scenes/reorder', {
        method: 'POST',
        body: { order: ['scene_c', 'scene_a', 'scene_b'] },
    });

    assert.equal(reorder.status, 200);
    assert.equal(reorder.body.success, true);
    assert.deepEqual(reorder.body.scenes.map((s) => s.sceneId), ['scene_c', 'scene_a', 'scene_b']);
    assert.deepEqual(reorder.body.scenes.map((s) => s.order), [0, 1, 2]);

    const list = await server.request('/api/scenes');
    assert.deepEqual(list.body.map((s) => s.sceneId), ['scene_c', 'scene_a', 'scene_b']);
});

test('2.1.4: невалидный запрос порядка сцен отклоняется', async () => {
    await createScene('scene_a', 'Сцена A');
    await createScene('scene_b', 'Сцена B');
    await createScene('scene_c', 'Сцена C');

    const notArray = await server.request('/api/scenes/reorder', {
        method: 'POST',
        body: { order: 'scene_a,scene_b,scene_c' },
    });
    assert.equal(notArray.status, 400);

    const duplicates = await server.request('/api/scenes/reorder', {
        method: 'POST',
        body: { order: ['scene_a', 'scene_a', 'scene_b'] },
    });
    assert.equal(duplicates.status, 400);
    assert.match(duplicates.body.error, /дубликаты/i);

    const unknown = await server.request('/api/scenes/reorder', {
        method: 'POST',
        body: { order: ['scene_a', 'scene_b', 'scene_x'] },
    });
    assert.equal(unknown.status, 400);
    assert.match(unknown.body.error, /не найдены/i);

    const partial = await server.request('/api/scenes/reorder', {
        method: 'POST',
        body: { order: ['scene_b', 'scene_a'] },
    });
    assert.equal(partial.status, 400);
    assert.match(partial.body.error, /все существующие сцены/i);
});

test('2.1.4: главное меню бота соответствует порядку сцен', async () => {
    await createScene('scene_a', 'Сцена A');
    await createScene('scene_b', 'Сцена B');
    await createScene('scene_c', 'Сцена C');

    await server.request('/api/scenes/reorder', {
        method: 'POST',
        body: { order: ['scene_b', 'scene_c', 'scene_a'] },
    });

    const keyboard = await getMainMenuKeyboard();
    const callbackData = keyboard.reply_markup.inline_keyboard.flat().map((btn) => btn.callback_data);

    assert.deepEqual(callbackData, ['scene:scene_b', 'scene:scene_c', 'scene:scene_a']);
});

test('2.2.1–2.2.2: шаги сохраняются и удаляются с перенумерацией stepIndex', async () => {
    await createScene('scene_steps', 'Шаги');

    await server.request('/api/scenes/scene_steps', {
        method: 'PUT',
        body: {
            title: 'Шаги',
            description: '',
            isActive: true,
            steps: [
                { stepIndex: 0, messages: [{ type: 'text', text: 'Шаг 1' }] },
                { stepIndex: 1, messages: [{ type: 'text', text: 'Шаг 2' }] },
                { stepIndex: 2, messages: [{ type: 'text', text: 'Шаг 3' }] },
            ],
        },
    });

    // удаление среднего шага с перенумерацией
    await server.request('/api/scenes/scene_steps', {
        method: 'PUT',
        body: {
            title: 'Шаги',
            description: '',
            isActive: true,
            steps: [
                { stepIndex: 0, messages: [{ type: 'text', text: 'Шаг 1' }] },
                { stepIndex: 1, messages: [{ type: 'text', text: 'Шаг 3' }] },
            ],
        },
    });

    const { body: scene } = await server.request('/api/scenes/scene_steps');
    assert.deepEqual(scene.steps.map((s) => s.stepIndex), [0, 1]);
    assert.deepEqual(scene.steps.map((s) => s.messages[0].text), ['Шаг 1', 'Шаг 3']);
});

test('2.3.6: инлайн-кнопки остаются только у последнего сообщения шага', async () => {
    await createScene('scene_buttons', 'Кнопки');

    await server.request('/api/scenes/scene_buttons', {
        method: 'PUT',
        body: {
            title: 'Кнопки',
            description: '',
            isActive: true,
            steps: [
                {
                    stepIndex: 0,
                    messages: [
                        { type: 'text', text: 'Первое', buttons: [[{ text: 'Далее', action: 'next' }]] },
                        { type: 'text', text: 'Второе', buttons: [[{ text: 'Ещё', action: 'next' }]] },
                        { type: 'text', text: 'Третье', buttons: [[{ text: 'Финал', action: 'next' }]] },
                    ],
                },
            ],
        },
    });

    const { body: scene } = await server.request('/api/scenes/scene_buttons');
    assert.deepEqual(scene.steps[0].messages[0].buttons, []);
    assert.deepEqual(scene.steps[0].messages[1].buttons, []);
    assert.equal(scene.steps[0].messages[2].buttons[0][0].text, 'Финал');
});

test('2.3.1–2.3.4: порядок сообщений внутри шага сохраняется', async () => {
    await createScene('scene_messages', 'Сообщения');

    await server.request('/api/scenes/scene_messages', {
        method: 'PUT',
        body: {
            title: 'Сообщения',
            description: '',
            isActive: true,
            steps: [
                {
                    stepIndex: 0,
                    messages: [
                        { type: 'text', text: 'Третье' },
                        { type: 'text', text: 'Первое' },
                        { type: 'text', text: 'Второе' },
                    ],
                },
            ],
        },
    });

    const { body: scene } = await server.request('/api/scenes/scene_messages');
    assert.deepEqual(scene.steps[0].messages.map((m) => m.text), ['Третье', 'Первое', 'Второе']);
});
