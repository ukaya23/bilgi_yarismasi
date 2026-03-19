/**
 * Auth Middleware Tests
 */

process.env.JWT_SECRET = 'test-secret-key-for-unit-tests-only';
process.env.JWT_ACCESS_EXPIRY = '1m';
process.env.JWT_REFRESH_EXPIRY = '7d';

// Mock database
jest.mock('../database/postgres', () => ({
    isTokenRevoked: jest.fn()
}));

const db = require('../database/postgres');
const { generateTokenPair } = require('../src/auth/jwtUtils');
const { authenticateToken, authenticateRefreshToken, requireRole } = require('../src/auth/authMiddleware');

// Helper: create mock req/res/next
function createMocks(headers = {}) {
    const req = { headers };
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
    };
    const next = jest.fn();
    return { req, res, next };
}

describe('authenticateToken', () => {
    const testUser = { id: 1, username: 'admin', role: 'admin' };

    beforeEach(() => {
        db.isTokenRevoked.mockReset();
        db.isTokenRevoked.mockResolvedValue(false);
    });

    it('should pass with valid token and attach user', async () => {
        const tokens = generateTokenPair(testUser);
        const { req, res, next } = createMocks({
            authorization: `Bearer ${tokens.accessToken}`
        });

        await authenticateToken(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.user).toBeDefined();
        expect(req.user.userId).toBe(testUser.id);
        expect(req.user.role).toBe('admin');
        expect(req.user.tokenId).toBe(tokens.tokenId);
    });

    it('should reject when no token provided', async () => {
        const { req, res, next } = createMocks({});

        await authenticateToken(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'No token provided' })
        );
    });

    it('should reject invalid token', async () => {
        const { req, res, next } = createMocks({
            authorization: 'Bearer invalid-token'
        });

        await authenticateToken(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should reject revoked token', async () => {
        db.isTokenRevoked.mockResolvedValue(true);

        const tokens = generateTokenPair(testUser);
        const { req, res, next } = createMocks({
            authorization: `Bearer ${tokens.accessToken}`
        });

        await authenticateToken(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'Token has been revoked' })
        );
    });
});

describe('authenticateRefreshToken', () => {
    const testUser = { id: 1, username: 'admin', role: 'admin' };

    beforeEach(() => {
        db.isTokenRevoked.mockReset();
        db.isTokenRevoked.mockResolvedValue(false);
    });

    it('should pass with valid refresh token', async () => {
        const tokens = generateTokenPair(testUser);
        const { req, res, next } = createMocks({
            authorization: `Bearer ${tokens.refreshToken}`
        });

        await authenticateRefreshToken(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.user.userId).toBe(testUser.id);
    });

    it('should reject access token used as refresh token', async () => {
        const tokens = generateTokenPair(testUser);
        const { req, res, next } = createMocks({
            authorization: `Bearer ${tokens.accessToken}`
        });

        await authenticateRefreshToken(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'Invalid token type' })
        );
    });
});

describe('requireRole', () => {
    it('should pass when user has required role', () => {
        const middleware = requireRole('admin');
        const { req, res, next } = createMocks();
        req.user = { userId: 1, role: 'admin' };

        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
    });

    it('should pass when user has one of multiple allowed roles', () => {
        const middleware = requireRole('admin', 'jury');
        const { req, res, next } = createMocks();
        req.user = { userId: 1, role: 'jury' };

        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
    });

    it('should reject when user lacks required role', () => {
        const middleware = requireRole('admin');
        const { req, res, next } = createMocks();
        req.user = { userId: 1, role: 'player' };

        middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should reject when no user on request', () => {
        const middleware = requireRole('admin');
        const { req, res, next } = createMocks();

        middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
    });
});
