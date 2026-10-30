/**
 * Базовый префикс пути (например, '/tgbot' при размещении на https://domain/tgbot/)
 */
export const BASE_PREFIX = (import.meta.env.BASE_URL || '/tgbot/').replace(/\/$/, '');

/**
 * Нормализует относительный путь, добавляя BASE_PREFIX при необходимости.
 */
export function resolveUrl(path) {
    if (!path || typeof path !== 'string') return path;
    if (
        path.startsWith('http://') ||
        path.startsWith('https://') ||
        path.startsWith('blob:') ||
        path.startsWith('data:')
    ) {
        return path;
    }
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    if (BASE_PREFIX && !cleanPath.startsWith(BASE_PREFIX)) {
        return `${BASE_PREFIX}${cleanPath}`;
    }
    return cleanPath;
}

/**
 * Обёртка над fetch для работы с JSON API.
 * Отличает «ответ не JSON» (например, старый процесс API, раздающий index.html
 * или 404-страницу Express) от нормального JSON-ответа и даёт понятную ошибку.
 */
export async function apiFetch(path, options = {}) {
    const finalUrl = resolveUrl(path);
    const { body, method = 'GET', headers, ...rest } = options;
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

    const response = await fetch(finalUrl, {
        method,
        ...rest,
        ...(body !== undefined
            ? isFormData
                ? { body }
                : {
                    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
                    body: JSON.stringify(body),
                }
            : headers
                ? { headers }
                : {}),
    });

    const contentType = response.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
        if (response.status === 404) {
            throw new Error(
                'маршрут не найден. Похоже, API запущен старой версией — перезапустите бота (npm start).'
            );
        }

        throw new Error(`сервер вернул ответ, не являющийся JSON (HTTP ${response.status}).`);
    }

    const data = await response.json();

    return { ok: response.ok, status: response.status, data };
}
