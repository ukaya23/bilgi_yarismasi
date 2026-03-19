/**
 * Admin (Sunucu) Event Handler
 */
import type { Server, Socket } from 'socket.io';
import type { GameState } from '../state/gameState';
export declare function registerAdminHandlers(io: Server, socket: Socket, gameState: GameState): Promise<void>;
//# sourceMappingURL=adminHandler.d.ts.map