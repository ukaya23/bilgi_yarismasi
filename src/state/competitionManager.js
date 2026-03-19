/**
 * Competition Manager
 * Manages multiple concurrent competitions with isolated game states
 */

const { GameState } = require('./gameState');
// CompetitionManager is the sole creator of GameState instances
const db = require('../../database/postgres');
const log = require('../utils/logger');

class CompetitionManager {
    constructor() {
        // Map of competitionId -> GameState instance
        this.competitions = new Map();
        this.io = null;
    }

    /**
     * Set Socket.io instance for all game states
     */
    setIO(io) {
        this.io = io;
        // Update existing game states
        for (const [competitionId, gameState] of this.competitions.entries()) {
            gameState.setIO(io);
        }
    }

    /**
     * Get or create game state for a competition
     * @param {number} competitionId - Competition ID
     * @returns {GameState} Game state instance for this competition
     */
    getGameState(competitionId) {
        if (!this.competitions.has(competitionId)) {
            const gameState = new GameState(competitionId);
            if (this.io) {
                gameState.setIO(this.io);
            }
            this.competitions.set(competitionId, gameState);
            log.info({ competitionId }, 'Created new game state');
        }
        return this.competitions.get(competitionId);
    }

    /**
     * Get all active competitions
     * @returns {Array} List of active competitions with their game states
     */
    async getActiveCompetitions() {
        const competitions = await db.getActiveCompetitions();
        return competitions.map(comp => ({
            ...comp,
            gameState: this.getGameState(comp.id).getState()
        }));
    }

    /**
     * Remove game state for a completed competition
     * @param {number} competitionId - Competition ID
     */
    removeGameState(competitionId) {
        const gameState = this.competitions.get(competitionId);
        if (gameState) {
            gameState.stopTimer();
            this.competitions.delete(competitionId);
            log.info({ competitionId }, 'Removed game state');
        }
    }

    /**
     * Get stats for all competitions
     */
    getStats() {
        const stats = {
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

    /**
     * Broadcast to specific competition room
     * @param {number} competitionId - Competition ID
     * @param {string} room - Room name (admin, player, jury, screen)
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    broadcastToCompetition(competitionId, room, event, data) {
        if (this.io) {
            this.io.to(`${room}-${competitionId}`).emit(event, data);
        }
    }
}

// Singleton instance
module.exports = new CompetitionManager();
