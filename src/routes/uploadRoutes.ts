/**
 * Upload Routes - Media file upload, gallery, and deletion
 */

import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { authenticateToken, requireRole } from '../auth/authMiddleware';
import db from '../../database/postgres';
import log from '../utils/logger';

const router = express.Router();

const ALLOWED_TYPES: Record<string, string> = {
    'image/jpeg': 'image',
    'image/png': 'image',
    'image/gif': 'image',
    'image/webp': 'image',
    'audio/mpeg': 'audio',
    'audio/mp3': 'audio',
    'audio/wav': 'audio',
    'audio/ogg': 'audio',
    'video/mp4': 'video',
    'video/webm': 'video',
};

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        const uploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        cb(null, uploadsDir);
    },
    filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'media-' + uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_TYPES[file.mimetype]) {
            cb(null, true);
        } else {
            cb(new Error('Desteklenmeyen dosya formatı. Desteklenen: JPEG, PNG, GIF, WEBP, MP3, WAV, OGG, MP4, WEBM'));
        }
    }
});

// Upload file
router.post('/', authenticateToken as any, requireRole('admin') as any, upload.single('image'), async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'Dosya yüklenmedi' });
            return;
        }

        const fileUrl = '/uploads/' + req.file.filename;
        const mediaType = ALLOWED_TYPES[req.file.mimetype] || 'image';

        // Register in media library
        try {
            await db.addMedia({
                filename: req.file.filename,
                original_name: req.file.originalname,
                mime_type: req.file.mimetype,
                media_type: mediaType as 'image' | 'audio' | 'video',
                file_size: req.file.size,
                url: fileUrl,
                uploaded_by: null
            });
        } catch (err) {
            // Media table may not exist yet (migration pending) - still allow upload
            log.warn({ err }, 'Could not register media in library');
        }

        log.info({ url: fileUrl, mediaType }, 'Medya yuklendi');
        res.json({ success: true, url: fileUrl, filename: req.file.filename, mediaType });
    } catch (error) {
        log.error({ err: error }, 'Medya yukleme hatasi');
        res.status(500).json({ error: 'Dosya yüklenemedi' });
    }
});

// Gallery - list all media
router.get('/gallery', authenticateToken as any, requireRole('admin') as any, async (req: any, res: Response) => {
    try {
        const mediaType = req.query.type as string | undefined;
        const items = await db.getAllMedia(mediaType);
        res.json({ success: true, items });
    } catch (error) {
        log.error({ err: error }, 'Galeri listeleme hatasi');
        res.status(500).json({ error: 'Galeri yüklenemedi' });
    }
});

// Delete file
router.delete('/:filename', authenticateToken as any, requireRole('admin') as any, async (req: any, res: Response) => {
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

        // Check usage
        const usageCount = await db.getMediaUsageCount(sanitized);
        if (usageCount > 0) {
            res.status(409).json({ error: `Bu dosya ${usageCount} soruda kullanılıyor. Önce soruları güncelleyin.` });
            return;
        }

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Remove from media library
        try {
            await db.deleteMedia(sanitized);
        } catch {
            // Ignore if media table doesn't exist
        }

        log.info({ filename: sanitized }, 'Medya silindi');
        res.json({ success: true });
    } catch (error) {
        log.error({ err: error }, 'Medya silme hatasi');
        res.status(500).json({ error: 'Dosya silinemedi' });
    }
});

export default router;
