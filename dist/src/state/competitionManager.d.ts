/**
 * Competition Manager
 * Manages multiple concurrent competitions with isolated game states
 */
import type { Server } from 'socket.io';
import { GameState } from './gameState';
declare class CompetitionManager {
    private competitions;
    private io;
    setIO(io: Server): void;
    getGameState(competitionId: number): GameState;
    getActiveCompetitions(): Promise<{
        gameState: {
            competitionId: number;
            state: import("../types").GamePhase;
            currentQuestion: import("./gameState").CurrentQuestion | null;
            timeRemaining: number;
            answeredPlayers: number[];
        };
        id: number;
        name: string;
        contestant_count: number;
        jury_count: number;
        status: import("../types").CompetitionStatus;
        created_at?: string;
    }[]>;
    removeGameState(competitionId: number): void;
    getStats(): {
        totalCompetitions: number;
        competitions: any[];
    };
    broadcastToCompetition(competitionId: number, room: string, event: string, data: any): void;
}
declare const _default: CompetitionManager;
export default _default;
//# sourceMappingURL=competitionManager.d.ts.map