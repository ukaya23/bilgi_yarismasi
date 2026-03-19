/**
 * Game Routes
 * Handles game data queries and legacy competition management
 */

const express = require('express');
const router = express.Router();
const db = require('../../database/postgres');
const { authenticateToken, requireRole } = require('../auth/authMiddleware');
const competitionManager = require('../state/competitionManager');
const log = require('../utils/logger');

// ==================== GAME DATA API ====================

/**
 * GET /api/questions
 */
router.get('/questions', async (req, res) => {
    res.json(await db.getAllQuestions());
});

/**
 * GET /api/contestants
 */
router.get('/contestants', async (req, res) => {
    const competitionId = req.query.competitionId ? parseInt(req.query.competitionId) : null;
    res.json(await db.getAllContestants(competitionId));
});

/**
 * GET /api/leaderboard
 */
router.get('/leaderboard', async (req, res) => {
    const competitionId = req.query.competitionId ? parseInt(req.query.competitionId) : null;
    res.json(await db.getLeaderboard(competitionId));
});

/**
 * GET /api/state
 */
router.get('/state', async (req, res) => {
    const activeComp = await db.getActiveCompetition();
    const compId = activeComp ? activeComp.id : 1;
    res.json(competitionManager.getGameState(compId).getState());
});

// ==================== LEGACY COMPETITION API ====================

/**
 * POST /api/competition
 * Create competition (admin panel)
 */
router.post('/competition', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { name, contestantCount, juryCount } = req.body;

        if (!name || !contestantCount || !juryCount) {
            return res.status(400).json({ error: 'Tüm alanlar gerekli' });
        }

        // Mevcut aktif yarışmayı kapat
        const activeCompetition = await db.getActiveCompetition();
        if (activeCompetition) {
            log.debug({ competitionId: activeCompetition.id }, 'Mevcut aktif yarisma kapatiliyor');
            await db.updateCompetitionStatus(activeCompetition.id, 'COMPLETED');
        }

        // Yeni yarışma oluştur
        const competitionId = await db.createCompetition(name, contestantCount, juryCount);
        log.debug({ competitionId }, 'Yeni yarisma olusturuldu');

        // Erişim kodlarını oluştur
        const codes = await db.generateAccessCodes(competitionId, contestantCount, juryCount);
        log.debug({ count: codes.length }, 'Erisim kodlari olusturuldu');

        res.json({
            success: true,
            competitionId,
            codes
        });
    } catch (error) {
        log.error({ err: error }, 'Yarisma olusturma hatasi');
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

/**
 * POST /api/competition/end
 * End active competition
 */
router.post('/competition/end', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const activeCompetition = await db.getActiveCompetition();
        if (activeCompetition) {
            await db.updateCompetitionStatus(activeCompetition.id, 'COMPLETED');
            await db.resetAllAccessCodes(activeCompetition.id);
            const gs = competitionManager.getGameState(activeCompetition.id);
            await gs.resetGame();
            competitionManager.removeGameState(activeCompetition.id);
            log.info({ competitionId: activeCompetition.id }, 'Yarisma sonlandirildi');
        }
        res.json({ success: true });
    } catch (error) {
        log.error({ err: error }, 'Yarisma sonlandirma hatasi');
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

/**
 * GET /api/competition/active
 * Get active competition
 */
router.get('/competition/active', async (req, res) => {
    try {
        const competition = await db.getActiveCompetition();
        log.debug({ competition }, 'Aktif yarisma');
        if (!competition) {
            return res.json({ active: false });
        }

        const codes = await db.getAccessCodesByCompetition(competition.id);
        log.debug({ count: codes.length, competitionId: competition.id }, 'Yarisma kodlari');
        res.json({
            active: true,
            competition,
            codes
        });
    } catch (error) {
        log.error({ err: error }, 'Yarisma getirme hatasi');
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

/**
 * PUT /api/competition/code/:id
 * Update access code name
 */
router.put('/competition/code/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'İsim gerekli' });
        }

        await db.updateAccessCodeName(parseInt(id), name);
        res.json({ success: true });
    } catch (error) {
        log.error({ err: error }, 'Kod guncelleme hatasi');
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

/**
 * POST /api/competition/code/:id/reset
 * Reset access code
 */
router.post('/competition/code/:id/reset', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        await db.resetAccessCode(parseInt(id));
        res.json({ success: true });
    } catch (error) {
        log.error({ err: error }, 'Kod sifirlama hatasi');
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

module.exports = router;
