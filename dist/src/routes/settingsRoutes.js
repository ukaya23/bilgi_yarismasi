"use strict";
/**
 * Settings Routes
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const postgres_1 = __importDefault(require("../../database/postgres"));
const authMiddleware_1 = require("../auth/authMiddleware");
const logger_1 = __importDefault(require("../utils/logger"));
const router = express_1.default.Router();
router.get('/', async (req, res) => {
    try {
        const settings = await postgres_1.default.getAllSettings();
        res.json(settings);
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Ayarlar getirme hatasi');
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});
router.put('/:key', authMiddleware_1.authenticateToken, (0, authMiddleware_1.requireRole)('admin'), async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;
        await postgres_1.default.setSetting(key, value.toString());
        res.json({ success: true });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Ayar guncelleme hatasi');
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});
exports.default = router;
//# sourceMappingURL=settingsRoutes.js.map