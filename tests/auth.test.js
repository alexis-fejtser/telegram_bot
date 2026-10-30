import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { startTestServer } from './helpers/app.js';
import { clearDatabase, disconnectTestDb } from './helpers/db.js';

let server;

before(async () => {
    server = await startTestServer();
});

beforeEach(async () => {
    await clearDatabase();
});

after(async () => {
    await server.close();
    await disconnectTestDb();
});

test('вход в админку: верный пароль из ADMIN_SECRET', async () => {
    const { status, body } = await server.request('/api/auth/login', {
        method: 'POST',
        body: { password: 'test_admin_secret' },
    });

    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(body.token);
});

test('вход в админку: неверный пароль и пустой запрос', async () => {
    const wrong = await server.request('/api/auth/login', {
        method: 'POST',
        body: { password: 'неверный' },
    });
    assert.equal(wrong.status, 401);

    const empty = await server.request('/api/auth/login', {
        method: 'POST',
        body: {},
    });
    assert.equal(empty.status, 401);
});
