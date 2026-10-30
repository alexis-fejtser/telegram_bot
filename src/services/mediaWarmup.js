import fs from 'node:fs';
import path from 'node:path';
import { Input } from 'telegraf';
import { Asset } from '../models/Asset.js';
import { Scene } from '../models/Scene.js';
import { getSettings } from './settingsService.js';
import {
    getCachedFileId,
    setCachedFileId,
    extractFileIdFromTelegramResponse,
} from './mediaStore.js';
import { createModuleLogger } from '../config/logger.js';

const log = createModuleLogger('mediaWarmup');

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Разрешает локальный путь к медиафайлу на диске.
 */
export function resolveMediaFilePath(filePath) {
    if (!filePath || typeof filePath !== 'string') {
        return null;
    }

    // 1. Прямой абсолютный путь или путь от process.cwd()
    if (path.isAbsolute(filePath) && fs.existsSync(filePath)) {
        return filePath;
    }

    const relCwd = path.resolve(process.cwd(), filePath);
    if (fs.existsSync(relCwd)) {
        return relCwd;
    }

    // 2. Fallback: src/<filePath>
    const cleanRelative = filePath.replace(/^\.?\//, '');
    const inSrc = path.resolve(process.cwd(), 'src', cleanRelative);
    if (fs.existsSync(inSrc)) {
        return inSrc;
    }

    // 3. Fallback: uploads/<basename>
    const base = path.basename(filePath);
    const inUploads = path.resolve(process.cwd(), 'uploads', base);
    if (fs.existsSync(inUploads)) {
        return inUploads;
    }

    // 4. Fallback: src/scenes/<basename>
    const inScenes = path.resolve(process.cwd(), 'src', 'scenes', base);
    if (fs.existsSync(inScenes)) {
        return inScenes;
    }

    return null;
}

/**
 * Собирает все уникальные медиафайлы из БД (Asset, Scene) и файловой системы (uploads, src/scenes).
 */
export async function collectAllMediaItems() {
    const itemsMap = new Map();

    // 1. Все ассеты из таблицы Asset
    try {
        const assets = await Asset.findAll();
        for (const asset of assets) {
            const key = asset.assetKey;
            if (key) {
                itemsMap.set(key, {
                    key,
                    assetKey: key,
                    filePath: asset.filePath,
                    mediaType: asset.mediaType || 'photo',
                    source: 'asset',
                });
            }
        }
    } catch (e) {
        log.warn('Could not load assets from DB:', { message: e.message });
    }

    // 2. Все медиа из шагов сценариев (Scene)
    try {
        const scenes = await Scene.findAll();
        for (const scene of scenes) {
            const steps = Array.isArray(scene.steps) ? scene.steps : [];
            for (const step of steps) {
                const messages = Array.isArray(step.messages) ? step.messages : [];
                for (const msg of messages) {
                    const isMedia = ['photo', 'video', 'videoNote', 'document'].includes(msg.type) || msg.file || msg.assetKey;
                    if (!isMedia) continue;

                    const key = msg.assetKey || msg.file;
                    if (!key) continue;

                    if (!itemsMap.has(key)) {
                        itemsMap.set(key, {
                            key,
                            assetKey: msg.assetKey || null,
                            filePath: msg.file || null,
                            mediaType: msg.type || 'photo',
                            source: `scene:${scene.sceneId}`,
                        });
                    } else {
                        const existing = itemsMap.get(key);
                        if (!existing.filePath && msg.file) {
                            existing.filePath = msg.file;
                        }
                    }
                }
            }
        }
    } catch (e) {
        log.warn('Could not load scenes from DB:', { message: e.message });
    }

    // 3. Файлы из директории uploads/
    try {
        const uploadsDir = path.resolve(process.cwd(), 'uploads');
        if (fs.existsSync(uploadsDir)) {
            const files = fs.readdirSync(uploadsDir);
            for (const file of files) {
                const ext = path.extname(file).toLowerCase();
                const isPhoto = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
                const isVideo = ['.mp4', '.mov', '.avi', '.webm'].includes(ext);
                if (isPhoto || isVideo) {
                    const alreadyPresent = Array.from(itemsMap.values()).some((it) => {
                        return it.filePath && path.basename(it.filePath) === file;
                    });
                    if (!alreadyPresent) {
                        const key = path.basename(file, ext);
                        itemsMap.set(key, {
                            key,
                            assetKey: key,
                            filePath: `uploads/${file}`,
                            mediaType: isVideo ? 'video' : 'photo',
                            source: 'uploads_dir',
                        });
                    }
                }
            }
        }
    } catch (e) {
        log.warn('Could not scan uploads dir:', { message: e.message });
    }

    // 4. Файлы из директории src/scenes/
    try {
        const scenesDir = path.resolve(process.cwd(), 'src', 'scenes');
        if (fs.existsSync(scenesDir)) {
            const files = fs.readdirSync(scenesDir);
            for (const file of files) {
                const ext = path.extname(file).toLowerCase();
                const isPhoto = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
                const isVideo = ['.mp4', '.mov', '.avi', '.webm'].includes(ext);
                if (isPhoto || isVideo) {
                    const alreadyPresent = Array.from(itemsMap.values()).some((it) => {
                        return it.filePath && path.basename(it.filePath) === file;
                    });
                    if (!alreadyPresent) {
                        const key = path.basename(file, ext);
                        itemsMap.set(key, {
                            key,
                            assetKey: key,
                            filePath: `src/scenes/${file}`,
                            mediaType: isVideo ? 'video' : 'photo',
                            source: 'scenes_dir',
                        });
                    }
                }
            }
        }
    } catch (e) {
        log.warn('Could not scan src/scenes dir:', { message: e.message });
    }

    return Array.from(itemsMap.values());
}

/**
 * Прогревает один медиа-элемент: отправляет в чат менеджеру и сохраняет file_id.
 */
export async function warmupMediaItem({ bot, managerId, item, force = false }) {
    const key = item.key;
    const existingFileId =
        getCachedFileId(key) ||
        (item.assetKey && getCachedFileId(item.assetKey)) ||
        (item.filePath && getCachedFileId(item.filePath));

    if (existingFileId && !force) {
        return {
            status: 'skipped',
            key,
            fileId: existingFileId,
            reason: 'Already cached',
        };
    }

    const resolvedPath = resolveMediaFilePath(item.filePath);
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
        return {
            status: 'failed',
            key,
            error: `File not found on disk: ${item.filePath || 'unspecified'}`,
        };
    }

    const input = Input.fromLocalFile(resolvedPath);
    const mediaType = item.mediaType || 'photo';
    const caption = `🔥 [Прогрев кэша]\n🔑 Ключ: ${key}\n📁 Файл: ${path.basename(resolvedPath)}`;
    const sendOpts = { disable_notification: true };

    let response = null;
    let attempt = 0;
    const maxRetries = 3;

    while (attempt < maxRetries) {
        attempt++;
        try {
            if (mediaType === 'videoNote') {
                // Telegram sendVideoNote не поддерживает caption
                response = await bot.telegram.sendVideoNote(managerId, input, sendOpts);
            } else if (mediaType === 'video') {
                response = await bot.telegram.sendVideo(managerId, input, { ...sendOpts, caption });
            } else if (mediaType === 'photo') {
                response = await bot.telegram.sendPhoto(managerId, input, { ...sendOpts, caption });
            } else {
                response = await bot.telegram.sendDocument(managerId, input, { ...sendOpts, caption });
            }
            break;
        } catch (error) {
            // Telegram rate limit (429)
            if (error.code === 429 || error.parameters?.retry_after) {
                const waitSec = error.parameters?.retry_after || 2;
                log.warn(`Telegram rate limit (429), waiting ${waitSec}s before retry...`);
                await delay(waitSec * 1000);
                continue;
            }

            // Фатальные ошибки доступа
            const desc = error.message || error.description || '';
            if (desc.includes('chat not found') || desc.includes('bot was blocked') || desc.includes('Forbidden')) {
                throw error;
            }

            if (attempt >= maxRetries) {
                return {
                    status: 'failed',
                    key,
                    error: `Telegram send error: ${error.message}`,
                };
            }
            await delay(1000);
        }
    }

    const fileId = extractFileIdFromTelegramResponse(mediaType, response);
    if (!fileId) {
        return {
            status: 'failed',
            key,
            error: 'Could not extract file_id from Telegram response',
        };
    }

    // Сохраняем в кэш под всеми релевантными ключами
    setCachedFileId(key, fileId);
    if (item.assetKey && item.assetKey !== key) {
        setCachedFileId(item.assetKey, fileId);
    }
    if (item.filePath) {
        setCachedFileId(item.filePath, fileId);
        setCachedFileId(path.basename(item.filePath), fileId);
    }

    return {
        status: 'warmed',
        key,
        fileId,
        mediaType,
        filePath: resolvedPath,
    };
}

/**
 * Прогревает все медиафайлы в file-id кэш за счёт рассылки медиа на manager_id.
 */
export async function warmupMediaCache({
    bot,
    managerId,
    force = false,
    delayMs = 600,
    onProgress,
} = {}) {
    if (!bot || !bot.telegram) {
        throw new Error('Экземпляр Telegraf бота не передан');
    }

    const effectiveManagerId = managerId || getSettings().managerId || process.env.MANAGER_ID;
    if (!effectiveManagerId) {
        throw new Error('MANAGER_ID не задан. Укажите MANAGER_ID в настройках бота или .env');
    }

    const items = await collectAllMediaItems();
    if (items.length === 0) {
        return {
            success: true,
            total: 0,
            warmed: 0,
            skipped: 0,
            failed: 0,
            message: 'Медиафайлов для прогрева не найдено',
            results: [],
        };
    }

    // Уведомление о старте прогрева менеджеру
    try {
        await bot.telegram.sendMessage(
            effectiveManagerId,
            `🚀 <b>Запуск прогрева медиа в file-id кэш</b>\n\n` +
            `📦 Всего медиафайлов: <b>${items.length}</b>\n` +
            `⚙️ Режим: <b>${force ? 'Принудительный (перепрогреть все)' : 'Обычный (только отсутствующие в кэше)'}</b>`,
            { parse_mode: 'HTML', disable_notification: true }
        );
    } catch (startError) {
        const desc = startError.message || startError.description || '';
        if (desc.includes('chat not found')) {
            throw new Error(`Менеджер (${effectiveManagerId}) не нажал /start в боте. Отправьте /start в бота с этого аккаунта и повторите попытку.`);
        }
        if (desc.includes('bot was blocked') || desc.includes('Forbidden')) {
            throw new Error(`Бот заблокирован пользователем MANAGER_ID (${effectiveManagerId}). Разблокируйте бота и повторите попытку.`);
        }
        log.warn('Could not send warmup start notification to manager:', { message: startError.message });
    }

    let warmedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const results = [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        let result;

        try {
            result = await warmupMediaItem({
                bot,
                managerId: effectiveManagerId,
                item,
                force,
            });
        } catch (itemError) {
            result = {
                status: 'failed',
                key: item.key,
                error: itemError.message,
            };
        }

        if (result.status === 'warmed') {
            warmedCount++;
            await delay(delayMs);
        } else if (result.status === 'skipped') {
            skippedCount++;
        } else {
            failedCount++;
        }

        results.push(result);
        if (onProgress) {
            onProgress({
                current: i + 1,
                total: items.length,
                item,
                result,
                warmed: warmedCount,
                skipped: skippedCount,
                failed: failedCount,
            });
        }
    }

    // Уведомление об окончании прогрева менеджеру
    try {
        await bot.telegram.sendMessage(
            effectiveManagerId,
            `✅ <b>Прогрев медиафайлов завершён!</b>\n\n` +
            `📊 <b>Результаты:</b>\n` +
            `• Всего обработано: <b>${items.length}</b>\n` +
            `• 🔥 Прогрето (получен file_id): <b>${warmedCount}</b>\n` +
            `• ⏩ Уже было в кэше: <b>${skippedCount}</b>\n` +
            `• ❌ Ошибок: <b>${failedCount}</b>`,
            { parse_mode: 'HTML' }
        );
    } catch (endError) {
        log.warn('Could not send warmup completion notification to manager:', { message: endError.message });
    }

    return {
        success: true,
        total: items.length,
        warmed: warmedCount,
        skipped: skippedCount,
        failed: failedCount,
        results,
    };
}

