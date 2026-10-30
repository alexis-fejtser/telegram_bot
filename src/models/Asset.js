import { DataTypes } from 'sequelize';
import { sequelize } from '../services/db.js';

export const Asset = sequelize.define('Asset', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    assetKey: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    filePath: {
        type: DataTypes.STRING(1024),
        allowNull: false,
    },
    mediaType: {
        type: DataTypes.ENUM('photo', 'video', 'videoNote', 'text'),
        allowNull: false,
    },
}, {
    timestamps: true,
});
