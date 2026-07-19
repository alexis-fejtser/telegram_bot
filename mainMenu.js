import { Markup } from 'telegraf';

const SCENE_BUTTONS = [
    {
        text: '✅ Кнопка 1',
        action: 'scene:first',
        scene: 'first_scene',
    },
    {
        text: '✅ Кнопка 2',
        action: 'scene:second',
        scene: 'second_scene',
    },
    {
        text: '✅ Кнопка 3',
        action: 'scene:thirty',
        scene: 'thirty_scene',
    },
];

export function getMainMenuKeyboard() {
    return Markup.inlineKeyboard(
        SCENE_BUTTONS.map((button) => [
            Markup.button.callback(button.text, button.action),
        ])
    );
}

export function getMainReplyKeyboard() {
    return Markup.keyboard([
        ['🏠 Главное меню'],
    ])
        .resize()
        .persistent();
}

/**
 * Показывает постоянную нижнюю кнопку.
 *
 * Telegram не позволяет прикрепить ReplyKeyboard и InlineKeyboard
 * к одному сообщению, поэтому клавиатура отправляется отдельным сообщением.
 */
export async function showMainReplyKeyboard(ctx) {
    return ctx.reply(
        'Навигация 👇',
        getMainReplyKeyboard()
    );
}

export function registerSceneActions(botInstance) {
    for (const button of SCENE_BUTTONS) {
        botInstance.action(button.action, async (ctx) => {
            await ctx.answerCbQuery();

            // Показываем нижнюю кнопку перед входом в ветку
            await showMainReplyKeyboard(ctx);

            await ctx.scene.enter(button.scene, {
                reset: true,
                startIndex: 0,
            });
        });
    }
}

export async function showMainMenu(ctx) {
    await showMainReplyKeyboard(ctx);

    await ctx.reply(
        `Здесь всё о том, как найти новые смыслы, реализоваться и быть счастливой не только в роли "хорошая жена" и "счастливая мама".`
    );

    await ctx.reply(
        `🫶Выбери что интересно прямо сейчас и нажми соответствующую кнопку:
⠀
1. Как перестать крутиться как белка в колесе, выкинуть из своей жизни тревогу, эмоциональные качели и чувство вины.
⠀
2. Как изменить жизнь, найти новые смыслы и реализоваться, даже если тебе 4⃣0⃣➕ и сейчас есть ощущение "потолка" в жизни, который невозможно пробить.
⠀
3. Как собрать себя заново, даже если предыдущая жизнь развалилась как карточный домик.
⠀
👇👇👇`,
        getMainMenuKeyboard()
    );
}