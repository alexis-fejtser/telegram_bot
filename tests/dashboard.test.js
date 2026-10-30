import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { startTestServer } from './helpers/app.js';
import { clearDatabase, disconnectTestDb } from './helpers/db.js';
import { loadSettings } from '../src/services/settingsService.js';
import { User } from '../src/models/User.js';
import { Question } from '../src/models/Question.js';

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

test('1.1–1.4: сводка возвращает корректные KPI', async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const yesterday = new Date(todayStart.getTime() - 1);

    await User.bulkCreate([
        { telegramId: 1001, firstName: 'Активный', lastInteractionAt: new Date(), firstInteractionAt: new Date() },
        { telegramId: 1002, firstName: 'Вчерашний', lastInteractionAt: yesterday, firstInteractionAt: yesterday },
    ]);

    await Question.bulkCreate([
        { telegramId: 1001, questionText: 'Первый вопрос', status: 'pending' },
        { telegramId: 1002, questionText: 'Второй вопрос', status: 'answered', answerText: 'Ответ' },
    ]);

    const { status, body } = await server.request('/api/analytics/summary');

    assert.equal(status, 200);
    assert.deepEqual(body, {
        totalUsers: 2,
        activeToday: 1,
        totalQuestions: 2,
        pendingQuestions: 1,
    });
});

test('1.2: граница «активных сегодня» — сегодня 00:00 включается, 23:59:59 вчера нет', async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const justBeforeToday = new Date(todayStart.getTime() - 1);

    await User.bulkCreate([
        { telegramId: 2001, lastInteractionAt: todayStart },
        { telegramId: 2002, lastInteractionAt: justBeforeToday },
    ]);

    const { body } = await server.request('/api/analytics/summary');

    assert.equal(body.totalUsers, 2);
    assert.equal(body.activeToday, 1);
});

test('1.5: график активности содержит 7 дней с количеством новых пользователей', async () => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

    await User.bulkCreate([
        { telegramId: 3001, firstInteractionAt: now },
        { telegramId: 3002, firstInteractionAt: now },
        { telegramId: 3003, firstInteractionAt: twoDaysAgo },
        { telegramId: 3004, firstInteractionAt: tenDaysAgo },
    ]);

    const { status, body } = await server.request('/api/analytics/activity');

    assert.equal(status, 200);
    assert.equal(body.length, 7);
    assert.equal(body[6].users, 2, 'двое зарегистрировались сегодня');
    assert.equal(body[4].users, 1, 'один зарегистрировался 2 дня назад');
    assert.equal(body.reduce((sum, day) => sum + day.users, 0), 3, 'пользователь 10-дневной давности не попадает в окно');
    assert.match(body[0].date, /^\d{2}\.\d{2}$/);
});
