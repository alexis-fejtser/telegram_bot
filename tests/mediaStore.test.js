import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
    getMediaKey,
    getCachedFileId,
    setCachedFileId,
    invalidateCachedFileId,
    extractFileIdFromTelegramResponse,
    rememberTelegramFileId,
    getLocalFileInput,
    setAssetOverride,
} from '../src/services/mediaStore.js';

test('mediaStore: getMediaKey корректно извлекает ключ медиа', () => {
    assert.equal(getMediaKey({ assetKey: 'banner_photo' }), 'banner_photo');
    assert.equal(getMediaKey({ file: './uploads/photo.jpg' }), './uploads/photo.jpg');
    assert.equal(getMediaKey({ fileId: 'AgACAgIAAxkDAAI...' }), 'AgACAgIAAxkDAAI...');
    assert.equal(getMediaKey({}), null);
});

test('mediaStore: кэширование и инвалидация file_id', () => {
    const testKey = 'test_asset_key_xyz';
    setCachedFileId(testKey, 'tg_file_id_12345');
    assert.equal(getCachedFileId(testKey), 'tg_file_id_12345');

    invalidateCachedFileId(testKey);
    assert.equal(getCachedFileId(testKey), null);
});

test('mediaStore: extractFileIdFromTelegramResponse и rememberTelegramFileId', () => {
    const photoResponse = {
        photo: [
            { file_id: 'small_id' },
            { file_id: 'large_id' },
        ],
    };
    assert.equal(extractFileIdFromTelegramResponse('photo', photoResponse), 'large_id');

    const videoResponse = {
        video: { file_id: 'video_file_id_99' },
    };
    assert.equal(extractFileIdFromTelegramResponse('video', videoResponse), 'video_file_id_99');

    const videoNoteResponse = {
        video_note: { file_id: 'note_file_id_88' },
    };
    assert.equal(extractFileIdFromTelegramResponse('videoNote', videoNoteResponse), 'note_file_id_88');

    // Проверяем запоминание через rememberTelegramFileId
    const message = { type: 'photo', assetKey: 'remember_photo_key' };
    rememberTelegramFileId(message, photoResponse);
    assert.equal(getCachedFileId('remember_photo_key'), 'large_id');
    invalidateCachedFileId('remember_photo_key');
});

test('mediaStore: getLocalFileInput разрешает путь и применяет fallback к src/scenes', () => {
    // 1. Проверяем ошибку при отсутствии пути
    assert.throws(
        () => getLocalFileInput({}),
        /Local file path is not specified/
    );

    // 2. Проверяем fallback для путей вида ./scenes/photo_... -> ./src/scenes/photo_...
    const legacyPathMessage = {
        type: 'photo',
        file: './scenes/photo_2026-06-24_15-20-07.jpg',
    };
    const input = getLocalFileInput(legacyPathMessage);
    assert.ok(input);

    // 3. Проверяем ошибку для несуществующего файла
    assert.throws(
        () => getLocalFileInput({ file: './non_existent_file_123.jpg' }),
        /Local media file not found/
    );
});

