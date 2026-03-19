"use strict";
/**
 * JWT Utility Functions
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAccessToken = generateAccessToken;
exports.generateRefreshToken = generateRefreshToken;
exports.generateTokenPair = generateTokenPair;
exports.verifyToken = verifyToken;
exports.extractTokenFromHeader = extractTokenFromHeader;
exports.decodeToken = decodeToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ACCESS_EXPIRY = (process.env.JWT_ACCESS_EXPIRY || '15m');
const JWT_REFRESH_EXPIRY = (process.env.JWT_REFRESH_EXPIRY || '7d');
if (!JWT_SECRET) {
    throw new Error('JWT_SECRET must be set in environment variables');
}
function generateAccessToken(payload) {
    return jsonwebtoken_1.default.sign(payload, JWT_SECRET, {
        expiresIn: JWT_ACCESS_EXPIRY,
        issuer: 'quiz-game',
        audience: 'quiz-client'
    });
}
function generateRefreshToken(payload) {
    return jsonwebtoken_1.default.sign(payload, JWT_SECRET, {
        expiresIn: JWT_REFRESH_EXPIRY,
        issuer: 'quiz-game',
        audience: 'quiz-client'
    });
}
function generateTokenPair(user) {
    const tokenId = crypto_1.default.randomUUID();
    const payload = {
        userId: user.id,
        username: user.username,
        role: user.role,
        competitionId: user.competitionId || null,
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
function verifyToken(token) {
    try {
        return jsonwebtoken_1.default.verify(token, JWT_SECRET, {
            issuer: 'quiz-game',
            audience: 'quiz-client'
        });
    }
    catch (error) {
        if (error.name === 'TokenExpiredError') {
            throw new Error('Token expired');
        }
        else if (error.name === 'JsonWebTokenError') {
            throw new Error('Invalid token');
        }
        throw error;
    }
}
function extractTokenFromHeader(authHeader) {
    if (!authHeader)
        return null;
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
        return parts[1];
    }
    return null;
}
function decodeToken(token) {
    try {
        return jsonwebtoken_1.default.decode(token);
    }
    catch (error) {
        return null;
    }
}
//# sourceMappingURL=jwtUtils.js.map