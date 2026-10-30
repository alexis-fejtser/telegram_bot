import { DataTypes } from 'sequelize';
import { sequelize } from '../services/db.js';

export const Scene = sequelize.define('Scene', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    sceneId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    description: {
        type: DataTypes.TEXT,
        defaultValue: '',
    },
    aliases: {
        type: DataTypes.JSON,
        defaultValue: [],
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
    order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    steps: {
        type: DataTypes.JSON,
        defaultValue: [],
    },
}, {
    timestamps: true,
});
