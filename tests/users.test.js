import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { startTestServer } from './helpers/app.js';
import { clearDatabase, disconnectTestDb } from './helpers/db.js';
import { loadSettings } from '../src/services/settingsService.js';
import { User } from '../src/models/User.js';
import { MessageHistory } from '../src/models/MessageHistory.js';

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

test('3.1: получение всех пользователей с пагинацией', async () => {
    const users = [];
    for (let i = 0; i < 25; i++) {
        users.push({
            telegramId: 5000 + i,
            firstName: `Пользователь ${i}`,
            lastInteractionAt: new Date(Date.now() - i * 60 * 1000),
        });
    }
    await User.bulkCreate(users);

    const firstPage = await server.request('/api/analytics/users?page=1&limit=20');
    assert.equal(firstPage.status, 200);
    assert.equal(firstPage.body.total, 25);
    assert.equal(firstPage.body.totalPages, 2);
    assert.equal(firstPage.body.currentPage, 1);
    assert.equal(firstPage.body.users.length, 20);

    const secondPage = await server.request('/api/analytics/users?page=2&limit=20');
    assert.equal(secondPage.body.users.length, 5);

    const ids = new Set([...firstPage.body.users, ...secondPage.body.users].map((u) => u.telegramId));
    assert.equal(ids.size, 25, 'страницы не пересекаются и покрывают всех пользователей');
});

test('3.1: список отсортирован по последней активности (новые сверху)', async () => {
    await User.bulkCreate([
        { telegramId: 6001, firstName: 'Старый', lastInteractionAt: new Date(Date.now() - 60 * 60 * 1000) },
        { telegramId: 6002, firstName: 'Новый', lastInteractionAt: new Date() },
    ]);

    const { body } = await server.request('/api/analytics/users');

    assert.deepEqual(body.users.map((u) => u.telegramId), [6002, 6001]);
});

test('3.3: поиск по имени, username, Telegram ID и текущей сцене', async () => {
    await User.bulkCreate([
        { telegramId: 7001, firstName: 'Мария', lastName: 'Иванова', username: 'maria_ivanova', currentScene: 'first_scene' },
        { telegramId: 7002, firstName: 'Пётр', lastName: 'Сидоров', username: 'petr', currentScene: 'second_scene' },
    ]);

    const byName = await server.request('/api/analytics/users?search=Мария');
    assert.deepEqual(byName.body.users.map((u) => u.telegramId), [7001]);

    const byUsername = await server.request('/api/analytics/users?search=petr');
    assert.deepEqual(byUsername.body.users.map((u) => u.telegramId), [7002]);

    const byTelegramId = await server.request('/api/analytics/users?search=7001');
    assert.deepEqual(byTelegramId.body.users.map((u) => u.telegramId), [7001]);

    const byScene = await server.request('/api/analytics/users?search=second_scene');
    assert.deepEqual(byScene.body.users.map((u) => u.telegramId), [7002]);
});

test('3.3: поиск устойчив к regex-спецсимволам и пустому запросу', async () => {
    await User.create({ telegramId: 8001, firstName: 'Тест' });

    const specialChars = await server.request('/api/analytics/users?search=a%2Bb%5B%5D');
    assert.equal(specialChars.status, 200);

    const empty = await server.request('/api/analytics/users?search=');
    assert.equal(empty.status, 200);
    assert.equal(empty.body.total, 1);
});

test('3.3: фильтр по сцене, включая «Главное меню»', async () => {
    await User.bulkCreate([
        { telegramId: 9001, firstName: 'В сцене', currentScene: 'first_scene' },
        { telegramId: 9002, firstName: 'В меню', currentScene: null },
        { telegramId: 9003, firstName: 'В другой', currentScene: 'second_scene' },
    ]);

    const inScene = await server.request('/api/analytics/users?scene=first_scene');
    assert.deepEqual(inScene.body.users.map((u) => u.telegramId), [9001]);

    const mainMenu = await server.request('/api/analytics/users?scene=__main_menu__');
    assert.deepEqual(mainMenu.body.users.map((u) => u.telegramId), [9002]);
});

test('3.1: информация о конкретном пользователе и 404 для несуществующего', async () => {
    await User.create({ telegramId: 9100, firstName: 'Точечный', username: 'point' });

    const found = await server.request('/api/analytics/users/9100');
    assert.equal(found.status, 200);
    assert.equal(found.body.username, 'point');

    const missing = await server.request('/api/analytics/users/9199');
    assert.equal(missing.status, 404);

    const invalid = await server.request('/api/analytics/users/not-a-number');
    assert.equal(invalid.status, 400);
});

test('3.2: история действий возвращается от новых к старым', async () => {
    const telegramId = 9200;
    await User.create({ telegramId, firstName: 'История' });

    await MessageHistory.bulkCreate([
        { telegramId, actionType: 'bot_start', details: {}, timestamp: new Date(Date.now() - 3000) },
        { telegramId, actionType: 'question_submitted', details: { questionText: 'Как дела?' }, timestamp: new Date() },
        { telegramId, actionType: 'step_render', details: { sceneId: 'first_scene', stepIndex: 0 }, timestamp: new Date(Date.now() - 1500) },
    ]);

    const { status, body } = await server.request(`/api/analytics/users/${telegramId}/history`);

    assert.equal(status, 200);
    assert.deepEqual(
        body.map((item) => item.actionType),
        ['question_submitted', 'step_render', 'bot_start']
    );
    assert.equal(body[0].details.questionText, 'Как дела?');
});
