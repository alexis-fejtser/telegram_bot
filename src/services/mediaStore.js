import fs from 'fs';
import path from 'path';
import { Input } from 'telegraf';
import { Asset } from '../models/Asset.js';

const CACHE_DIR = './.cache';
const CACHE_FILE = path.join(CACHE_DIR, 'telegram-file-ids.json');

let cache = {};
const dbAssetOverrides = new Map();

// Input-потоки из Input.fromLocalFile одноразовые: после сетевого сбоя
// повторная отправка того же объекта ушла бы пустым файлом. Запоминаем
// путь к файлу для каждого созданного Input, чтобы пересоздать его для ретрая.
const localFileInputs = new WeakMap();

loadCache();
// syncAssetsFromDB will be called after DB connection is established in src/services/db.js or index.js

function loadCache() {
    try {
        if (!fs.existsSync(CACHE_DIR)) {
            fs.mkdirSync(CACHE_DIR, { recursive: true });
        }

        if (!fs.existsSync(CACHE_FILE)) {
            fs.writeFileSync(CACHE_FILE, '{}', 'utf8');
        }

        cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch (error) {
        console.error('Media cache load error:', error);
        cache = {};
    }
}

function saveCache() {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
    } catch (error) {
        console.error('Media cache save error:', error);
    }
}

export async function syncAssetsFromDB() {
    try {
        const assets = await Asset.findAll();
        for (const asset of assets) {
            dbAssetOverrides.set(asset.assetKey, asset.filePath);
        }
    } catch (error) {
        console.error('Sync assets from DB error:', error.message);
    }
}

export function setAssetOverride(assetKey, filePath) {
    if (assetKey && filePath) {
        dbAssetOverrides.set(assetKey, filePath);
    }
}

export function getMediaKey(message) {
    return message.assetKey || message.file || message.fileId || null;
}

export function getCachedFileId(key) {
    if (!key) {
        return null;
    }

    return cache[key] || null;
}

export function setCachedFileId(key, fileId) {
    if (!key || !fileId) {
        return;
    }

    cache[key] = fileId;
    saveCache();

    console.log(`✅ Saved Telegram file_id: ${key} => ${fileId}`);
}

export function invalidateCachedFileId(key) {
    if (!key) {
        return;
    }

    if (cache[key]) {
        console.warn(`⚠️ Removed invalid Telegram file_id from cache: ${key}`);

        delete cache[key];
        saveCache();
    }
}

export function getLocalFileInput(message) {
    const key = getMediaKey(message);
    const filePath = (key && dbAssetOverrides.get(key)) || message.file;

    if (!filePath) {
        throw new Error(`Local file path is not specified for asset: ${key}`);
    }

    let absolutePath = path.resolve(process.cwd(), filePath);

    if (!fs.existsSync(absolutePath)) {
        // Fallback for legacy paths: e.g. './scenes/foo' -> './src/scenes/foo'
        const candidate = path.resolve(process.cwd(), 'src', filePath.replace(/^\.?\//, ''));
        if (fs.existsSync(candidate)) {
            absolutePath = candidate;
        } else {
            throw new Error(`Local media file not found: ${absolutePath}`);
        }
    }

    const input = Input.fromLocalFile(absolutePath);
    localFileInputs.set(input, absolutePath);

    return input;
}

/**
 * Пересоздаёт Input-поток для повторной отправки медиа после сетевого сбоя.
 * Возвращает новый Input на тот же файл или null, если значение не является
 * потоком, созданным через getLocalFileInput (например, это file_id-строка).
 */
export function recreateUploadInput(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const localPath = localFileInputs.get(value);

    if (!localPath) {
        return null;
    }

    const input = Input.fromLocalFile(localPath);
    localFileInputs.set(input, localPath);

    return input;
}

export function getMediaSource(message, options = {}) {
    const { preferCache = true } = options;

    const key = getMediaKey(message);

    if (preferCache && message.fileId) {
        return message.fileId;
    }

    if (preferCache) {
        const cachedFileId = getCachedFileId(key);

        if (cachedFileId) {
            return cachedFileId;
        }
    }

    return getLocalFileInput(message);
}

export function getAllCachedFileIds() {
    return { ...cache };
}

export function extractFileIdFromTelegramResponse(messageType, response) {
    if (!response) {
        return null;
    }

    if (messageType === 'photo' || response.photo) {
        const photos = response.photo || [];
        const largestPhoto = photos[photos.length - 1];

        if (largestPhoto?.file_id) {
            return largestPhoto.file_id;
        }
    }

    if (messageType === 'video' || response.video) {
        if (response.video?.file_id) {
            return response.video.file_id;
        }
    }

    if (messageType === 'videoNote' || response.video_note) {
        if (response.video_note?.file_id) {
            return response.video_note.file_id;
        }
    }

    if (response.document?.file_id) {
        return response.document.file_id;
    }

    if (response.audio?.file_id) {
        return response.audio.file_id;
    }

    if (response.voice?.file_id) {
        return response.voice.file_id;
    }

    if (response.animation?.file_id) {
        return response.animation.file_id;
    }

    return null;
}

export function rememberTelegramFileId(message, response) {
    const key = getMediaKey(message);

    if (!key) {
        return;
    }

    const fileId = extractFileIdFromTelegramResponse(message.type, response);

    if (fileId) {
        setCachedFileId(key, fileId);
    }
}

export function isWrongTelegramFileIdentifierError(error) {
    const description =
        error?.response?.description ||
        error?.description ||
        error?.message ||
        '';

    return (
        description.includes('wrong file identifier') ||
        description.includes('HTTP URL specified') ||
        description.includes('failed to get HTTP URL content') ||
        description.includes('file must be non-empty')
    );
}
