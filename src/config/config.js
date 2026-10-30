import 'dotenv/config';

export const BOT_TOKEN = process.env.BOT_TOKEN;
export const MANAGER_ID = process.env.MANAGER_ID;
export const DB_HOST = process.env.DB_HOST || 'localhost';
export const DB_PORT = process.env.DB_PORT || 3306;
export const DB_NAME = process.env.DB_NAME || 'telegram_bot';
export const DB_USER = process.env.DB_USER || 'root';
export const DB_PASSWORD = process.env.DB_PASSWORD || '';
export const PORT = process.env.PORT || 3000;
export const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin123';

export const CONSULTATION_PHONE_TEXT = '📞 <a href="tel:+375291031310">+375 (29) 103-13-10</a>';

export const STEP_TIMEOUT_MS = 86_400_000;

// Первое сообщение шага отправляется сразу.
// Все следующие сообщения внутри этого же шага — через эту задержку.
export const STEP_DELAY_MS = 5_000;

export const LEAD_NEXT_DELAY_MS = 5_000;

export const BOT_SETTINGS = {
    replyKeyboard: {
        enabled: true,
        keyboard: [
            ['🏠 Главное меню']
        ],
        resize_keyboard: true,
        is_persistent: true,
    }
};
