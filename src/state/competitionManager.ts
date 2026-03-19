/**
 * Competition Manager
 * Manages multiple concurrent competitions with isolated game states
 */

import type { Server } from 'socket.io';
import { GameState } from './gameState';
import db from '../../database/postgres';
import log from '../utils/logger';

class CompetitionManager {
    private competitions: Map<number, GameState> = new Map();
    private io: Server | null = null;

    setIO(io: Server): void {
        this.io = io;
        for (const [, gameState] of this.competitions.entries()) {
            gameState.setIO(io);
        }
    }

    getGameState(competitionId: number): GameState {
        if (!this.competitions.has(competitionId)) {
            const gameState = new GameState(competitionId);
            if (this.io) {
                gameState.setIO(this.io);
            }
            this.competitions.set(competitionId, gameState);
            log.info({ competitionId }, 'Created new game state');
        }
        return this.competitions.get(competitionId)!;
    }

    async getActiveCompetitions() {
        const competitions = await db.getActiveCompetitions();
        return competitions.map(comp => ({
            ...comp,
            gameState: this.getGameState(comp.id).getState()
        }));
    }

    removeGameState(competitionId: number): void {
        const gameState = this.competitions.get(competitionId);
        if (gameState) {
            gameState.stopTimer();
            this.competitions.delete(competitionId);
            log.info({ competitionId }, 'Removed game state');
        }
    }

    getStats() {
        const stats: { totalCompetitions: number; competitions: any[] } = {
            totalCompetitions: this.competitions.size,
            competitions: []
        };

        for (const [competitionId, gameState] of this.competitions.entries()) {
            stats.competitions.push({
                competitionId,
                state: gameState.getState()
            });
        }

        return stats;
    }

    broadcastToCompetition(competitionId: number, room: string, event: string, data: any): void {
        if (this.io) {
            this.io.to(`${room}-${competitionId}`).emit(event, data);
        }
    }
}

export default new CompetitionManager();
