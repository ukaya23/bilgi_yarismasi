/**
 * Upload Routes
 */

import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { authenticateToken, requireRole } from '../auth/authMiddleware';
import log from '../utils/logger';
import type { AuthenticatedRequest } from '../types';

const router = express.Router();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'question-' + uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Sadece resim dosyaları (JPEG, PNG, GIF, WEBP) yüklenebilir'));
        }
    }
});

router.post('/', authenticateToken as any, requireRole('admin') as any, upload.single('image'), (req: Request, res: Response) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'Dosya yüklenmedi' });
            return;
        }

        const imageUrl = '/uploads/' + req.file.filename;
        log.info({ imageUrl }, 'Resim yuklendi');

        res.json({ success: true, url: imageUrl, filename: req.file.filename });
    } catch (error) {
        log.error({ err: error }, 'Resim yukleme hatasi');
        res.status(500).json({ error: 'Resim yüklenemedi' });
    }
});

router.delete('/:filename', authenticateToken as any, requireRole('admin') as any, (req: any, res: Response) => {
    try {
        const { filename } = req.params;

        const sanitized = path.basename(filename);
        if (sanitized !== filename || filename.includes('..')) {
            res.status(400).json({ error: 'Geçersiz dosya adı' });
            return;
        }

        const uploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads');
        const filePath = path.join(uploadsDir, sanitized);

        if (!path.resolve(filePath).startsWith(path.resolve(uploadsDir))) {
            res.status(400).json({ error: 'Geçersiz dosya yolu' });
            return;
        }

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            log.info({ filename: sanitized }, 'Resim silindi');
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Dosya bulunamadı' });
        }
    } catch (error) {
        log.error({ err: error }, 'Resim silme hatasi');
        res.status(500).json({ error: 'Resim silinemedi' });
    }
});

export default router;
