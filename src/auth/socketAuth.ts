/**
 * Socket.io JWT Authentication Middleware
 */

import { verifyToken } from './jwtUtils';
import db from '../../database/postgres';
import log from '../utils/logger';
import type { AuthenticatedSocket } from '../types';

export async function socketAuthMiddleware(socket: AuthenticatedSocket, next: (err?: Error) => void): Promise<void> {
    try {
        let token: string | null = null;

        if (socket.handshake.auth && socket.handshake.auth.token) {
            token = socket.handshake.auth.token;
        } else if (socket.handshake.query && socket.handshake.query.token) {
            token = socket.handshake.query.token as string;
        } else if (socket.handshake.headers.authorization) {
            const authHeader = socket.handshake.headers.authorization;
            const parts = authHeader.split(' ');
            if (parts.length === 2 && parts[0] === 'Bearer') {
                token = parts[1];
            }
        }

        if (!token) {
            return next(new Error('Authentication token required'));
        }

        const decoded = verifyToken(token);

        const isRevoked = await db.isTokenRevokedOrUserBanned(decoded.tokenId, decoded.userId, decoded.iat);
        if (isRevoked) {
            return next(new Error('Token has been revoked'));
        }

        socket.userId = decoded.userId;
        socket.username = decoded.username;
        socket.role = decoded.role;
        socket.competitionId = decoded.competitionId;

        socket.data.user = {
            userId: decoded.userId,
            username: decoded.username,
            role: decoded.role,
            competitionId: decoded.competitionId,
            tokenId: decoded.tokenId
        };

        next();
    } catch (error) {
        log.error({ err: error }, 'Socket auth failed');
        next(new Error('Invalid or expired token'));
    }
}

export function requireSocketRole(...roles: string[]) {
    return (socket: AuthenticatedSocket, next: (err?: Error) => void): void => {
        if (!socket.role || !roles.includes(socket.role)) {
            return next(new Error('Insufficient permissions'));
        }
        next();
    };
}

export async function optionalSocketAuth(socket: AuthenticatedSocket, next: (err?: Error) => void): Promise<void> {
    try {
        let token: string | null = null;

        if (socket.handshake.auth && socket.handshake.auth.token) {
            token = socket.handshake.auth.token;
        } else if (socket.handshake.query && socket.handshake.query.token) {
            token = socket.handshake.query.token as string;
        }

        if (token) {
            const decoded = verifyToken(token);
            const isRevoked = await db.isTokenRevokedOrUserBanned(decoded.tokenId, decoded.userId, decoded.iat);

            if (!isRevoked) {
                socket.userId = decoded.userId;
                socket.username = decoded.username;
                socket.role = decoded.role;
                socket.competitionId = decoded.competitionId;

                socket.data.user = {
                    userId: decoded.userId,
                    username: decoded.username,
                    role: decoded.role,
                    competitionId: decoded.competitionId,
                    tokenId: decoded.tokenId
                };
            }
        }

        next();
    } catch (error) {
        next();
    }
}
