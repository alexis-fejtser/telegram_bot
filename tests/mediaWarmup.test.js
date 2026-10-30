import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { startTestServer } from './helpers/app.js';
import { clearDatabase, disconnectTestDb } from './helpers/db.js';
import { loadSettings } from '../src/services/settingsService.js';
import { Asset } from '../src/models/Asset.js';
import { Scene } from '../src/models/Scene.js';
import { Setting } from '../src/models/Setting.js';
import {
    resolveMediaFilePath,
    collectAllMediaItems,
    warmupMediaCache,
} from '../src/services/mediaWarmup.js';
import {
    getCachedFileId,
    setCachedFileId,
    invalidateCachedFileId,
    getAllCachedFileIds,
} from '../src/services/mediaStore.js';

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

test('mediaWarmup: resolveMediaFilePath корректно находит существующие файлы и fallback пути', () => {
    // 1. Существующий файл в src/scenes
    const scenePhoto = resolveMediaFilePath('./src/scenes/photo_2026-06-24_15-20-07.jpg');
    assert.ok(scenePhoto, 'Должен найтись photo_2026-06-24_15-20-07.jpg');
    assert.ok(fs.existsSync(scenePhoto));

    // 2. Fallback из относительного пути без src/
    const fallbackPhoto = resolveMediaFilePath('photo_2026-06-24_15-20-07.jpg');
    assert.ok(fallbackPhoto);
    assert.ok(fs.existsSync(fallbackPhoto));

    // 3. Несуществующий файл
    const nonExistent = resolveMediaFilePath('completely_non_existent_file_999.xyz');
    assert.equal(nonExistent, null);
});

test('mediaWarmup: collectAllMediaItems собирает данные из Asset и Scene', async () => {
    await Asset.create({
        assetKey: 'test_asset_warmup_1',
        filePath: './src/scenes/photo_2026-06-24_15-20-07.jpg',
        mediaType: 'photo',
    });

    await Scene.create({
        sceneId: 'test_scene_warmup',
        title: 'Тест',
        steps: [
            {
                stepIndex: 0,
                messages: [
                    {
                        type: 'video',
                        assetKey: 'test_scene_video_1',
                        file: './src/scenes/photo_2026-06-24_15-50-18.jpg',
                    },
                ],
            },
        ],
    });

    const items = await collectAllMediaItems();
    assert.ok(items.length >= 2, 'Должно быть как минимум 2 элемента');

    const foundAsset = items.find((it) => it.key === 'test_asset_warmup_1');
    assert.ok(foundAsset);
    assert.equal(foundAsset.mediaType, 'photo');

    const foundScene = items.find((it) => it.key === 'test_scene_video_1');
    assert.ok(foundScene);
    assert.equal(foundScene.mediaType, 'video');
});

test('mediaWarmup: warmupMediaCache отправляет медиа на managerId и сохраняет file_id', async () => {
    const testKey = 'test_warmup_single_item';
    invalidateCachedFileId(testKey);

    await Asset.create({
        assetKey: testKey,
        filePath: './src/scenes/photo_2026-06-24_15-20-07.jpg',
        mediaType: 'photo',
    });

    const managerId = '999888777';

    const result = await warmupMediaCache({
        bot: server.bot,
        managerId,
        force: true,
        delayMs: 10,
    });

    assert.equal(result.success, true);
    assert.ok(result.warmed >= 1);

    // Проверяем, что в telegram stub ушло сообщение и фото
    const photoMsg = server.bot.sentMessages.find((m) => m.type === 'photo');
    assert.ok(photoMsg, 'Должна быть вызвана отправка фото');
    assert.equal(photoMsg.chatId, managerId);

    // Проверяем, что file_id сохранён в кэше
    const cachedId = getCachedFileId(testKey);
    assert.equal(cachedId, 'photo_test_file_id_999');

    // Очищаем тестовый ключ
    invalidateCachedFileId(testKey);
});

test('mediaWarmup: повторный запуск без force пропускает уже закэшированные элементы', async () => {
    const testKey = 'test_warmup_cached_skip';
    setCachedFileId(testKey, 'already_cached_fid_111');

    await Asset.create({
        assetKey: testKey,
        filePath: './src/scenes/photo_2026-06-24_15-20-07.jpg',
        mediaType: 'photo',
    });

    const managerId = '999888777';

    // Запуск без force
    const result = await warmupMediaCache({
        bot: server.bot,
        managerId,
        force: false,
        delayMs: 10,
    });

    assert.equal(result.success, true);
    const itemResult = result.results.find((r) => r.key === testKey);
    assert.ok(itemResult);
    assert.equal(itemResult.status, 'skipped');
    assert.equal(itemResult.fileId, 'already_cached_fid_111');

    invalidateCachedFileId(testKey);
});

test('API: GET /api/assets/cache-status и POST /api/assets/warmup', async () => {
    // Устанавливаем MANAGER_ID в настройках
    await Setting.update(
        { managerId: '555666777' },
        { where: { key: 'bot' } }
    );
    await loadSettings();

    const testKey = 'api_warmup_test_item';
    invalidateCachedFileId(testKey);

    await Asset.create({
        assetKey: testKey,
        filePath: './src/scenes/photo_2026-06-24_15-20-07.jpg',
        mediaType: 'photo',
    });

    // 1. Проверяем cache-status
    const statusRes = await server.request('/api/assets/cache-status');
    assert.equal(statusRes.status, 200);
    assert.ok(typeof statusRes.body.cachedCount === 'number');

    // 2. Вызываем POST /api/assets/warmup
    const warmupRes = await server.request('/api/assets/warmup', {
        method: 'POST',
        body: { force: true, delayMs: 10 },
    });

    assert.equal(warmupRes.status, 200);
    assert.equal(warmupRes.body.success, true);
    assert.ok(warmupRes.body.total >= 1);

    // Проверяем, что ключ закэшировался
    assert.equal(getCachedFileId(testKey), 'photo_test_file_id_999');

    invalidateCachedFileId(testKey);
});
