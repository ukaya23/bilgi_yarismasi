"use strict";
/**
 * Authentication Middleware for Express Routes
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = authenticateToken;
exports.authenticateRefreshToken = authenticateRefreshToken;
exports.requireRole = requireRole;
exports.optionalAuth = optionalAuth;
const jwtUtils_1 = require("./jwtUtils");
const postgres_1 = __importDefault(require("../../database/postgres"));
async function authenticateToken(req, res, next) {
    try {
        const token = (0, jwtUtils_1.extractTokenFromHeader)(req.headers.authorization);
        if (!token) {
            res.status(401).json({ success: false, error: 'No token provided' });
            return;
        }
        const decoded = (0, jwtUtils_1.verifyToken)(token);
        const isRevoked = await postgres_1.default.isTokenRevokedOrUserBanned(decoded.tokenId, decoded.userId, decoded.iat);
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
    }
    catch (error) {
        res.status(401).json({ success: false, error: error.message || 'Invalid token' });
    }
}
async function authenticateRefreshToken(req, res, next) {
    try {
        const token = (0, jwtUtils_1.extractTokenFromHeader)(req.headers.authorization);
        if (!token) {
            res.status(401).json({ success: false, error: 'No refresh token provided' });
            return;
        }
        const decoded = (0, jwtUtils_1.verifyToken)(token);
        if (decoded.type !== 'refresh') {
            res.status(401).json({ success: false, error: 'Invalid token type' });
            return;
        }
        const isRevoked = await postgres_1.default.isTokenRevokedOrUserBanned(decoded.tokenId, decoded.userId, decoded.iat);
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
    }
    catch (error) {
        res.status(401).json({ success: false, error: error.message || 'Invalid refresh token' });
    }
}
function requireRole(...roles) {
    return (req, res, next) => {
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
async function optionalAuth(req, res, next) {
    try {
        const token = (0, jwtUtils_1.extractTokenFromHeader)(req.headers.authorization);
        if (token) {
            const decoded = (0, jwtUtils_1.verifyToken)(token);
            const isRevoked = await postgres_1.default.isTokenRevokedOrUserBanned(decoded.tokenId, decoded.userId, decoded.iat);
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
    }
    catch (error) {
        next();
    }
}
//# sourceMappingURL=authMiddleware.js.map