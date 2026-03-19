"use strict";
/**
 * Game Routes - Game data queries and legacy competition management
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const postgres_1 = __importDefault(require("../../database/postgres"));
const authMiddleware_1 = require("../auth/authMiddleware");
const competitionManager_1 = __importDefault(require("../state/competitionManager"));
const logger_1 = __importDefault(require("../utils/logger"));
const router = express_1.default.Router();
// ==================== GAME DATA API ====================
router.get('/questions', async (req, res) => {
    res.json(await postgres_1.default.getAllQuestions());
});
router.get('/contestants', async (req, res) => {
    const competitionId = req.query.competitionId ? parseInt(req.query.competitionId) : null;
    res.json(await postgres_1.default.getAllContestants(competitionId));
});
router.get('/leaderboard', async (req, res) => {
    const competitionId = req.query.competitionId ? parseInt(req.query.competitionId) : null;
    res.json(await postgres_1.default.getLeaderboard(competitionId));
});
router.get('/state', async (req, res) => {
    const activeComp = await postgres_1.default.getActiveCompetition();
    const compId = activeComp ? activeComp.id : 1;
    res.json(competitionManager_1.default.getGameState(compId).getState());
});
// ==================== LEGACY COMPETITION API ====================
router.post('/competition', authMiddleware_1.authenticateToken, (0, authMiddleware_1.requireRole)('admin'), async (req, res) => {
    try {
        const { name, contestantCount, juryCount } = req.body;
        if (!name || !contestantCount || !juryCount) {
            res.status(400).json({ error: 'Tüm alanlar gerekli' });
            return;
        }
        const activeCompetition = await postgres_1.default.getActiveCompetition();
        if (activeCompetition) {
            logger_1.default.debug({ competitionId: activeCompetition.id }, 'Mevcut aktif yarisma kapatiliyor');
            await postgres_1.default.updateCompetitionStatus(activeCompetition.id, 'COMPLETED');
        }
        const competitionId = await postgres_1.default.createCompetition(name, contestantCount, juryCount);
        logger_1.default.debug({ competitionId }, 'Yeni yarisma olusturuldu');
        const codes = await postgres_1.default.generateAccessCodes(competitionId, contestantCount, juryCount);
        logger_1.default.debug({ count: codes.length }, 'Erisim kodlari olusturuldu');
        res.json({ success: true, competitionId, codes });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Yarisma olusturma hatasi');
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});
router.post('/competition/end', authMiddleware_1.authenticateToken, (0, authMiddleware_1.requireRole)('admin'), async (req, res) => {
    try {
        const activeCompetition = await postgres_1.default.getActiveCompetition();
        if (activeCompetition) {
            await postgres_1.default.updateCompetitionStatus(activeCompetition.id, 'COMPLETED');
            await postgres_1.default.resetAllAccessCodes(activeCompetition.id);
            const gs = competitionManager_1.default.getGameState(activeCompetition.id);
            await gs.resetGame();
            competitionManager_1.default.removeGameState(activeCompetition.id);
            logger_1.default.info({ competitionId: activeCompetition.id }, 'Yarisma sonlandirildi');
        }
        res.json({ success: true });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Yarisma sonlandirma hatasi');
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});
router.get('/competition/active', async (req, res) => {
    try {
        const competition = await postgres_1.default.getActiveCompetition();
        logger_1.default.debug({ competition }, 'Aktif yarisma');
        if (!competition) {
            res.json({ active: false });
            return;
        }
        const codes = await postgres_1.default.getAccessCodesByCompetition(competition.id);
        logger_1.default.debug({ count: codes.length, competitionId: competition.id }, 'Yarisma kodlari');
        res.json({ active: true, competition, codes });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Yarisma getirme hatasi');
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});
router.put('/competition/code/:id', authMiddleware_1.authenticateToken, (0, authMiddleware_1.requireRole)('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        if (!name) {
            res.status(400).json({ error: 'İsim gerekli' });
            return;
        }
        await postgres_1.default.updateAccessCodeName(parseInt(id), name);
        res.json({ success: true });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Kod guncelleme hatasi');
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});
router.post('/competition/code/:id/reset', authMiddleware_1.authenticateToken, (0, authMiddleware_1.requireRole)('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        await postgres_1.default.resetAccessCode(parseInt(id));
        res.json({ success: true });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Kod sifirlama hatasi');
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});
exports.default = router;
//# sourceMappingURL=gameRoutes.js.map