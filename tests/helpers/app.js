import http from 'node:http';
import { createApiServer } from '../../api/server.js';
import { connectTestDb } from './db.js';

export function createBotStub() {
    const sentMessages = [];
    const state = { failWith: null };

    return {
        sentMessages,
        state,
        telegram: {
            async sendMessage(chatId, text, options) {
                if (state.failWith) {
                    const error = new Error(state.failWith.message);
                    error.code = state.failWith.code;
                    throw error;
                }

                sentMessages.push({ type: 'message', chatId, text, options });
                return { message_id: sentMessages.length };
            },
            async sendPhoto(chatId, photo, options) {
                if (state.failWith) {
                    const error = new Error(state.failWith.message);
                    error.code = state.failWith.code;
                    throw error;
                }
                sentMessages.push({ type: 'photo', chatId, photo, options });
                return {
                    message_id: sentMessages.length,
                    photo: [
                        { file_id: 'thumb_id_1' },
                        { file_id: 'photo_test_file_id_999' },
                    ],
                };
            },
            async sendVideo(chatId, video, options) {
                if (state.failWith) {
                    const error = new Error(state.failWith.message);
                    error.code = state.failWith.code;
                    throw error;
                }
                sentMessages.push({ type: 'video', chatId, video, options });
                return {
                    message_id: sentMessages.length,
                    video: { file_id: 'video_test_file_id_888' },
                };
            },
            async sendVideoNote(chatId, videoNote, options) {
                if (state.failWith) {
                    const error = new Error(state.failWith.message);
                    error.code = state.failWith.code;
                    throw error;
                }
                sentMessages.push({ type: 'videoNote', chatId, videoNote, options });
                return {
                    message_id: sentMessages.length,
                    video_note: { file_id: 'note_test_file_id_777' },
                };
            },
            async sendDocument(chatId, document, options) {
                if (state.failWith) {
                    const error = new Error(state.failWith.message);
                    error.code = state.failWith.code;
                    throw error;
                }
                sentMessages.push({ type: 'document', chatId, document, options });
                return {
                    message_id: sentMessages.length,
                    document: { file_id: 'doc_test_file_id_666' },
                };
            },
        },
    };
}

export async function startTestServer() {
    await connectTestDb();

    const bot = createBotStub();
    const app = createApiServer(bot);
    const server = http.createServer(app);

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;

    return {
        baseUrl,
        bot,
        async request(path, { method = 'GET', body } = {}) {
            const response = await fetch(`${baseUrl}${path}`, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: body === undefined ? undefined : JSON.stringify(body),
            });

            let parsedBody = null;
            try {
                parsedBody = await response.json();
            } catch {
                parsedBody = null;
            }

            return { status: response.status, body: parsedBody };
        },
        async close() {
            await new Promise((resolve) => server.close(resolve));
        },
    };
}
