"use strict";
/**
 * Socket.io JWT Authentication Middleware
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.socketAuthMiddleware = socketAuthMiddleware;
exports.requireSocketRole = requireSocketRole;
exports.optionalSocketAuth = optionalSocketAuth;
const jwtUtils_1 = require("./jwtUtils");
const postgres_1 = __importDefault(require("../../database/postgres"));
const logger_1 = __importDefault(require("../utils/logger"));
async function socketAuthMiddleware(socket, next) {
    try {
        let token = null;
        if (socket.handshake.auth && socket.handshake.auth.token) {
            token = socket.handshake.auth.token;
        }
        else if (socket.handshake.query && socket.handshake.query.token) {
            token = socket.handshake.query.token;
        }
        else if (socket.handshake.headers.authorization) {
            const authHeader = socket.handshake.headers.authorization;
            const parts = authHeader.split(' ');
            if (parts.length === 2 && parts[0] === 'Bearer') {
                token = parts[1];
            }
        }
        if (!token) {
            return next(new Error('Authentication token required'));
        }
        const decoded = (0, jwtUtils_1.verifyToken)(token);
        const isRevoked = await postgres_1.default.isTokenRevokedOrUserBanned(decoded.tokenId, decoded.userId, decoded.iat);
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
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Socket auth failed');
        next(new Error('Invalid or expired token'));
    }
}
function requireSocketRole(...roles) {
    return (socket, next) => {
        if (!socket.role || !roles.includes(socket.role)) {
            return next(new Error('Insufficient permissions'));
        }
        next();
    };
}
async function optionalSocketAuth(socket, next) {
    try {
        let token = null;
        if (socket.handshake.auth && socket.handshake.auth.token) {
            token = socket.handshake.auth.token;
        }
        else if (socket.handshake.query && socket.handshake.query.token) {
            token = socket.handshake.query.token;
        }
        if (token) {
            const decoded = (0, jwtUtils_1.verifyToken)(token);
            const isRevoked = await postgres_1.default.isTokenRevokedOrUserBanned(decoded.tokenId, decoded.userId, decoded.iat);
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
    }
    catch (error) {
        next();
    }
}
//# sourceMappingURL=socketAuth.js.map