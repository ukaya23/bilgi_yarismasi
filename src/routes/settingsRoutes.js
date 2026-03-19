/**
 * Settings Routes
 * Handles application settings CRUD
 */

const express = require('express');
const router = express.Router();
const db = require('../../database/postgres');
const { authenticateToken, requireRole } = require('../auth/authMiddleware');
const log = require('../utils/logger');

/**
 * GET /api/settings
 * Get all settings
 */
router.get('/', async (req, res) => {
    try {
        const settings = await db.getAllSettings();
        res.json(settings);
    } catch (error) {
        log.error({ err: error }, 'Ayarlar getirme hatasi');
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

/**
 * PUT /api/settings/:key
 * Update a setting
 */
router.put('/:key', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;

        await db.setSetting(key, value.toString());
        res.json({ success: true });
    } catch (error) {
        log.error({ err: error }, 'Ayar guncelleme hatasi');
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

module.exports = router;
