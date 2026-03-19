"use strict";
/**
 * Competition Manager
 * Manages multiple concurrent competitions with isolated game states
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const gameState_1 = require("./gameState");
const postgres_1 = __importDefault(require("../../database/postgres"));
const logger_1 = __importDefault(require("../utils/logger"));
class CompetitionManager {
    constructor() {
        this.competitions = new Map();
        this.io = null;
    }
    setIO(io) {
        this.io = io;
        for (const [, gameState] of this.competitions.entries()) {
            gameState.setIO(io);
        }
    }
    getGameState(competitionId) {
        if (!this.competitions.has(competitionId)) {
            const gameState = new gameState_1.GameState(competitionId);
            if (this.io) {
                gameState.setIO(this.io);
            }
            this.competitions.set(competitionId, gameState);
            logger_1.default.info({ competitionId }, 'Created new game state');
        }
        return this.competitions.get(competitionId);
    }
    async getActiveCompetitions() {
        const competitions = await postgres_1.default.getActiveCompetitions();
        return competitions.map(comp => ({
            ...comp,
            gameState: this.getGameState(comp.id).getState()
        }));
    }
    removeGameState(competitionId) {
        const gameState = this.competitions.get(competitionId);
        if (gameState) {
            gameState.stopTimer();
            this.competitions.delete(competitionId);
            logger_1.default.info({ competitionId }, 'Removed game state');
        }
    }
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
    broadcastToCompetition(competitionId, room, event, data) {
        if (this.io) {
            this.io.to(`${room}-${competitionId}`).emit(event, data);
        }
    }
}
exports.default = new CompetitionManager();
//# sourceMappingURL=competitionManager.js.map