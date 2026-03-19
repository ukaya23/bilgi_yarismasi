/**
 * JWT Utility Functions
 */

import jwt, { type SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import type { TokenPayload, TokenPair, DecodedToken, UserRole } from '../types';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ACCESS_EXPIRY: jwt.SignOptions['expiresIn'] = (process.env.JWT_ACCESS_EXPIRY || '15m') as any;
const JWT_REFRESH_EXPIRY: jwt.SignOptions['expiresIn'] = (process.env.JWT_REFRESH_EXPIRY || '7d') as any;

if (!JWT_SECRET) {
    throw new Error('JWT_SECRET must be set in environment variables');
}

export function generateAccessToken(payload: object): string {
    return jwt.sign(payload, JWT_SECRET!, {
        expiresIn: JWT_ACCESS_EXPIRY,
        issuer: 'quiz-game',
        audience: 'quiz-client'
    });
}

export function generateRefreshToken(payload: object): string {
    return jwt.sign(payload, JWT_SECRET!, {
        expiresIn: JWT_REFRESH_EXPIRY,
        issuer: 'quiz-game',
        audience: 'quiz-client'
    });
}

export function generateTokenPair(user: TokenPayload): TokenPair & { tokenId: string } {
    const tokenId = crypto.randomUUID();

    const payload = {
        userId: user.id,
        username: user.username,
        role: user.role,
        competitionId: user.competitionId || null,
        tokenId: tokenId,
        type: 'access' as const
    };

    const refreshPayload = {
        userId: user.id,
        username: user.username,
        role: user.role,
        competitionId: user.competitionId || null,
        tokenId: tokenId,
        type: 'refresh' as const
    };

    return {
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(refreshPayload),
        tokenId: tokenId
    };
}

export function verifyToken(token: string): DecodedToken {
    try {
        return jwt.verify(token, JWT_SECRET!, {
            issuer: 'quiz-game',
            audience: 'quiz-client'
        }) as DecodedToken;
    } catch (error: any) {
        if (error.name === 'TokenExpiredError') {
            throw new Error('Token expired');
        } else if (error.name === 'JsonWebTokenError') {
            throw new Error('Invalid token');
        }
        throw error;
    }
}

export function extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader) return null;

    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
        return parts[1];
    }

    return null;
}

export function decodeToken(token: string): DecodedToken | null {
    try {
        return jwt.decode(token) as DecodedToken | null;
    } catch (error) {
        return null;
    }
}
