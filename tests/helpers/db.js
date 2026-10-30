import { sequelize } from '../../src/services/db.js';
import { DB_NAME } from '../../src/config/config.js';
import { User } from '../../src/models/User.js';
import { Scene } from '../../src/models/Scene.js';
import { Asset } from '../../src/models/Asset.js';
import { Question } from '../../src/models/Question.js';
import { Setting } from '../../src/models/Setting.js';
import { MessageHistory } from '../../src/models/MessageHistory.js';

const TEST_DB_PATTERN = /_test$/;

export async function connectTestDb() {
    if (!TEST_DB_PATTERN.test(DB_NAME)) {
        throw new Error(
            `Тесты нельзя запускать на БД "${DB_NAME}": имя базы должно заканчиваться на _test. ` +
            'Проверьте tests/.env.test и флаг --env-file.'
        );
    }

    try {
        await sequelize.authenticate();
        await sequelize.sync();
    } catch (e) {
        throw e;
    }
}

export async function clearDatabase() {
    // Disable foreign key checks temporarily if needed, or delete in correct order
    await MessageHistory.destroy({ where: {}, truncate: false, force: true });
    await Question.destroy({ where: {}, truncate: false, force: true });
    await Asset.destroy({ where: {}, truncate: false, force: true });
    await Scene.destroy({ where: {}, truncate: false, force: true });
    await User.destroy({ where: {}, truncate: false, force: true });
    await Setting.destroy({ where: {}, truncate: false, force: true });
}

export async function disconnectTestDb() {
    await sequelize.close();
}
