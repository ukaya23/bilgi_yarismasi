/**
 * Authentication Middleware for Express Routes
 */

import { Request, Response, NextFunction } from 'express';
import { verifyToken, extractTokenFromHeader } from './jwtUtils';
import db from '../../database/postgres';
import type { AuthenticatedRequest, UserRole } from '../types';

export async function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const token = extractTokenFromHeader(req.headers.authorization);

        if (!token) {
            res.status(401).json({ success: false, error: 'No token provided' });
            return;
        }

        const decoded = verifyToken(token);

        const isRevoked = await db.isTokenRevokedOrUserBanned(decoded.tokenId, decoded.userId, decoded.iat);
        if (isRevoked) {
            res.status(401).json({ success: false, error: 'Token has been revoked' });
            return;
        }

        req.user = {
            userId: decoded.userId,
            username: decoded.username,
            role: decoded.role,
            competitionId: decoded.competitionId,
            tokenId: decoded.tokenId,
            type: decoded.type,
            iat: decoded.iat,
            exp: decoded.exp
        };

        next();
    } catch (error: any) {
        res.status(401).json({ success: false, error: error.message || 'Invalid token' });
    }
}

export async function authenticateRefreshToken(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const token = extractTokenFromHeader(req.headers.authorization);

        if (!token) {
            res.status(401).json({ success: false, error: 'No refresh token provided' });
            return;
        }

        const decoded = verifyToken(token);

        if (decoded.type !== 'refresh') {
            res.status(401).json({ success: false, error: 'Invalid token type' });
            return;
        }

        const isRevoked = await db.isTokenRevokedOrUserBanned(decoded.tokenId, decoded.userId, decoded.iat);
        if (isRevoked) {
            res.status(401).json({ success: false, error: 'Token has been revoked' });
            return;
        }

        req.user = {
            userId: decoded.userId,
            username: decoded.username,
            role: decoded.role,
            competitionId: decoded.competitionId,
            tokenId: decoded.tokenId,
            type: decoded.type,
            iat: decoded.iat,
            exp: decoded.exp
        };

        next();
    } catch (error: any) {
        res.status(401).json({ success: false, error: error.message || 'Invalid refresh token' });
    }
}

export function requireRole(...roles: UserRole[]) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ success: false, error: 'Unauthorized' });
            return;
        }

        if (!roles.includes(req.user.role)) {
            res.status(403).json({ success: false, error: 'Insufficient permissions' });
            return;
        }

        next();
    };
}

export async function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const token = extractTokenFromHeader(req.headers.authorization);

        if (token) {
            const decoded = verifyToken(token);
            const isRevoked = await db.isTokenRevokedOrUserBanned(decoded.tokenId, decoded.userId, decoded.iat);

            if (!isRevoked) {
                req.user = {
                    userId: decoded.userId,
                    username: decoded.username,
                    role: decoded.role,
                    tokenId: decoded.tokenId,
                    type: decoded.type,
                    iat: decoded.iat,
                    exp: decoded.exp
                };
            }
        }

        next();
    } catch (error) {
        next();
    }
}
