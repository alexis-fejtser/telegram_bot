import crypto from 'node:crypto';

import { Setting } from '../models/Setting.js';
import {
    ADMIN_SECRET,
    BOT_TOKEN,
    CONSULTATION_PHONE_TEXT,
    LEAD_NEXT_DELAY_MS,
    MANAGER_ID,
    STEP_DELAY_MS,
    STEP_TIMEOUT_MS,
} from '../config/config.js';

export const SETTING_KEY = 'bot';

export const MAX_TIMER_MS = 86_400_000;
export const MAX_TEXT_LENGTH = 4096;

export const DEFAULT_TEXTS = {
    consultation: CONSULTATION_PHONE_TEXT,
    questionPrompt: 'Напишите ваш вопрос одним сообщением:',
    questionThanks: 'Спасибо, ваш вопрос отправлен. Менеджер свяжется с вами.',
    questionError: 'Не удалось отправить вопрос менеджеру. Попробуйте позже.',
    questionNotText: 'Пожалуйста, отправьте вопрос текстом.',
    managerNotification: [
        '📩 <b>Новый вопрос из Telegram-бота</b>',
        '',
        '👤 <b>Имя:</b> {name}',
        '🔗 <b>Username:</b> {username}',
        '🆔 <b>Telegram ID:</b> {telegramId}',
        '👁 <b>Профиль:</b> <a href="tg://user?id={telegramId}">открыть</a>',
        '',
        '<b>❓ Вопрос:</b>',
        '{question}',
    ].join('\n'),
};

export const TIMER_FIELDS = {
    stepDelayMs: 'Задержка между сообщениями шага',
    stepTimeoutMs: 'Таймаут автоперехода шага',
    leadNextDelayMs: 'Задержка после лида (консультация)',
};

let cache = null;
let initialBotToken = null;

function buildEffective(doc) {
    const docTexts = doc?.texts || {};
    const texts = {};

    for (const [key, defaultValue] of Object.entries(DEFAULT_TEXTS)) {
        texts[key] = docTexts[key] || defaultValue;
    }

    return {
        botToken: doc?.botToken || BOT_TOKEN || '',
        managerId: doc?.managerId || MANAGER_ID || '',
        stepDelayMs: Number.isFinite(doc?.stepDelayMs) ? doc.stepDelayMs : STEP_DELAY_MS,
        stepTimeoutMs: Number.isFinite(doc?.stepTimeoutMs) ? doc.stepTimeoutMs : STEP_TIMEOUT_MS,
        leadNextDelayMs: Number.isFinite(doc?.leadNextDelayMs) ? doc.leadNextDelayMs : LEAD_NEXT_DELAY_MS,
        texts,
    };
}

export async function ensureSettingsDoc() {
    const [doc] = await Setting.findOrCreate({
        where: { key: SETTING_KEY },
        defaults: { key: SETTING_KEY },
    });
    return doc;
}

export async function loadSettings() {
    const doc = await ensureSettingsDoc();
    cache = buildEffective(doc);
    initialBotToken = cache.botToken;
    return cache;
}

export function resetSettingsCache() {
    cache = null;
    initialBotToken = null;
}

export function getSettings() {
    if (!cache) {
        cache = buildEffective(null);
        initialBotToken = cache.botToken;
    }
    return cache;
}

export function isRestartRequired() {
    return Boolean(cache) && cache.botToken !== initialBotToken;
}

export function maskBotToken(token) {
    if (!token) return null;

    const [id, secret] = String(token).split(':');
    if (!secret) return '••••••••';

    return `${id}:••••••••${secret.slice(-4)}`;
}

export async function getSettingsSnapshot() {
    if (!cache) {
        await loadSettings();
    }

    const doc = await Setting.findOne({ where: { key: SETTING_KEY } });

    return {
        botTokenMasked: maskBotToken(cache.botToken),
        hasCustomBotToken: Boolean(doc?.botToken),
        managerId: cache.managerId,
        stepDelayMs: cache.stepDelayMs,
        stepTimeoutMs: cache.stepTimeoutMs,
        leadNextDelayMs: cache.leadNextDelayMs,
        texts: { ...cache.texts },
        passwordConfigured: Boolean(doc?.adminPasswordHash),
        restartRequired: isRestartRequired(),
    };
}

function parseTimer(field, value) {
    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_TIMER_MS) {
        throw new Error(`«${TIMER_FIELDS[field]}» должен быть целым числом от 0 до ${MAX_TIMER_MS} мс`);
    }

    return parsed;
}

export async function updateSettings(patch = {}) {
    const doc = await ensureSettingsDoc();
    const updates = {};
    const currentTexts = doc.texts || {};

    if (patch.botToken !== undefined) {
        const token = String(patch.botToken ?? '').trim();

        if (token === '') {
            updates.botToken = null;
        } else if (!/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(token)) {
            throw new Error('Некорректный формат токена бота (ожидается 123456789:AA...)');
        } else {
            updates.botToken = token;
        }
    }

    if (patch.managerId !== undefined) {
        const managerId = String(patch.managerId ?? '').trim();

        if (managerId === '') {
            updates.managerId = null;
        } else if (!/^\d{3,}$/.test(managerId)) {
            throw new Error('MANAGER_ID должен содержать только цифры');
        } else {
            updates.managerId = managerId;
        }
    }

    for (const field of Object.keys(TIMER_FIELDS)) {
        if (patch[field] !== undefined) {
            updates[field] = parseTimer(field, patch[field]);
        }
    }

    if (patch.texts !== undefined) {
        const incoming = patch.texts || {};
        const newTexts = { ...currentTexts };

        for (const key of Object.keys(DEFAULT_TEXTS)) {
            if (incoming[key] === undefined) continue;

            const value = String(incoming[key]);
            if (value.length > MAX_TEXT_LENGTH) {
                throw new Error(`Текст «${key}» длиннее ${MAX_TEXT_LENGTH} символов`);
            }

            newTexts[key] = value.trim() === '' ? null : value;
        }
        updates.texts = newTexts;
    }

    if (Object.keys(updates).length === 0) {
        throw new Error('Нет полей для обновления');
    }

    await doc.update(updates);
    cache = buildEffective(doc);

    return {
        settings: await getSettingsSnapshot(),
        restartRequired: isRestartRequired(),
    };
}

export async function verifyAdminPassword(password) {
    if (!password) return false;

    const doc = await Setting.findOne({ where: { key: SETTING_KEY } });

    if (doc?.adminPasswordHash && doc?.adminPasswordSalt) {
        const derived = crypto.scryptSync(String(password), doc.adminPasswordSalt, 64);
        const stored = Buffer.from(doc.adminPasswordHash, 'hex');

        return stored.length === derived.length && crypto.timingSafeEqual(stored, derived);
    }

    return String(password) === ADMIN_SECRET;
}

export async function changeAdminPassword(currentPassword, newPassword) {
    const currentIsValid = await verifyAdminPassword(currentPassword);

    if (!currentIsValid) {
        return { success: false, status: 401, error: 'Неверный текущий пароль' };
    }

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
        return { success: false, status: 400, error: 'Новый пароль должен быть не короче 6 символов' };
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(newPassword, salt, 64).toString('hex');

    const doc = await ensureSettingsDoc();
    await doc.update({ adminPasswordHash: hash, adminPasswordSalt: salt });

    return { success: true };
}
