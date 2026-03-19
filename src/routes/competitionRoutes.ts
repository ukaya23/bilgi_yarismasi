/**
 * Competition Management Routes
 */

import express, { Request, Response } from 'express';
import db from '../../database/postgres';
import { authenticateToken, requireRole } from '../auth/authMiddleware';
import competitionManager from '../state/competitionManager';
import log from '../utils/logger';
import type { AuthenticatedRequest } from '../types';

const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
    try {
        const competitions = await competitionManager.getActiveCompetitions();
        res.json({ success: true, competitions });
    } catch (error) {
        log.error({ err: error }, 'Yarismalari getirme hatasi');
        res.status(500).json({ success: false, error: 'Failed to fetch competitions' });
    }
});

router.get('/:id', async (req: Request<{id: string}>, res: Response) => {
    try {
        const competitionId = parseInt(req.params.id);
        const competition = await db.getCompetitionById(competitionId);

        if (!competition) {
            res.status(404).json({ success: false, error: 'Competition not found' });
            return;
        }

        const gameState = competitionManager.getGameState(competitionId);
        res.json({ success: true, competition: { ...competition, gameState: gameState.getState() } });
    } catch (error) {
        log.error({ err: error }, 'Yarisma getirme hatasi');
        res.status(500).json({ success: false, error: 'Failed to fetch competition' });
    }
});

router.post('/', authenticateToken as any, requireRole('admin') as any, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { name, contestantCount, juryCount } = req.body;

        if (!name) {
            res.status(400).json({ success: false, error: 'Competition name is required' });
            return;
        }

        const competitionId = await db.createCompetition(name, contestantCount || 8, juryCount || 2);
        competitionManager.getGameState(competitionId);

        res.json({ success: true, competitionId, message: 'Competition created successfully' });
    } catch (error) {
        log.error({ err: error }, 'Yarisma olusturma hatasi');
        res.status(500).json({ success: false, error: 'Failed to create competition' });
    }
});

router.put('/:id', authenticateToken as any, requireRole('admin') as any, async (req: any, res: Response) => {
    try {
        const competitionId = parseInt(req.params.id);
        const { name, status } = req.body;

        await db.updateCompetition(competitionId, { name, status });
        res.json({ success: true, message: 'Competition updated successfully' });
    } catch (error) {
        log.error({ err: error }, 'Yarisma guncelleme hatasi');
        res.status(500).json({ success: false, error: 'Failed to update competition' });
    }
});

router.get('/:id/contestants', async (req: Request<{id: string}>, res: Response) => {
    try {
        const competitionId = parseInt(req.params.id);
        const contestants = await db.getContestantsByCompetition(competitionId);
        res.json({ success: true, contestants });
    } catch (error) {
        log.error({ err: error }, 'Yarismacilari getirme hatasi');
        res.status(500).json({ success: false, error: 'Failed to fetch contestants' });
    }
});

router.get('/:id/leaderboard', async (req: Request<{id: string}>, res: Response) => {
    try {
        const competitionId = parseInt(req.params.id);
        const leaderboard = await db.getLeaderboardByCompetition(competitionId);
        res.json({ success: true, leaderboard });
    } catch (error) {
        log.error({ err: error }, 'Siralama getirme hatasi');
        res.status(500).json({ success: false, error: 'Failed to fetch leaderboard' });
    }
});

export default router;
