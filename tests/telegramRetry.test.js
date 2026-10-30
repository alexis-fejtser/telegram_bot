import test from 'node:test';
import assert from 'node:assert/strict';

import {
    attachTelegramRetry,
    createTelegramAgent,
    isRetryableTelegramError,
} from '../src/services/telegramTransport.js';
import { getLocalFileInput } from '../src/services/mediaStore.js';

const RETRY_DELAYS_MS = [1, 1];

function makeFetchError(reason) {
    const error = new Error(`request to https://api.telegram.org/bot123/sendPhoto failed, reason: ${reason}`);
    error.name = 'FetchError';
    return error;
}

test('Transport: агент отключает keepAlive и фиксирует IPv4 + TLS 1.2', () => {
    const agent = createTelegramAgent();

    assert.equal(agent.keepAlive, false);
    assert.equal(agent.options.family, 4);
    assert.equal(agent.options.minVersion, 'TLSv1.2');
    assert.equal(agent.options.maxVersion, 'TLSv1.2');
});

test('Transport: сетевые сбои считаются повторяемыми, ошибки API — нет', () => {
    assert.equal(isRetryableTelegramError(makeFetchError('socket hang up')), true);
    assert.equal(
        isRetryableTelegramError(
            makeFetchError('SSL routines:tls_get_more_records:decryption failed or bad record mac')
        ),
        true
    );
    assert.equal(
        isRetryableTelegramError(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })),
        true
    );

    const apiError = new Error('Bad Request: chat not found');
    apiError.code = 400;
    assert.equal(isRetryableTelegramError(apiError), false);
    assert.equal(isRetryableTelegramError(new Error('unexpected failure')), false);
    assert.equal(isRetryableTelegramError(null), false);
});

test('Transport: сетевой сбой повторяется, успешная попытка возвращает результат', async () => {
    let calls = 0;
    const telegram = {
        async callApi() {
            calls += 1;

            if (calls < 3) {
                throw makeFetchError('socket hang up');
            }

            return { ok: true };
        },
    };

    attachTelegramRetry(telegram, { maxAttempts: 3, delaysMs: RETRY_DELAYS_MS });

    const result = await telegram.callApi('sendMessage', { chat_id: 1, text: 'hello' });

    assert.deepEqual(result, { ok: true });
    assert.equal(calls, 3);
});

test('Transport: ошибка Telegram API не повторяется', async () => {
    let calls = 0;
    const telegram = {
        async callApi() {
            calls += 1;
            const error = new Error('Bad Request: chat not found');
            error.code = 400;
            throw error;
        },
    };

    attachTelegramRetry(telegram, { maxAttempts: 3, delaysMs: RETRY_DELAYS_MS });

    await assert.rejects(
        () => telegram.callApi('sendMessage', { chat_id: 1, text: 'x' }),
        /chat not found/
    );
    assert.equal(calls, 1);
});

test('Transport: медиа-поток пересоздаётся на каждую попытку, file_id не подменяется', async () => {
    const captured = [];
    const telegram = {
        async callApi(method, payload) {
            captured.push(payload.photo);
            throw makeFetchError('socket hang up');
        },
    };

    attachTelegramRetry(telegram, { maxAttempts: 3, delaysMs: RETRY_DELAYS_MS });

    const input = getLocalFileInput({ file: 'package.json', assetKey: 'retry-test-asset' });

    await assert.rejects(() => telegram.callApi('sendPhoto', { chat_id: 1, photo: input }));

    assert.equal(captured.length, 3);
    assert.equal(captured[0], input);
    assert.notEqual(captured[1], input);
    assert.notEqual(captured[2], captured[1]);

    const capturedFileIds = [];
    const telegramWithFileId = {
        async callApi(method, payload) {
            capturedFileIds.push(payload.photo);
            throw makeFetchError('socket hang up');
        },
    };

    attachTelegramRetry(telegramWithFileId, { maxAttempts: 2, delaysMs: [1] });

    await assert.rejects(() => telegramWithFileId.callApi('sendPhoto', { chat_id: 1, photo: 'AGADfileid' }));

    assert.deepEqual(capturedFileIds, ['AGADfileid', 'AGADfileid']);
});
