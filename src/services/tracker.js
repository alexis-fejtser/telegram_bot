import { User } from '../models/User.js';
import { MessageHistory } from '../models/MessageHistory.js';
import { createModuleLogger } from '../config/logger.js';

const log = createModuleLogger('tracker');

export async function trackUser(ctx, extraData = {}) {
    if (!ctx.from) return;

    try {
        const { id, username, first_name, last_name, language_code } = ctx.from;
        const payload = extraData.payload || null;

        const updateData = {
            username: username || null,
            firstName: first_name || null,
            lastName: last_name || null,
            languageCode: language_code || null,
            status: 'active',
            statusUpdatedAt: new Date(),
            lastInteractionAt: new Date(),
            ...extraData,
        };

        // lastPayload обновляем только если payload передан явно,
        // иначе фоновый трекинг стирал бы последнюю deeplink-ссылку пользователя.
        if (Object.prototype.hasOwnProperty.call(extraData, 'payload')) {
            updateData.lastPayload = payload;
        }
        delete updateData.payload;

        const existingUser = await User.findOne({ where: { telegramId: id } });

        if (!existingUser) {
            try {
                await User.create({
                    telegramId: id,
                    ...updateData,
                    firstInteractionAt: new Date(),
                    initialPayload: payload || null,
                });
            } catch (createError) {
                await User.update(updateData, { where: { telegramId: id } });
            }
        } else {
            await existingUser.update(updateData);
        }
    } catch (error) {
        log.error('Track user error:', { message: error.message });
    }
}

export async function logActivity(telegramId, actionType, details = {}) {
    if (!telegramId) return;

    try {
        await MessageHistory.create({
            telegramId,
            actionType,
            details,
            timestamp: new Date(),
        });
    } catch (error) {
        log.error('Log activity error:', { message: error.message });
    }
}
