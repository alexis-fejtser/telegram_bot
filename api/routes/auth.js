import express from 'express';
import { createModuleLogger } from '../../src/config/logger.js';
import { verifyAdminPassword } from '../../src/services/settingsService.js';

const log = createModuleLogger('api:auth');
const router = express.Router();

router.post('/login', async (req, res) => {
    try {
        const { password } = req.body || {};
        const isValid = await verifyAdminPassword(password);

        if (isValid) {
            return res.json({ success: true, token: 'mock-jwt-admin-token' });
        }

        res.status(401).json({ error: 'Неверный пароль' });
    } catch (error) {
        log.error('Login error:', { message: error.message });
        res.status(500).json({ error: error.message });
    }
});

export default router;
