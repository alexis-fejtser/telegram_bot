import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Telegram } from 'telegraf';

import { logger } from '../config/logger.js';
import { recreateUploadInput } from './mediaStore.js';

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1500, 3000];

// Сетевые сбои, при которых запрос имеет смысл повторить.
const RETRYABLE_MESSAGE_PATTERNS = [
    'socket hang up',
    'decryption failed',
    'bad record mac',
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'EPIPE',
    'EAI_AGAIN',
    'fetch failed',
    'Client network socket disconnected',
];

const RETRYABLE_ERROR_CODES = new Set([
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'EPIPE',
    'EPROTO',
    'EAI_AGAIN',
]);

/**
 * HTTPS-агент для api.telegram.org.
 */
export function createTelegramAgent() {
    return new https.Agent({
        keepAlive: false,
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.2',
        family: 4,
        timeout: 30000,
    });
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Проверяет, содержит ли payload локальные файлы (Input.fromLocalFile или ReadStream),
 * требующие multipart/form-data загрузки.
 */
function hasLocalMedia(payload) {
    if (!payload || typeof payload !== 'object') {
        return false;
    }

    for (const [key, value] of Object.entries(payload)) {
        if (!value || typeof value !== 'object') continue;

        // Одиночный файл: { source: '...', filename?: '...' }
        if (value.source) {
            return true;
        }

        // Альбом: media: [ { type: 'photo', media: { source: '...' } }, ... ]
        if (key === 'media' && Array.isArray(value)) {
            const hasSourceInArray = value.some(
                (item) => item?.media && typeof item.media === 'object' && item.media.source
            );
            if (hasSourceInArray) return true;
        }
    }

    return false;
}

/**
 * Отправляет запрос через нативный глобальный fetch() и FormData (Node.js).
 * Это полностью решает проблему sandwich-stream/node-fetch в Telegraf на Node 26,
 * отправляя файлы (фото, видео, кружки video_note) мгновенно, без зависаний и 413.
 */
async function callApiWithNativeFetch(token, method, payload, callOptions) {
    const form = new FormData();

    for (const [key, value] of Object.entries(payload)) {
        if (value == null) {
            continue;
        }

        // Одиночное медиа (photo, video, video_note, document, audio, voice, animation)
        if (value && typeof value === 'object' && value.source) {
            let filePath = value.source;
            if (typeof filePath === 'string') {
                if (!path.isAbsolute(filePath)) {
                    filePath = path.resolve(process.cwd(), filePath);
                }
                const buffer = fs.readFileSync(filePath);
                const fileName = value.filename || path.basename(filePath);
                form.append(key, new Blob([buffer]), fileName);
            } else if (Buffer.isBuffer(filePath)) {
                const fileName = value.filename || `${key}.dat`;
                form.append(key, new Blob([filePath]), fileName);
            }
            continue;
        }

        // Медиагруппа (sendMediaGroup)
        if (key === 'media' && Array.isArray(value)) {
            const processedMedia = [];
            for (const item of value) {
                if (item && item.media && typeof item.media === 'object' && item.media.source) {
                    const attachId = crypto.randomBytes(16).toString('hex');
                    let filePath = item.media.source;
                    if (typeof filePath === 'string') {
                        if (!path.isAbsolute(filePath)) {
                            filePath = path.resolve(process.cwd(), filePath);
                        }
                        const buffer = fs.readFileSync(filePath);
                        const fileName = item.media.filename || path.basename(filePath);
                        form.append(attachId, new Blob([buffer]), fileName);
                    }
                    processedMedia.push({ ...item, media: `attach://${attachId}` });
                } else {
                    processedMedia.push(item);
                }
            }
            form.append('media', JSON.stringify(processedMedia));
            continue;
        }

        // Объекты (reply_markup, etc.)
        if (typeof value === 'object') {
            form.append(key, JSON.stringify(value));
            continue;
        }

        // Примитивы (chat_id, caption, parse_mode, etc.)
        form.append(key, String(value));
    }

    const apiUrl = `https://api.telegram.org/bot${token}/${method}`;
    const response = await fetch(apiUrl, {
        method: 'POST',
        body: form,
        signal: callOptions?.signal,
    });

    const data = await response.json();

    if (!data.ok) {
        const error = new Error(data.description || 'Telegram API Error');
        error.response = data;
        error.code = data.error_code;
        error.description = data.description;
        throw error;
    }

    return data.result;
}

/**
 * Отличает сетевые сбои (сокет, TLS, таймаут) от ошибок Telegram API.
 * Ошибки API (400/401/429 и т.п.) повторять бессмысленно — у них числовой code.
 */
export function isRetryableTelegramError(error) {
    if (!error) {
        return false;
    }

    if (typeof error.code === 'number') {
        return false;
    }

    const message = [
        error.message,
        error.response?.description,
        error.description,
        error.cause?.message,
    ]
        .filter(Boolean)
        .join(' ');

    if (RETRYABLE_MESSAGE_PATTERNS.some((pattern) => message.includes(pattern))) {
        return true;
    }

    return RETRYABLE_ERROR_CODES.has(error.code) || RETRYABLE_ERROR_CODES.has(error.cause?.code);
}

// Медиа-потоки (Input.fromLocalFile) одноразовые: повторная отправка того же
// объекта ушла бы пустым файлом. Пересоздаём их из локального файла,
// file_id-строки и обычные поля оставляем как есть.
function rebuildPayload(payload) {
    if (!payload || typeof payload !== 'object') {
        return payload;
    }

    const next = { ...payload };

    for (const key of Object.keys(next)) {
        const freshInput = recreateUploadInput(next[key]);

        if (freshInput) {
            next[key] = freshInput;
        }
    }

    return next;
}

// Патчим ApiClient.prototype.callApi на уровне класса.
// Это гарантирует, что ВСЕ вызовы (и bot.telegram.sendPhoto, и ctx.replyWithVideoNote,
// и любые middleware) автоматически используют нативный fetch для локальных медиафайлов.
let prototypeHooked = false;

function ensureApiClientPrototypeHooked() {
    if (prototypeHooked) return;

    try {
        const ApiClientProto = Object.getPrototypeOf(Telegram.prototype);
        if (ApiClientProto && typeof ApiClientProto.callApi === 'function') {
            const originalProtoCallApi = ApiClientProto.callApi;

            ApiClientProto.callApi = async function patchedCallApi(method, payload, callOptions) {
                if (this.token && hasLocalMedia(payload)) {
                    return await callApiWithNativeFetch(this.token, method, payload, callOptions);
                }
                return await originalProtoCallApi.call(this, method, payload, callOptions);
            };

            prototypeHooked = true;
        }
    } catch (e) {
        logger.warn('Не удалось пропатчить ApiClient.prototype:', e);
    }
}

// Применяем хук к прототипу сразу при загрузке модуля
ensureApiClientPrototypeHooked();

/**
 * Оборачивает telegram.callApi:
 * 1. Загрузка локальных медиа-файлов выполняется через нативный fetch + FormData (быстро, надежно, без 413).
 * 2. Все остальные запросы (JSON, polling, отправка по file_id) идут через оригинальный Telegraf client.
 * 3. Сетевые сбои (обрыв сокета/TLS) повторяются до MAX_ATTEMPTS раз.
 */
export function attachTelegramRetry(telegram, options = {}) {
    ensureApiClientPrototypeHooked();

    const { maxAttempts = MAX_ATTEMPTS, delaysMs = RETRY_DELAYS_MS } = options;
    const originalCallApi = telegram.callApi.bind(telegram);
    const token = telegram.token;

    telegram.callApi = async function callApiWithRetry(method, payload, callOptions) {
        let lastError = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const attemptPayload = attempt === 1 ? payload : rebuildPayload(payload);

            try {
                // Если есть токен и локальные медиафайлы — используем нативный fetch + FormData
                if (token && hasLocalMedia(attemptPayload)) {
                    return await callApiWithNativeFetch(token, method, attemptPayload, callOptions);
                }

                return await originalCallApi(method, attemptPayload, callOptions);
            } catch (error) {
                lastError = error;

                const canRetry =
                    attempt < maxAttempts &&
                    isRetryableTelegramError(error) &&
                    !callOptions?.signal?.aborted;

                if (!canRetry) {
                    throw error;
                }

                const delayMs = delaysMs[attempt - 1] ?? delaysMs[delaysMs.length - 1];

                logger.warn('Telegram API: сетевая ошибка, повтор запроса', {
                    method,
                    attempt,
                    maxAttempts,
                    delayMs,
                    message: error.message,
                });

                await delay(delayMs);
            }
        }

        throw lastError;
    };

    return telegram;
}
