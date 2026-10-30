import { getSettings } from './services/settingsService.js';

import {
    clearUserMode,
    getUserState,
    setUserState,
} from './state/userState.js';

import { Question } from './models/Question.js';
import { trackUser, logActivity } from './services/tracker.js';

export async function startQuestionFlow(ctx, sceneId, stepIndex) {
    try {
        await ctx.answerCbQuery();
    } catch (error) {}

    await trackUser(ctx);
    await logActivity(ctx.from.id, 'question_flow_started', { sceneId, stepIndex });

    setUserState(ctx.from.id, {
        mode: 'question',
        returnScene: sceneId,
        returnStepIndex: stepIndex,
    });

    await ctx.reply(getSettings().texts.questionPrompt);

    return true;
}

export async function handleQuestionMessage(ctx) {
    const state = getUserState(ctx.from.id);

    if (state.mode !== 'question') {
        return {
            handled: false,
        };
    }

    const questionText = ctx.message?.text;

    if (!questionText) {
        await ctx.reply(getSettings().texts.questionNotText);

        return {
            handled: true,
            shouldGoNext: false,
        };
    }

    const user = ctx.from;
    await trackUser(ctx);
    await logActivity(user.id, 'question_submitted', { questionText });

    // Save to Question model for React Admin Panel
    try {
        await Question.create({
            telegramId: user.id,
            questionText,
            status: 'pending',
        });
    } catch (dbError) {
        console.error('Failed to save question to DB:', dbError);
    }

    const fullName = [user.first_name, user.last_name]
        .filter(Boolean)
        .join(' ');

    const username = user.username ? `@${user.username}` : 'не указан';
    const managerText = buildManagerNotification({
        name: fullName || 'не указано',
        username,
        telegramId: user.id,
        question: questionText,
    });

    const settings = getSettings();

    try {
        if (!settings.managerId) {
            throw new Error('MANAGER_ID is not defined');
        }

        await ctx.telegram.sendMessage(
            settings.managerId,
            managerText,
            {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
            }
        );

        await ctx.reply(settings.texts.questionThanks);
    } catch (error) {
        console.error('Ошибка отправки вопроса менеджеру:', error);

        await ctx.reply(settings.texts.questionError);
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
    try {
        await ctx.answerCbQuery();
    } catch (error) {}

    await trackUser(ctx);
    await logActivity(ctx.from.id, 'consultation_requested', {});

    await ctx.reply(
        getSettings().texts.consultation,
        {
            parse_mode: 'HTML',
        }
    );

    return true;
}

function buildManagerNotification({ name, username, telegramId, question }) {
    const template = getSettings().texts.managerNotification;

    return template
        .replaceAll('{name}', escapeHtml(name))
        .replaceAll('{username}', escapeHtml(username))
        .replaceAll('{telegramId}', String(telegramId))
        .replaceAll('{question}', escapeHtml(question));
}

function escapeHtml(text = '') {
    return String(text)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}
