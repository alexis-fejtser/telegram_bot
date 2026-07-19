import { deleteUserState } from './userState.js';
import { resetFlowRuntimeForChat } from '../flow/createFlowScene.js';

export function resetUserSession(ctx) {
    if (!ctx.session) {
        ctx.session = {};
    }

    // Остановить таймеры, очереди и отложенные отправки сообщений
    if (ctx.chat?.id) {
        resetFlowRuntimeForChat(ctx.chat.id);
    }

    // Очистить состояние сцен Telegraf
    delete ctx.session.__scenes;

    // Очистить состояние flow-engine
    delete ctx.session.flows;

    // Очистить старые индексы WizardScene, если они ещё где-то остались
    delete ctx.session.firstSceneStepIndex;
    delete ctx.session.secondSceneStepIndex;
    delete ctx.session.thirtySceneStepIndex;

    // Очистить режимы лидов
    delete ctx.session.leadMode;
    delete ctx.session.returnScene;
    delete ctx.session.returnStepIndex;

    // Очистить общий userState
    if (ctx.from?.id) {
        deleteUserState(ctx.from.id);
    }
}