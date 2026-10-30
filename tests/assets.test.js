import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

import { startTestServer } from './helpers/app.js';
import { clearDatabase, disconnectTestDb } from './helpers/db.js';
import { loadSettings } from '../src/services/settingsService.js';

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

async function uploadAsset({ name = 'photo.png', blobType = 'image/png', mediaType } = {}) {
    const formData = new FormData();
    formData.append('file', new Blob([`fake-${name}`], { type: blobType }), name);
    if (mediaType) formData.append('mediaType', mediaType);

    const response = await fetch(`${server.baseUrl}/api/assets/upload`, {
        method: 'POST',
        body: formData,
    });

    return { status: response.status, body: await response.json() };
}

test('Медиатека: загрузка файла с компьютера создаёт запись и файл на диске', async () => {
    const { status, body } = await uploadAsset({ name: 'My Photo.png', blobType: 'image/png' });

    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.asset.mediaType, 'photo');
    assert.match(body.asset.assetKey, /^my_photo_/);
    assert.match(body.asset.filePath, /^uploads\//);

    const absolutePath = path.resolve(process.cwd(), body.asset.filePath);
    assert.ok(fs.existsSync(absolutePath), 'файл должен быть сохранён в uploads/');

    const list = await server.request('/api/assets');
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].assetKey, body.asset.assetKey);

    // отдача файла для превью
    const fileResponse = await fetch(`${server.baseUrl}/api/assets/${body.asset.assetKey}/file`);
    assert.equal(fileResponse.status, 200);
    assert.equal(await fileResponse.text(), 'fake-My Photo.png');

    // удаление записи и файла
    const remove = await server.request(`/api/assets/${body.asset.assetKey}`, { method: 'DELETE' });
    assert.equal(remove.status, 200);
    assert.ok(!fs.existsSync(absolutePath), 'файл должен быть удалён с диска');
    assert.equal((await server.request('/api/assets')).body.length, 0);
});

test('Медиатека: тип videoNote сохраняется при загрузке кружка', async () => {
    const { status, body } = await uploadAsset({
        name: 'circle.webm',
        blobType: 'video/webm',
        mediaType: 'videoNote',
    });

    assert.equal(status, 200);
    assert.equal(body.asset.mediaType, 'videoNote');

    await server.request(`/api/assets/${body.asset.assetKey}`, { method: 'DELETE' });
});

test('Медиатека: загрузка без файла отклоняется', async () => {
    const formData = new FormData();
    formData.append('mediaType', 'photo');

    const response = await fetch(`${server.baseUrl}/api/assets/upload`, {
        method: 'POST',
        body: formData,
    });

    assert.equal(response.status, 400);
});

test('Медиатека: превью несуществующего asset отдаёт 404', async () => {
    const response = await fetch(`${server.baseUrl}/api/assets/missing_asset/file`);
    assert.equal(response.status, 404);
});
