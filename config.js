import 'dotenv/config';

export const BOT_TOKEN = process.env.BOT_TOKEN;
export const MANAGER_ID = process.env.MANAGER_ID;

export const CONSULTATION_PHONE_TEXT = '📞 <a href="tel:+375291031310">+375 (29) 103-13-10</a>';

export const HEAVY_VIDEO_PATH = './scenes/croppedRoundVideo.mp4';
export const COMPRESSED_VIDEO_PATH = './ready_circle.mp4';

export const SHOULD_COMPRESS_VIDEO_ON_START = false;

export const STEP_TIMEOUT_MS = 86_400_000;

// Первое сообщение шага отправляется сразу.
// Все следующие сообщения внутри этого же шага — через эту задержку.
export const STEP_DELAY_MS = 5_000;

export const LEAD_NEXT_DELAY_MS  = 5_000;