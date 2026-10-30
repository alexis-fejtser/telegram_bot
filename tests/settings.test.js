import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { startTestServer } from './helpers/app.js';
import { clearDatabase, disconnectTestDb } from './helpers/db.js';
import { loadSettings } from '../src/services/settingsService.js';
import { Setting } from '../src/models/Setting.js';

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

const VALID_TOKEN = `123456789:${'A'.repeat(30)}`;

test('5: GET /api/settings отдаёт значения по умолчанию и не раскрывает секреты', async () => {
    const { status, body } = await server.request('/api/settings');

    assert.equal(status, 200);
    assert.equal(body.stepDelayMs, 5000);
    assert.equal(body.stepTimeoutMs, 86400000);
    assert.equal(body.leadNextDelayMs, 5000);
    assert.equal(body.passwordConfigured, false);
    assert.equal(body.restartRequired, false);
    assert.equal(body.hasCustomBotToken, false);
    assert.equal(body.texts.questionPrompt, 'Напишите ваш вопрос одним сообщением:');
    assert.match(body.texts.managerNotification, /\{question\}/);
    assert.equal(body.botTokenMasked, null);

    const raw = await Setting.findOne({ where: { key: 'bot' } });
    assert.equal(raw.adminPasswordHash, null);
    assert.equal('adminPassword' in body, false);
});

test('5: обновление таймеров, MANAGER_ID и текстов лидов', async () => {
    const { status, body } = await server.request('/api/settings', {
        method: 'PUT',
        body: {
            managerId: '987654321',
            stepDelayMs: 1000,
            stepTimeoutMs: 60000,
            leadNextDelayMs: 2000,
            texts: {
                consultation: '📞 Звоните: +375 00 000-00-00',
                questionThanks: 'Вопрос принят!',
            },
        },
    });

    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.restartRequired, false);

    const refreshed = await server.request('/api/settings');
    assert.equal(refreshed.body.managerId, '987654321');
    assert.equal(refreshed.body.stepDelayMs, 1000);
    assert.equal(refreshed.body.stepTimeoutMs, 60000);
    assert.equal(refreshed.body.leadNextDelayMs, 2000);
    assert.equal(refreshed.body.texts.consultation, '📞 Звоните: +375 00 000-00-00');
    assert.equal(refreshed.body.texts.questionThanks, 'Вопрос принят!');
    assert.equal(
        refreshed.body.texts.questionPrompt,
        'Напишите ваш вопрос одним сообщением:',
        'неизменённые тексты остаются по умолчанию'
    );
});

test('5: невалидные значения отклоняются с 400', async () => {
    const negativeTimer = await server.request('/api/settings', {
        method: 'PUT',
        body: { stepDelayMs: -5 },
    });
    assert.equal(negativeTimer.status, 400);

    const hugeTimer = await server.request('/api/settings', {
        method: 'PUT',
        body: { stepTimeoutMs: 999_999_999_999 },
    });
    assert.equal(hugeTimer.status, 400);

    const badToken = await server.request('/api/settings', {
        method: 'PUT',
        body: { botToken: 'не-токен' },
    });
    assert.equal(badToken.status, 400);

    const badManager = await server.request('/api/settings', {
        method: 'PUT',
        body: { managerId: 'не-цифры' },
    });
    assert.equal(badManager.status, 400);

    const emptyPatch = await server.request('/api/settings', {
        method: 'PUT',
        body: {},
    });
    assert.equal(emptyPatch.status, 400);
});

test('5: смена токена бота требует перезапуска и маскируется в GET', async () => {
    const update = await server.request('/api/settings', {
        method: 'PUT',
        body: { botToken: VALID_TOKEN },
    });

    assert.equal(update.status, 200);
    assert.equal(update.body.restartRequired, true);
    assert.equal(update.body.settings.hasCustomBotToken, true);
    assert.equal(update.body.settings.botTokenMasked, `123456789:••••••••${'A'.repeat(4)}`);
    assert.doesNotMatch(JSON.stringify(update.body), new RegExp(VALID_TOKEN));

    const refreshed = await server.request('/api/settings');
    assert.equal(refreshed.body.restartRequired, true);
});

test('5: смена пароля администратора — проверка текущего и минимальной длины', async () => {
    const wrongCurrent = await server.request('/api/settings/password', {
        method: 'PUT',
        body: { currentPassword: 'неверный', newPassword: 'новый_пароль' },
    });
    assert.equal(wrongCurrent.status, 401);

    const tooShort = await server.request('/api/settings/password', {
        method: 'PUT',
        body: { currentPassword: 'test_admin_secret', newPassword: '123' },
    });
    assert.equal(tooShort.status, 400);

    const success = await server.request('/api/settings/password', {
        method: 'PUT',
        body: { currentPassword: 'test_admin_secret', newPassword: 'новый_пароль' },
    });
    assert.equal(success.status, 200);

    const refreshed = await server.request('/api/settings');
    assert.equal(refreshed.body.passwordConfigured, true);

    // после смены: старый пароль не работает, новый — работает
    const oldLogin = await server.request('/api/auth/login', {
        method: 'POST',
        body: { password: 'test_admin_secret' },
    });
    assert.equal(oldLogin.status, 401);

    const newLogin = await server.request('/api/auth/login', {
        method: 'POST',
        body: { password: 'новый_пароль' },
    });
    assert.equal(newLogin.status, 200);
    assert.equal(newLogin.body.success, true);

    const secondChangeWithNew = await server.request('/api/settings/password', {
        method: 'PUT',
        body: { currentPassword: 'новый_пароль', newPassword: 'ещё_один_пароль' },
    });
    assert.equal(secondChangeWithNew.status, 200);
});
