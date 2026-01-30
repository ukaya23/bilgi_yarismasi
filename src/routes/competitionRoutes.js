/**
 * Competition Management Routes
 * Handles CRUD operations for competitions
 */

const express = require('express');
const router = express.Router();
const db = require('../../database/postgres');
const { authenticateToken, requireRole } = require('../auth/authMiddleware');
const competitionManager = require('../state/competitionManager');

/**
 * GET /api/competitions
 * Get all active competitions
 */
router.get('/', async (req, res) => {
    try {
        const competitions = await competitionManager.getActiveCompetitions();
        res.json({
            success: true,
            competitions
        });
    } catch (error) {
        console.error('[COMPETITION] Get competitions error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch competitions'
        });
    }
});

/**
 * GET /api/competitions/:id
 * Get specific competition details
 */
router.get('/:id', async (req, res) => {
    try {
        const competitionId = parseInt(req.params.id);
        const competition = await db.getCompetitionById(competitionId);

        if (!competition) {
            return res.status(404).json({
                success: false,
                error: 'Competition not found'
            });
        }

        const gameState = competitionManager.getGameState(competitionId);

        res.json({
            success: true,
            competition: {
                ...competition,
                gameState: gameState.getState()
            }
        });
    } catch (error) {
        console.error('[COMPETITION] Get competition error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch competition'
        });
    }
});

/**
 * POST /api/competitions
 * Create new competition (admin only)
 */
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { name, contestantCount, juryCount } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                error: 'Competition name is required'
            });
        }

        const competitionId = await db.createCompetition(
            name,
            contestantCount || 8,
            juryCount || 2
        );

        // Initialize game state for new competition
        competitionManager.getGameState(competitionId);

        res.json({
            success: true,
            competitionId,
            message: 'Competition created successfully'
        });
    } catch (error) {
        console.error('[COMPETITION] Create competition error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create competition'
        });
    }
});

/**
 * PUT /api/competitions/:id
 * Update competition (admin only)
 */
router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const competitionId = parseInt(req.params.id);
        const { name, status } = req.body;

        await db.updateCompetition(competitionId, { name, status });

        res.json({
            success: true,
            message: 'Competition updated successfully'
        });
    } catch (error) {
        console.error('[COMPETITION] Update competition error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update competition'
        });
    }
});

/**
 * GET /api/competitions/:id/contestants
 * Get contestants for a competition
 */
router.get('/:id/contestants', async (req, res) => {
    try {
        const competitionId = parseInt(req.params.id);
        const contestants = await db.getContestantsByCompetition(competitionId);

        res.json({
            success: true,
            contestants
        });
    } catch (error) {
        console.error('[COMPETITION] Get contestants error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch contestants'
        });
    }
});

/**
 * GET /api/competitions/:id/leaderboard
 * Get leaderboard for a competition
 */
router.get('/:id/leaderboard', async (req, res) => {
    try {
        const competitionId = parseInt(req.params.id);
        const leaderboard = await db.getLeaderboardByCompetition(competitionId);

        res.json({
            success: true,
            leaderboard
        });
    } catch (error) {
        console.error('[COMPETITION] Get leaderboard error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch leaderboard'
        });
    }
});

module.exports = router;
