import { Readable } from 'node:stream';
import { createRequire } from 'node:module';

import { logger } from '../config/logger.js';

let applied = false;

const states = new WeakMap();

function toBuffer(value) {
    if (value == null) {
        return null;
    }

    return Buffer.isBuffer(value) ? value : Buffer.from(String(value));
}

function toReadable(part) {
    if (part == null) {
        return null;
    }

    if (typeof part.pipe === 'function') {
        return part;
    }

    return Readable.from([toBuffer(part)]);
}

function getState(stream) {
    let state = states.get(stream);

    if (!state) {
        state = {
            parts: [],
            started: false,
            finished: false,
            separatorPending: false,
            // pendingResolve — колбэк пробуждения pump после бэкпрешера.
            // _read вызывает его, сигнализируя, что потребитель готов принять данные.
            // pump повторяет stream.push() для ТОГО ЖЕ буфера — без дублирования данных.
            pendingResolve: null,
            pumping: false,
        };
        states.set(stream, state);
    }

    return state;
}

// push() возвращает false при бэкпрешере. Ждём сигнала _read и повторяем
// push того же буфера до тех пор, пока он не будет принят.
// Важно: данные не дублируются — push вызывается только один раз при успехе.
async function pushChunk(stream, state, value) {
    const buffer = toBuffer(value);

    if (!buffer || buffer.length === 0) {
        return;
    }

    while (!stream.push(buffer)) {
        // Поток переполнен — ждём, пока _read не сигнализирует о готовности.
        await new Promise((resolve) => {
            state.pendingResolve = resolve;
        });
    }
}

async function pump(stream, state) {
    if (!state.started) {
        state.started = true;
        await pushChunk(stream, state, stream.head);
    }

    while (!state.finished) {
        if (state.parts.length === 0) {
            // Части добавляются до старта отправки, но даём одну макрозадачу
            // форы, чтобы не отсечь часть, добавленную чуть позже.
            await new Promise((resolve) => setImmediate(resolve));

            if (state.parts.length === 0) {
                await pushChunk(stream, state, stream.tail);
                state.finished = true;
                stream.push(null);
                return;
            }
        }

        if (state.separatorPending) {
            await pushChunk(stream, state, stream.separator);
        }

        const part = state.parts.shift();
        state.separatorPending = true;

        for await (const chunk of part) {
            await pushChunk(stream, state, chunk);
        }
    }
}

function installPump(MultipartStream) {
    MultipartStream.prototype.add = function add(part) {
        const state = getState(this);
        const readable = toReadable(part);

        if (readable && !state.finished) {
            state.parts.push(readable);
        }

        return this;
    };

    MultipartStream.prototype._read = function read() {
        const state = getState(this);

        if (state.finished) {
            return;
        }

        // Потребитель готов принять данные — пробуждаем pump, если он ожидает
        // бэкпрешер. pump повторит stream.push() для того же буфера.
        if (state.pendingResolve) {
            const resolve = state.pendingResolve;
            state.pendingResolve = null;
            resolve();
            return;
        }

        if (!state.pumping) {
            state.pumping = true;
            pump(this, state).catch((error) => this.destroy(error));
        }
    };
}

/**
 * Лечит загрузку медиа в telegraf 4.16.x на Node 26.
 *
 * Telegraf собирает multipart через sandwich-stream (пакет 2019 года).
 * На новых Node его прокачка данных перестаёт работать: файл записывается
 * в часть, но потребителю не отдаётся — тело запроса зависает, Telegram рвёт
 * соединение ("socket hang up"), а `sendPhoto`/`sendVideo` никогда не
 * завершаются. Текстовые методы не страдают, т.к. отправляют JSON.
 *
 * Патчим только прокачку (add/_read), оставляя всю остальную логику Telegraf.
 *
 * Исправление бэкпрешера (v2):
 * Предыдущая версия хранила pendingChunk и пыталась повторить push() в _read.
 * Проблема: stream.push() всегда добавляет данные в буфер (даже при false),
 * поэтому каждый повторный вызов в _read дублировал один и тот же кусок файла,
 * накапливая лишние байты → Telegram отвечал 413 Request Entity Too Large.
 * Исправление: хранить только колбэк пробуждения (pendingResolve), вызывать его
 * из _read, а pump повторяет push() самостоятельно через while-цикл в pushChunk.
 */
export function applyTelegrafMultipartFix() {
    if (applied) {
        return true;
    }

    let MultipartStream = null;

    try {
        const require = createRequire(import.meta.url);

        // Гарантируем, что CJS-сборка telegraf загружена и есть в require.cache
        require('telegraf');

        const entry = Object.entries(require.cache).find(
            ([id]) => id.includes('telegraf') && id.includes('multipart-stream')
        );

        MultipartStream = entry?.[1]?.exports?.default || null;
    } catch (error) {
        logger.warn('Не удалось применить фикс multipart Telegraf:', { message: error.message });
        return false;
    }

    if (typeof MultipartStream !== 'function') {
        logger.warn('Фикс multipart Telegraf не применён: MultipartStream не найден (изменилась внутренняя структура telegraf)');
        return false;
    }

    installPump(MultipartStream);
    applied = true;

    logger.info('Применён фикс multipart Telegraf v2: загрузка медиа работает на текущей версии Node');

    return true;
}
