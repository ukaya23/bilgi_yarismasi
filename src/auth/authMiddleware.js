/**
 * Authentication Middleware for Express Routes
 */

const { verifyToken, extractTokenFromHeader } = require('./jwtUtils');
const db = require('../../database/postgres');

/**
 * Verify JWT token and attach user to request
 */
async function authenticateToken(req, res, next) {
    try {
        const token = extractTokenFromHeader(req.headers.authorization);

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'No token provided'
            });
        }

        // Verify token
        const decoded = verifyToken(token);

        // Check if token is revoked
        const isRevoked = await db.isTokenRevoked(decoded.tokenId);
        if (isRevoked) {
            return res.status(401).json({
                success: false,
                error: 'Token has been revoked'
            });
        }

        // Attach user info to request
        req.user = {
            userId: decoded.userId,
            username: decoded.username,
            role: decoded.role,
            competitionId: decoded.competitionId,
            tokenId: decoded.tokenId
        };

        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            error: error.message || 'Invalid token'
        });
    }
}

/**
 * Verify refresh token
 */
async function authenticateRefreshToken(req, res, next) {
    try {
        const token = extractTokenFromHeader(req.headers.authorization);

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'No refresh token provided'
            });
        }

        // Verify token
        const decoded = verifyToken(token);

        // Ensure it's a refresh token
        if (decoded.type !== 'refresh') {
            return res.status(401).json({
                success: false,
                error: 'Invalid token type'
            });
        }

        // Check if token is revoked
        const isRevoked = await db.isTokenRevoked(decoded.tokenId);
        if (isRevoked) {
            return res.status(401).json({
                success: false,
                error: 'Token has been revoked'
            });
        }

        // Attach user info to request
        req.user = {
            userId: decoded.userId,
            username: decoded.username,
            role: decoded.role,
            competitionId: decoded.competitionId,
            tokenId: decoded.tokenId
        };

        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            error: error.message || 'Invalid refresh token'
        });
    }
}

/**
 * Require specific role(s)
 * @param {...string} roles - Allowed roles
 */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions'
            });
        }

        next();
    };
}

/**
 * Optional authentication - doesn't fail if no token
 */
async function optionalAuth(req, res, next) {
    try {
        const token = extractTokenFromHeader(req.headers.authorization);

        if (token) {
            const decoded = verifyToken(token);
            const isRevoked = await db.isTokenRevoked(decoded.tokenId);

            if (!isRevoked) {
                req.user = {
                    userId: decoded.userId,
                    username: decoded.username,
                    role: decoded.role,
                    tokenId: decoded.tokenId
                };
            }
        }

        next();
    } catch (error) {
        // Continue without auth
        next();
    }
}

module.exports = {
    authenticateToken,
    authenticateRefreshToken,
    requireRole,
    optionalAuth
};
