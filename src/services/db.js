import { Sequelize } from 'sequelize';
import { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } from '../config/config.js';
import { createModuleLogger } from '../config/logger.js';

const log = createModuleLogger('db');

export const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
    host: DB_HOST,
    port: DB_PORT,
    dialect: 'mysql',
    logging: false, // set to console.log or log.debug if needed
});

export async function connectDB() {
    try {
        await sequelize.authenticate();
        log.info('✅ Успешное подключение к MySQL 8');
        await sequelize.sync();
        log.info('✅ Модели синхронизированы с базой данных MySQL');
    } catch (error) {
        log.error('❌ Ошибка подключения к MySQL:', {
            message: error.message,
            stack: error.stack,
        });
        process.exit(1);
    }
}
