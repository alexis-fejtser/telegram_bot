import { Op } from 'sequelize';
import { sequelize } from '../src/services/db.js';
import { Scene } from '../src/models/Scene.js';
import { createModuleLogger } from '../src/config/logger.js';

const log = createModuleLogger('migrateSceneOrder');

/**
 * Присваивает поле order сценам, у которых оно отсутствует.
 * Порядок определяется по createdAt (старые сцены — первыми),
 * новые значения продолжают уже существующую нумерацию.
 *
 * Запуск: node scripts/migrateSceneOrder.js
 */
async function migrate() {
    try {
        await sequelize.authenticate();
        log.info('connected to mysql for migration');

        const scenes = await Scene.findAll({
            where: {
                [Op.or]: [{ order: null }],
            },
            order: [['createdAt', 'ASC']],
        });

        if (scenes.length === 0) {
            log.info('✅ Миграция не требуется: у всех сцен уже задан order');
            process.exit(0);
        }

        const maxDoc = await Scene.findOne({
            where: { order: { [Op.ne]: null } },
            order: [['order', 'DESC']],
        });
        
        let nextOrder = maxDoc && Number.isFinite(maxDoc.order) ? maxDoc.order + 1 : 0;

        for (const scene of scenes) {
            scene.order = nextOrder;
            await scene.save();
            log.info(`✅ ${scene.sceneId} -> order ${nextOrder}`);
            nextOrder += 1;
        }

        log.info(`✅ Миграция завершена. Обновлено сцен: ${scenes.length}`);
        process.exit(0);
    } catch (error) {
        log.error('Migration error:', error);
        process.exit(1);
    }
}

migrate();
