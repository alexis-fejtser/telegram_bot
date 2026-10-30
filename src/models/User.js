import { DataTypes } from 'sequelize';
import { sequelize } from '../services/db.js';

export const User = sequelize.define('User', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    telegramId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        unique: true,
    },
    username: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    firstName: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    lastName: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    phone: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    currentScene: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    currentStep: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    status: {
        type: DataTypes.ENUM('active', 'blocked'),
        defaultValue: 'active',
    },
    statusUpdatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
    initialPayload: {
        type: DataTypes.STRING(512),
        allowNull: true,
    },
    lastPayload: {
        type: DataTypes.STRING(512),
        allowNull: true,
    },
    languageCode: {
        type: DataTypes.STRING(10),
        allowNull: true,
    },
    firstInteractionAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
    lastInteractionAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
}, {
    timestamps: true,
});
