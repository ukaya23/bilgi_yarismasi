/**
 * Upload Routes
 * Handles image upload and deletion
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { authenticateToken, requireRole } = require('../auth/authMiddleware');
const log = require('../utils/logger');

// Multer konfigürasyonu
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
    limits: { fileSize: 10 * 1024 * 1024 }, // Max 10MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Sadece resim dosyaları (JPEG, PNG, GIF, WEBP) yüklenebilir'), false);
        }
    }
});

/**
 * POST /api/upload
 * Upload an image
 */
router.post('/', authenticateToken, requireRole('admin'), upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Dosya yüklenmedi' });
        }

        const imageUrl = '/uploads/' + req.file.filename;
        log.info({ imageUrl }, 'Resim yuklendi');

        res.json({
            success: true,
            url: imageUrl,
            filename: req.file.filename
        });
    } catch (error) {
        log.error({ err: error }, 'Resim yukleme hatasi');
        res.status(500).json({ error: 'Resim yüklenemedi' });
    }
});

/**
 * DELETE /api/upload/:filename
 * Delete an uploaded image
 */
router.delete('/:filename', authenticateToken, requireRole('admin'), (req, res) => {
    try {
        const { filename } = req.params;

        // Path traversal koruması
        const sanitized = path.basename(filename);
        if (sanitized !== filename || filename.includes('..')) {
            return res.status(400).json({ error: 'Geçersiz dosya adı' });
        }

        const uploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads');
        const filePath = path.join(uploadsDir, sanitized);

        // Çözümlenmiş yolun uploads dizini içinde olduğunu doğrula
        if (!path.resolve(filePath).startsWith(path.resolve(uploadsDir))) {
            return res.status(400).json({ error: 'Geçersiz dosya yolu' });
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

module.exports = router;
