import { DataTypes } from 'sequelize';
import { sequelize } from '../services/db.js';

export const Setting = sequelize.define('Setting', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    key: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        defaultValue: 'bot',
    },
    botToken: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    managerId: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    stepDelayMs: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    stepTimeoutMs: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    leadNextDelayMs: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    texts: {
        type: DataTypes.JSON,
        defaultValue: {},
    },
    adminPasswordHash: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    adminPasswordSalt: {
        type: DataTypes.STRING,
        allowNull: true,
    },
}, {
    timestamps: true,
});
