import { Scene } from '../models/Scene.js';
import { createModuleLogger } from '../config/logger.js';

const log = createModuleLogger('sceneRegistry');

let stage = null;

/**
 * Запоминает Stage, созданный в bootstrap().
 * Нужен, чтобы дорегистрировать сцены, появившиеся в БД после запуска бота.
 */
export function attachSceneStage(stageInstance) {
    stage = stageInstance;
}

/**
 * Гарантирует, что активная сцена из БД зарегистрирована в Stage.
 * Вызывается в момент обращения (кнопка меню, deep-link), поэтому новые
 * ветки, созданные в админке после запуска бота, работают без перезапуска.
 *
 * @returns {Promise<boolean>} false, если сцены нет в БД или она выключена
 */
export async function ensureSceneRegistered(sceneId) {
    if (!stage) {
        log.warn('Stage не привязан: вызовите attachSceneStage() в bootstrap');
        return false;
    }

    const sceneDoc = await Scene.findOne({ where: { sceneId, isActive: true } });

    if (!sceneDoc) {
        return false;
    }

    if (!stage.scenes.has(sceneId)) {
        // Ленивый импорт: createDynamicScene импортирует mainMenu, который
        // использует этот модуль — статический импорт создал бы цикл зависимостей.
        const { createDynamicScene } = await import('./createDynamicScene.js');

        stage.register(createDynamicScene(sceneId));
        log.info(`Динамически зарегистрирована сцена: ${sceneId}`);
    }

    return true;
}
