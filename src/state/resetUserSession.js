import { deleteUserState } from './userState.js';
import { resetFlowRuntimeForChat } from '../flow/createDynamicScene.js';

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

    // Очистить режимы лидов
    delete ctx.session.leadMode;
    delete ctx.session.returnScene;
    delete ctx.session.returnStepIndex;
    delete ctx.session.pendingDeepLink;

    // Очистить общий userState
    if (ctx.from?.id) {
        deleteUserState(ctx.from.id);
    }
}
