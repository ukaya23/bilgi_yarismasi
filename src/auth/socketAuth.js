/**
 * Socket.io JWT Authentication Middleware
 */

const { verifyToken } = require('./jwtUtils');
const db = require('../../database/postgres');

/**
 * Socket.io middleware for JWT authentication
 * Extracts token from auth object or handshake query
 */
async function socketAuthMiddleware(socket, next) {
    try {
        // Try to get token from auth header or query string
        let token = null;

        if (socket.handshake.auth && socket.handshake.auth.token) {
            token = socket.handshake.auth.token;
        } else if (socket.handshake.query && socket.handshake.query.token) {
            token = socket.handshake.query.token;
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

        // Verify token
        const decoded = verifyToken(token);

        // Check if token is revoked
        const isRevoked = await db.isTokenRevoked(decoded.tokenId);
        if (isRevoked) {
            return next(new Error('Token has been revoked'));
        }

        // Attach user info to socket
        socket.userId = decoded.userId;
        socket.username = decoded.username;
        socket.role = decoded.role;
        socket.competitionId = decoded.competitionId;
        socket.tokenId = decoded.tokenId;

        // Also store in data object for easy access
        socket.data.user = {
            userId: decoded.userId,
            username: decoded.username,
            role: decoded.role,
            competitionId: decoded.competitionId,
            tokenId: decoded.tokenId
        };

        next();
    } catch (error) {
        console.error('[SOCKET AUTH] Authentication failed:', error.message);
        next(new Error('Invalid or expired token'));
    }
}

/**
 * Require specific role for socket connection
 * @param {...string} roles - Allowed roles
 */
function requireSocketRole(...roles) {
    return (socket, next) => {
        if (!socket.role || !roles.includes(socket.role)) {
            return next(new Error('Insufficient permissions'));
        }
        next();
    };
}

/**
 * Optional socket authentication - doesn't fail if no token
 */
async function optionalSocketAuth(socket, next) {
    try {
        let token = null;

        if (socket.handshake.auth && socket.handshake.auth.token) {
            token = socket.handshake.auth.token;
        } else if (socket.handshake.query && socket.handshake.query.token) {
            token = socket.handshake.query.token;
        }

        if (token) {
            const decoded = verifyToken(token);
            const isRevoked = await db.isTokenRevoked(decoded.tokenId);

            if (!isRevoked) {
                socket.userId = decoded.userId;
                socket.username = decoded.username;
                socket.role = decoded.role;
                socket.competitionId = decoded.competitionId;
                socket.tokenId = decoded.tokenId;

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
        // Continue without auth
        next();
    }
}

module.exports = {
    socketAuthMiddleware,
    requireSocketRole,
    optionalSocketAuth
};
