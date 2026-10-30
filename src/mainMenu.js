import { Markup } from 'telegraf';
import { Scene } from './models/Scene.js';
import { ensureSceneRegistered } from './flow/sceneRegistry.js';

export const SCENE_UNAVAILABLE_TEXT = 'Эта ветка больше недоступна. Показываю актуальное меню.';

function isStaleCallbackQueryError(error) {
    const description =
        error?.response?.description || error?.description || error?.message || '';

    return (
        description.includes('query is too old') ||
        description.includes('query ID is invalid')
    );
}

export async function getMainMenuKeyboard() {
    const scenes = await Scene.findAll({
        where: { isActive: true },
        order: [
            ['order', 'ASC'],
            ['createdAt', 'ASC'],
        ],
    });
    const buttons = scenes.map((scene, index) => {
        const buttonNumber = index + 1;
        return [
            Markup.button.callback(`✅ Кнопка ${buttonNumber}`, `scene:${scene.sceneId}`),
        ];
    });
    return Markup.inlineKeyboard(buttons);
}

export function getMainReplyKeyboard() {
    return Markup.keyboard([
        ['🏠 Главное меню'],
    ])
        .resize()
        .persistent();
}

export function registerSceneActions(botInstance) {
    botInstance.action(/^scene:(.+)$/, async (ctx) => {
        const sceneId = ctx.match[1];

        try {
            await ctx.answerCbQuery();
        } catch (error) {
            // Устаревший клик (replay старого update) — не запускаем сцену заново.
            if (isStaleCallbackQueryError(error)) {
                return;
            }
            // Остальные ошибки ответа не должны блокировать вход в сцену.
        }

        const isAvailable = await ensureSceneRegistered(sceneId);

        if (!isAvailable) {
            await ctx.reply(SCENE_UNAVAILABLE_TEXT);
            return showMainMenu(ctx);
        }

        return ctx.scene.enter(sceneId, {
            reset: true,
        });
    });
}

export async function showMainMenu(ctx) {
    await ctx.reply(
        `Здесь всё о том, как найти новые смыслы, реализоваться и быть счастливой не только в роли "хорошая жена" и "счастливая мама".`,
        getMainReplyKeyboard()
    );

    const scenes = await Scene.findAll({
        where: { isActive: true },
        order: [
            ['order', 'ASC'],
            ['createdAt', 'ASC'],
        ],
    });
    const descriptionsText = scenes.map((scene, index) => {
        return `${index + 1}. ${scene.description || scene.title}`;
    }).join('\n\n');

    const messageText = `🫶Выбери что интересно прямо сейчас и нажми соответствующую кнопку:
⠀
${descriptionsText}
⠀
👇👇👇`;

    const keyboard = await getMainMenuKeyboard();

    await ctx.reply(messageText, keyboard);
}
