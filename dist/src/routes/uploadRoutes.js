"use strict";
/**
 * Upload Routes
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const multer_1 = __importDefault(require("multer"));
const authMiddleware_1 = require("../auth/authMiddleware");
const logger_1 = __importDefault(require("../utils/logger"));
const router = express_1.default.Router();
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        const uploadsDir = path_1.default.join(__dirname, '..', '..', 'public', 'uploads');
        if (!fs_1.default.existsSync(uploadsDir)) {
            fs_1.default.mkdirSync(uploadsDir, { recursive: true });
        }
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path_1.default.extname(file.originalname);
        cb(null, 'question-' + uniqueSuffix + ext);
    }
});
const upload = (0, multer_1.default)({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Sadece resim dosyaları (JPEG, PNG, GIF, WEBP) yüklenebilir'));
        }
    }
});
router.post('/', authMiddleware_1.authenticateToken, (0, authMiddleware_1.requireRole)('admin'), upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'Dosya yüklenmedi' });
            return;
        }
        const imageUrl = '/uploads/' + req.file.filename;
        logger_1.default.info({ imageUrl }, 'Resim yuklendi');
        res.json({ success: true, url: imageUrl, filename: req.file.filename });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Resim yukleme hatasi');
        res.status(500).json({ error: 'Resim yüklenemedi' });
    }
});
router.delete('/:filename', authMiddleware_1.authenticateToken, (0, authMiddleware_1.requireRole)('admin'), (req, res) => {
    try {
        const { filename } = req.params;
        const sanitized = path_1.default.basename(filename);
        if (sanitized !== filename || filename.includes('..')) {
            res.status(400).json({ error: 'Geçersiz dosya adı' });
            return;
        }
        const uploadsDir = path_1.default.join(__dirname, '..', '..', 'public', 'uploads');
        const filePath = path_1.default.join(uploadsDir, sanitized);
        if (!path_1.default.resolve(filePath).startsWith(path_1.default.resolve(uploadsDir))) {
            res.status(400).json({ error: 'Geçersiz dosya yolu' });
            return;
        }
        if (fs_1.default.existsSync(filePath)) {
            fs_1.default.unlinkSync(filePath);
            logger_1.default.info({ filename: sanitized }, 'Resim silindi');
            res.json({ success: true });
        }
        else {
            res.status(404).json({ error: 'Dosya bulunamadı' });
        }
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Resim silme hatasi');
        res.status(500).json({ error: 'Resim silinemedi' });
    }
});
exports.default = router;
//# sourceMappingURL=uploadRoutes.js.map