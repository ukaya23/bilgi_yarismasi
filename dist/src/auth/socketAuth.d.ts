/**
 * Socket.io JWT Authentication Middleware
 */
import type { AuthenticatedSocket } from '../types';
export declare function socketAuthMiddleware(socket: AuthenticatedSocket, next: (err?: Error) => void): Promise<void>;
export declare function requireSocketRole(...roles: string[]): (socket: AuthenticatedSocket, next: (err?: Error) => void) => void;
export declare function optionalSocketAuth(socket: AuthenticatedSocket, next: (err?: Error) => void): Promise<void>;
//# sourceMappingURL=socketAuth.d.ts.map