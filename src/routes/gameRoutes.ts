/**
 * Game Routes - Game data queries and legacy competition management
 */

import express, { Request, Response } from 'express';
import db from '../../database/postgres';
import { authenticateToken, requireRole } from '../auth/authMiddleware';
import competitionManager from '../state/competitionManager';
import log from '../utils/logger';
import type { AuthenticatedRequest } from '../types';

const router = express.Router();

// ==================== GAME DATA API ====================

router.get('/questions', async (req: Request, res: Response) => {
    res.json(await db.getAllQuestions());
});

router.get('/contestants', async (req: Request, res: Response) => {
    const competitionId = req.query.competitionId ? parseInt(req.query.competitionId as string) : null;
    res.json(await db.getAllContestants(competitionId));
});

router.get('/leaderboard', async (req: Request, res: Response) => {
    const competitionId = req.query.competitionId ? parseInt(req.query.competitionId as string) : null;
    res.json(await db.getLeaderboard(competitionId));
});

router.get('/state', async (req: Request, res: Response) => {
    const activeComp = await db.getActiveCompetition();
    const compId = activeComp ? activeComp.id : 1;
    res.json(competitionManager.getGameState(compId).getState());
});

// ==================== LEGACY COMPETITION API ====================

router.post('/competition', authenticateToken as any, requireRole('admin') as any, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { name, contestantCount, juryCount } = req.body;

        if (!name || !contestantCount || !juryCount) {
            res.status(400).json({ error: 'Tüm alanlar gerekli' });
            return;
        }

        const activeCompetition = await db.getActiveCompetition();
        if (activeCompetition) {
            log.debug({ competitionId: activeCompetition.id }, 'Mevcut aktif yarisma kapatiliyor');
            await db.updateCompetitionStatus(activeCompetition.id, 'COMPLETED');
        }

        const competitionId = await db.createCompetition(name, contestantCount, juryCount);
        log.debug({ competitionId }, 'Yeni yarisma olusturuldu');

        const codes = await db.generateAccessCodes(competitionId, contestantCount, juryCount);
        log.debug({ count: codes.length }, 'Erisim kodlari olusturuldu');

        res.json({ success: true, competitionId, codes });
    } catch (error) {
        log.error({ err: error }, 'Yarisma olusturma hatasi');
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.post('/competition/end', authenticateToken as any, requireRole('admin') as any, async (req: AuthenticatedRequest, res: Response) => {
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

router.get('/competition/active', async (req: Request, res: Response) => {
    try {
        const competition = await db.getActiveCompetition();
        log.debug({ competition }, 'Aktif yarisma');
        if (!competition) {
            res.json({ active: false });
            return;
        }

        const codes = await db.getAccessCodesByCompetition(competition.id);
        log.debug({ count: codes.length, competitionId: competition.id }, 'Yarisma kodlari');
        res.json({ active: true, competition, codes });
    } catch (error) {
        log.error({ err: error }, 'Yarisma getirme hatasi');
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.put('/competition/code/:id', authenticateToken as any, requireRole('admin') as any, async (req: any, res: Response) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        if (!name) {
            res.status(400).json({ error: 'İsim gerekli' });
            return;
        }

        await db.updateAccessCodeName(parseInt(id), name);
        res.json({ success: true });
    } catch (error) {
        log.error({ err: error }, 'Kod guncelleme hatasi');
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.post('/competition/code/:id/reset', authenticateToken as any, requireRole('admin') as any, async (req: any, res: Response) => {
    try {
        const { id } = req.params;
        await db.resetAccessCode(parseInt(id));
        res.json({ success: true });
    } catch (error) {
        log.error({ err: error }, 'Kod sifirlama hatasi');
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

export default router;
