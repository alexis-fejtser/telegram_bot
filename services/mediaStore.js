import fs from 'fs';
import path from 'path';

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

export function getCachedFileId(key) {
    if (!key) return null;
    return cache[key] || null;
}

export function setCachedFileId(key, fileId) {
    if (!key || !fileId) return;

    cache[key] = fileId;
    saveCache();

    console.log(`Saved Telegram file_id: ${key} => ${fileId}`);
}

export function getMediaSource(message) {
    const key = message.assetKey || message.file;

    if (message.fileId) {
        return message.fileId;
    }

    const cachedFileId = getCachedFileId(key);

    if (cachedFileId) {
        return cachedFileId;
    }

    return { source: message.file };
}

export function extractFileIdFromTelegramResponse(messageType, response) {
    if (!response) return null;

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
    const key = message.assetKey || message.file;

    if (!key || message.fileId) {
        return;
    }

    const fileId = extractFileIdFromTelegramResponse(message.type, response);

    if (fileId) {
        setCachedFileId(key, fileId);
    }
}