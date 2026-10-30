import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { startTestServer } from './helpers/app.js';
import { clearDatabase, disconnectTestDb } from './helpers/db.js';
import { loadSettings } from '../src/services/settingsService.js';
import { Question } from '../src/models/Question.js';
import { User } from '../src/models/User.js';

let server;

before(async () => {
    server = await startTestServer();
});

beforeEach(async () => {
    await clearDatabase();
    await loadSettings();
    server.bot.sentMessages.length = 0;
    server.bot.state.failWith = null;
});

after(async () => {
    await server.close();
    await disconnectTestDb();
});

test('4: список вопросов и фильтр по статусу', async () => {
    await Question.bulkCreate([
        { telegramId: 1, questionText: 'Ожидающий', status: 'pending' },
        { telegramId: 2, questionText: 'Отвеченный', status: 'answered', answerText: 'Ответ' },
    ]);

    const all = await server.request('/api/questions');
    assert.equal(all.status, 200);
    assert.equal(all.body.length, 2);

    const pending = await server.request('/api/questions?status=pending');
    assert.deepEqual(pending.body.map((q) => q.questionText), ['Ожидающий']);

    const answered = await server.request('/api/questions?status=answered');
    assert.deepEqual(answered.body.map((q) => q.questionText), ['Отвеченный']);
});

test('4: ответ на вопрос сохраняется и уходит пользователю в Telegram', async () => {
    const telegramId = 11111;
    const question = await Question.create({ telegramId, questionText: 'Вопрос', status: 'pending' });
    await User.create({ telegramId, firstName: 'Клиент' });

    const { status, body } = await server.request(`/api/questions/${question.id}/answer`, {
        method: 'POST',
        body: { answerText: 'Ответ менеджера' },
    });

    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.warning, null);

    const saved = await Question.findByPk(question.id);
    assert.equal(saved.status, 'answered');
    assert.equal(saved.answerText, 'Ответ менеджера');
    assert.ok(saved.answeredAt instanceof Date);

    assert.equal(server.bot.sentMessages.length, 1);
    assert.equal(server.bot.sentMessages[0].chatId, telegramId);
    assert.match(server.bot.sentMessages[0].text, /Ответ менеджера/);
});

test('4: ответ на несуществующий вопрос — 404', async () => {
    const missing = await server.request('/api/questions/999999/answer', {
        method: 'POST',
        body: { answerText: 'Ответ' },
    });

    assert.equal(missing.status, 404);
});

test('4: если пользователь заблокировал бота — ответ сохраняется, пользователь помечается blocked', async () => {
    const telegramId = 22222;
    const question = await Question.create({ telegramId, questionText: 'Вопрос', status: 'pending' });
    await User.create({ telegramId, firstName: 'Заблокировал' });

    server.bot.state.failWith = {
        message: 'Forbidden: bot was blocked by the user',
        code: 403,
    };

    const { status, body } = await server.request(`/api/questions/${question.id}/answer`, {
        method: 'POST',
        body: { answerText: 'Ответ' },
    });

    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.match(body.warning, /заблокировал/i);

    const user = await User.findOne({ where: { telegramId } });
    assert.equal(user.status, 'blocked');

    const saved = await Question.findByPk(question.id);
    assert.equal(saved.status, 'answered');
});

test('4: прямой чат — сообщение активному пользователю и запрет для заблокированного', async () => {
    await User.bulkCreate([
        { telegramId: 33333, firstName: 'Активный', status: 'active' },
        { telegramId: 33334, firstName: 'Заблокированный', status: 'blocked' },
    ]);

    const ok = await server.request('/api/chat/send', {
        method: 'POST',
        body: { telegramId: 33333, text: 'Привет!' },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.success, true);
    assert.equal(server.bot.sentMessages.length, 1);
    assert.equal(server.bot.sentMessages[0].chatId, 33333);

    const blocked = await server.request('/api/chat/send', {
        method: 'POST',
        body: { telegramId: 33334, text: 'Привет!' },
    });
    assert.equal(blocked.status, 400);
    assert.match(blocked.body.error, /заблокировал/i);

    const invalid = await server.request('/api/chat/send', {
        method: 'POST',
        body: { telegramId: 33333 },
    });
    assert.equal(invalid.status, 400);
});
