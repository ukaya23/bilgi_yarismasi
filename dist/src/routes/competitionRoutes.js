"use strict";
/**
 * Competition Management Routes
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
router.get('/', async (req, res) => {
    try {
        const competitions = await competitionManager_1.default.getActiveCompetitions();
        res.json({ success: true, competitions });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Yarismalari getirme hatasi');
        res.status(500).json({ success: false, error: 'Failed to fetch competitions' });
    }
});
router.get('/:id', async (req, res) => {
    try {
        const competitionId = parseInt(req.params.id);
        const competition = await postgres_1.default.getCompetitionById(competitionId);
        if (!competition) {
            res.status(404).json({ success: false, error: 'Competition not found' });
            return;
        }
        const gameState = competitionManager_1.default.getGameState(competitionId);
        res.json({ success: true, competition: { ...competition, gameState: gameState.getState() } });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Yarisma getirme hatasi');
        res.status(500).json({ success: false, error: 'Failed to fetch competition' });
    }
});
router.post('/', authMiddleware_1.authenticateToken, (0, authMiddleware_1.requireRole)('admin'), async (req, res) => {
    try {
        const { name, contestantCount, juryCount } = req.body;
        if (!name) {
            res.status(400).json({ success: false, error: 'Competition name is required' });
            return;
        }
        const competitionId = await postgres_1.default.createCompetition(name, contestantCount || 8, juryCount || 2);
        competitionManager_1.default.getGameState(competitionId);
        res.json({ success: true, competitionId, message: 'Competition created successfully' });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Yarisma olusturma hatasi');
        res.status(500).json({ success: false, error: 'Failed to create competition' });
    }
});
router.put('/:id', authMiddleware_1.authenticateToken, (0, authMiddleware_1.requireRole)('admin'), async (req, res) => {
    try {
        const competitionId = parseInt(req.params.id);
        const { name, status } = req.body;
        await postgres_1.default.updateCompetition(competitionId, { name, status });
        res.json({ success: true, message: 'Competition updated successfully' });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Yarisma guncelleme hatasi');
        res.status(500).json({ success: false, error: 'Failed to update competition' });
    }
});
router.get('/:id/contestants', async (req, res) => {
    try {
        const competitionId = parseInt(req.params.id);
        const contestants = await postgres_1.default.getContestantsByCompetition(competitionId);
        res.json({ success: true, contestants });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Yarismacilari getirme hatasi');
        res.status(500).json({ success: false, error: 'Failed to fetch contestants' });
    }
});
router.get('/:id/leaderboard', async (req, res) => {
    try {
        const competitionId = parseInt(req.params.id);
        const leaderboard = await postgres_1.default.getLeaderboardByCompetition(competitionId);
        res.json({ success: true, leaderboard });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Siralama getirme hatasi');
        res.status(500).json({ success: false, error: 'Failed to fetch leaderboard' });
    }
});
exports.default = router;
//# sourceMappingURL=competitionRoutes.js.map