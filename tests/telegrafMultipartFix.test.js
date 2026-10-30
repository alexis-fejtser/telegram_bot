import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Input, Telegraf } from 'telegraf';

import { applyTelegrafMultipartFix } from '../src/services/telegrafMultipartFix.js';
import { isWrongTelegramFileIdentifierError } from '../src/services/mediaStore.js';

const fixApplied = applyTelegrafMultipartFix();

const tempFiles = [];

function createTempFile(name, buffer) {
    const filePath = path.join(os.tmpdir(), `telegraf-media-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    fs.writeFileSync(filePath, buffer);
    tempFiles.push(filePath);
    return filePath;
}

function makePhotoBuffer(size = 64 * 1024) {
    const buffer = Buffer.alloc(size, 0x42);
    buffer[0] = 0xff;
    buffer[1] = 0xd8;
    buffer[2] = 0xff;
    return buffer;
}

function startCaptureServer(responder) {
    const requests = [];
    const sockets = new Set();

    const server = http.createServer((req, res) => {
        const chunks = [];
        const entry = { url: req.url, headers: req.headers, done: false, body: null };
        requests.push(entry);

        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
            entry.done = true;
            entry.body = Buffer.concat(chunks);
            responder(res, entry);
        });
    });

    server.on('connection', (socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
    });

    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            resolve({
                requests,
                port: server.address().port,
                close: () =>
                    new Promise((done) => {
                        for (const socket of sockets) {
                            socket.destroy();
                        }
                        server.close(() => done());
                    }),
            });
        });
    });
}

function respondWithMessage(res) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, result: { message_id: 1, photo: [{ file_id: 'TESTID' }] } }));
}

function createBot(port) {
    return new Telegraf('123:TEST', { telegram: { apiRoot: `http://127.0.0.1:${port}` } });
}

function extractBoundary(contentType = '') {
    const match = contentType.match(/boundary=(.+)$/);
    return match ? match[1] : null;
}

test.after(() => {
    for (const filePath of tempFiles) {
        fs.rmSync(filePath, { force: true });
    }
});

test('Фикс multipart применён к telegraf', () => {
    assert.equal(fixApplied, true);
});

test('Multipart fix: sendPhoto с локальным файлом доходит целиком (тело не зависает)', async () => {
    const photoBuffer = makePhotoBuffer();
    const photoPath = createTempFile('photo.jpg', photoBuffer);
    const capture = await startCaptureServer(respondWithMessage);

    try {
        const bot = createBot(capture.port);
        const result = await bot.telegram.sendPhoto(111, Input.fromLocalFile(photoPath), { caption: 'привет' });

        assert.equal(result.message_id, 1);

        const [request] = capture.requests;
        assert.equal(request.done, true);
        assert.equal(request.url, '/bot123:TEST/sendPhoto');
        assert.match(request.headers['content-type'], /^multipart\/form-data; boundary=/);

        const body = request.body.toString('latin1');
        assert.ok(request.body.includes(Buffer.from([0xff, 0xd8, 0xff])), 'файл должен присутствовать в теле');
        assert.match(body, /name="chat_id"/);
        assert.match(body, /name="caption"/);
        assert.ok(request.body.length >= photoBuffer.length + 200, 'тело должно содержать файл и multipart-обёртку');

        const boundary = extractBoundary(request.headers['content-type']);
        assert.ok(boundary, 'boundary должен быть в заголовке');
        assert.ok(body.endsWith(`--${boundary}--`), 'тело должно корректно закрываться хвостовым boundary');
    } finally {
        await capture.close();
    }
});

test('Multipart fix: крупный файл стримится целиком без зависания', async () => {
    const bigBuffer = Buffer.alloc(3 * 1024 * 1024, 0x5a);
    const bigPath = createTempFile('big.bin', bigBuffer);
    const capture = await startCaptureServer(respondWithMessage);

    try {
        const bot = createBot(capture.port);
        await bot.telegram.sendDocument(111, Input.fromLocalFile(bigPath));

        const [request] = capture.requests;
        assert.equal(request.done, true);
        assert.ok(request.body.length >= bigBuffer.length, `получено ${request.body.length}, ожидалось >= ${bigBuffer.length}`);
    } finally {
        await capture.close();
    }
});

test('Multipart fix: ошибка Telegram API доходит до кода сцены', async () => {
    const photoPath = createTempFile('wrong-id.jpg', makePhotoBuffer(1024));
    const capture = await startCaptureServer((res) => {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(
            JSON.stringify({
                ok: false,
                error_code: 400,
                description: 'Bad Request: wrong file identifier/HTTP URL specified',
            })
        );
    });

    try {
        const bot = createBot(capture.port);

        await assert.rejects(
            () => bot.telegram.sendPhoto(111, Input.fromLocalFile(photoPath)),
            (error) => {
                assert.equal(isWrongTelegramFileIdentifierError(error), true);
                return true;
            }
        );
    } finally {
        await capture.close();
    }
});
