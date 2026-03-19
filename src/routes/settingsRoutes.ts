/**
 * Settings Routes
 */

import express, { Request, Response } from 'express';
import db from '../../database/postgres';
import { authenticateToken, requireRole } from '../auth/authMiddleware';
import log from '../utils/logger';
import type { AuthenticatedRequest } from '../types';

const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
    try {
        const settings = await db.getAllSettings();
        res.json(settings);
    } catch (error) {
        log.error({ err: error }, 'Ayarlar getirme hatasi');
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.put('/:key', authenticateToken as any, requireRole('admin') as any, async (req: any, res: Response) => {
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

export default router;
