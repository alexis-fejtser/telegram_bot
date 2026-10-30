import { DataTypes } from 'sequelize';
import { sequelize } from '../services/db.js';

export const MessageHistory = sequelize.define('MessageHistory', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    telegramId: {
        type: DataTypes.BIGINT,
        allowNull: false,
    },
    actionType: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    details: {
        type: DataTypes.JSON,
        defaultValue: {},
    },
    timestamp: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
}, {
    timestamps: false,
});
