import { DataTypes } from 'sequelize';
import { sequelize } from '../services/db.js';

export const Question = sequelize.define('Question', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    telegramId: {
        type: DataTypes.BIGINT,
        allowNull: false,
    },
    questionText: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    answerText: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    status: {
        type: DataTypes.ENUM('pending', 'answered'),
        defaultValue: 'pending',
    },
    answeredAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
}, {
    timestamps: true,
});
