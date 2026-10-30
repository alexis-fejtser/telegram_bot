import express from 'express';
import { createModuleLogger } from '../../src/config/logger.js';
import {
    changeAdminPassword,
    getSettingsSnapshot,
    updateSettings,
} from '../../src/services/settingsService.js';

const log = createModuleLogger('api:settings');
const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const settings = await getSettingsSnapshot();
        res.json(settings);
    } catch (error) {
        log.error('Get settings error:', { message: error.message });
        res.status(500).json({ error: error.message });
    }
});

router.put('/', async (req, res) => {
    try {
        const result = await updateSettings(req.body || {});
        log.info('⚙️ Settings updated');
        res.json({ success: true, ...result });
    } catch (error) {
        log.error('Update settings error:', { message: error.message });
        res.status(400).json({ error: error.message });
    }
});

router.put('/password', async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body || {};
        const result = await changeAdminPassword(currentPassword, newPassword);

        if (!result.success) {
            return res.status(result.status || 400).json({ error: result.error });
        }

        log.info('🔐 Admin password updated');
        res.json({ success: true });
    } catch (error) {
        log.error('Change password error:', { message: error.message });
        res.status(400).json({ error: error.message });
    }
});

export default router;
