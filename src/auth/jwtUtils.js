/**
 * JWT Utility Functions
 * Handles token generation, validation, and refresh
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

if (!JWT_SECRET) {
    throw new Error('JWT_SECRET must be set in environment variables');
}

/**
 * Generate access token
 * @param {Object} payload - User data to encode
 * @returns {string} JWT access token
 */
function generateAccessToken(payload) {
    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_ACCESS_EXPIRY,
        issuer: 'quiz-game',
        audience: 'quiz-client'
    });
}

/**
 * Generate refresh token
 * @param {Object} payload - User data to encode
 * @returns {string} JWT refresh token
 */
function generateRefreshToken(payload) {
    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_REFRESH_EXPIRY,
        issuer: 'quiz-game',
        audience: 'quiz-client'
    });
}

/**
 * Generate both access and refresh tokens
 * @param {Object} user - User object
 * @returns {Object} { accessToken, refreshToken, tokenId }
 */
function generateTokenPair(user) {
    const tokenId = crypto.randomUUID();

    const payload = {
        userId: user.id,
        username: user.username,
        role: user.role, // 'admin', 'player', 'jury'
        competitionId: user.competitionId || null, // Optional competition context
        tokenId: tokenId,
        type: 'access'
    };

    const refreshPayload = {
        userId: user.id,
        username: user.username,
        role: user.role,
        competitionId: user.competitionId || null,
        tokenId: tokenId,
        type: 'refresh'
    };

    return {
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(refreshPayload),
        tokenId: tokenId
    };
}

/**
 * Verify and decode token
 * @param {string} token - JWT token
 * @returns {Object} Decoded payload
 * @throws {Error} If token is invalid
 */
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET, {
            issuer: 'quiz-game',
            audience: 'quiz-client'
        });
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            throw new Error('Token expired');
        } else if (error.name === 'JsonWebTokenError') {
            throw new Error('Invalid token');
        }
        throw error;
    }
}

/**
 * Extract token from Authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} Token or null
 */
function extractTokenFromHeader(authHeader) {
    if (!authHeader) return null;

    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
        return parts[1];
    }

    return null;
}

/**
 * Decode token without verification (for expired tokens)
 * @param {string} token - JWT token
 * @returns {Object|null} Decoded payload or null
 */
function decodeToken(token) {
    try {
        return jwt.decode(token);
    } catch (error) {
        return null;
    }
}

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    generateTokenPair,
    verifyToken,
    extractTokenFromHeader,
    decodeToken
};
