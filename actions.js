import {
    MANAGER_ID,
    CONSULTATION_PHONE_TEXT,
} from './config.js';

import {
    clearUserMode,
    getUserState,
    setUserState,
} from './state/userState.js';

export async function startQuestionFlow(ctx, sceneId, stepIndex) {
    await ctx.answerCbQuery();

    setUserState(ctx.from.id, {
        mode: 'question',
        returnScene: sceneId,
        returnStepIndex: stepIndex,
    });

    await ctx.reply('Напишите ваш вопрос одним сообщением:');

    return true;
}

export async function handleQuestionMessage(ctx) {
    const state = getUserState(ctx.from.id);

    if (state.mode !== 'question') {
        return {
            handled: false,
        };
    }

    const question = ctx.message?.text;

    if (!question) {
        await ctx.reply('Пожалуйста, отправьте вопрос текстом.');

        return {
            handled: true,
            shouldGoNext: false,
        };
    }

    const user = ctx.from;

    const fullName = [user.first_name, user.last_name]
        .filter(Boolean)
        .join(' ');

    const username = user.username ? `@${user.username}` : 'не указан';

    const managerText = [
        '📩 <b>Новый вопрос из Telegram-бота</b>',
        '',
        `👤 <b>Имя:</b> ${escapeHtml(fullName || 'не указано')}`,
        `🔗 <b>Username:</b> ${escapeHtml(username)}`,
        `🆔 <b>Telegram ID:</b> ${user.id}`,
        `👁 <b>Профиль:</b> <a href="tg://user?id=${user.id}">открыть</a>`,
        '',
        '<b>❓ Вопрос:</b>',
        escapeHtml(question),
    ].join('\n');

    try {
        if (!MANAGER_ID) {
            throw new Error('MANAGER_ID is not defined in .env');
        }

        await ctx.telegram.sendMessage(
            MANAGER_ID,
            managerText,
            {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
            }
        );

        await ctx.reply('Спасибо, ваш вопрос отправлен. Менеджер свяжется с вами.');
    } catch (error) {
        console.error('Ошибка отправки вопроса менеджеру:', error);

        await ctx.reply(
            'Не удалось отправить вопрос менеджеру. Попробуйте позже.'
        );
    }

    clearUserMode(ctx.from.id);

    return {
        handled: true,
        shouldGoNext: true,
        returnScene: state.returnScene,
        returnStepIndex: state.returnStepIndex,
    };
}

export async function sendConsultationPhone(ctx) {
    await ctx.answerCbQuery();

    await ctx.reply(
        CONSULTATION_PHONE_TEXT,
        {
            parse_mode: 'HTML',
        }
    );

    return true;
}

function escapeHtml(text = '') {
    return String(text)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}