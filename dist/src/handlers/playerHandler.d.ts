/**
 * Yarışmacı Event Handler
 */
import type { Server, Socket } from 'socket.io';
import type { GameState } from '../state/gameState';
interface PlayerSocket extends Socket {
    contestantId?: number | null;
}
export declare function registerPlayerHandlers(io: Server, socket: PlayerSocket, gameState: GameState): void;
export {};
//# sourceMappingURL=playerHandler.d.ts.map