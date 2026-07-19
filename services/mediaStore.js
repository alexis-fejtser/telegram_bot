import fs from 'fs';
import path from 'path';
import { Input } from 'telegraf';

const CACHE_DIR = './.cache';
const CACHE_FILE = path.join(CACHE_DIR, 'telegram-file-ids.json');

let cache = {};

loadCache();

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
    if (!message.file) {
        throw new Error(`Local file path is not specified for asset: ${getMediaKey(message)}`);
    }

    const absolutePath = path.resolve(process.cwd(), message.file);

    if (!fs.existsSync(absolutePath)) {
        throw new Error(`Local media file not found: ${absolutePath}`);
    }

    return Input.fromLocalFile(absolutePath);
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

export function extractFileIdFromTelegramResponse(messageType, response) {
    if (!response) {
        return null;
    }

    if (messageType === 'photo') {
        const photos = response.photo || [];
        const largestPhoto = photos[photos.length - 1];

        return largestPhoto?.file_id || null;
    }

    if (messageType === 'video') {
        return response.video?.file_id || null;
    }

    if (messageType === 'videoNote') {
        return response.video_note?.file_id || null;
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