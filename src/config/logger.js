import winston from 'winston';
import 'winston-daily-rotate-file';

const transport = new winston.transports.DailyRotateFile({
    filename: './logs/app-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
});

const errorTransport = new winston.transports.DailyRotateFile({
    filename: './logs/error-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '30d',
});

export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        transport,
        errorTransport,
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            ),
        }),
    ],
});

export function createModuleLogger(moduleName) {
    return {
        info: (msg, meta = {}) => logger.info(`[${moduleName}] ${msg}`, meta),
        warn: (msg, meta = {}) => logger.warn(`[${moduleName}] ${msg}`, meta),
        error: (msg, meta = {}) => logger.error(`[${moduleName}] ${msg}`, meta),
        debug: (msg, meta = {}) => logger.debug(`[${moduleName}] ${msg}`, meta),
    };
}
