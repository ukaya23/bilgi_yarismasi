/**
 * JWT Utilities Tests
 */

// Set env before requiring module
process.env.JWT_SECRET = 'test-secret-key-for-unit-tests-only';
process.env.JWT_ACCESS_EXPIRY = '1m';
process.env.JWT_REFRESH_EXPIRY = '7d';

const {
    generateTokenPair,
    verifyToken,
    extractTokenFromHeader,
    decodeToken
} = require('../src/auth/jwtUtils');

describe('jwtUtils', () => {
    const testUser = {
        id: 1,
        username: 'admin',
        role: 'admin'
    };

    describe('generateTokenPair', () => {
        it('should return accessToken, refreshToken, and tokenId', () => {
            const tokens = generateTokenPair(testUser);

            expect(tokens).toHaveProperty('accessToken');
            expect(tokens).toHaveProperty('refreshToken');
            expect(tokens).toHaveProperty('tokenId');
            expect(typeof tokens.accessToken).toBe('string');
            expect(typeof tokens.refreshToken).toBe('string');
            expect(typeof tokens.tokenId).toBe('string');
        });

        it('should generate unique tokenIds', () => {
            const tokens1 = generateTokenPair(testUser);
            const tokens2 = generateTokenPair(testUser);

            expect(tokens1.tokenId).not.toBe(tokens2.tokenId);
        });

        it('should include user data in token payload', () => {
            const tokens = generateTokenPair(testUser);
            const decoded = verifyToken(tokens.accessToken);

            expect(decoded.userId).toBe(testUser.id);
            expect(decoded.username).toBe(testUser.username);
            expect(decoded.role).toBe(testUser.role);
            expect(decoded.type).toBe('access');
        });

        it('should include competitionId when provided', () => {
            const playerUser = { id: 5, username: 'player1', role: 'player', competitionId: 3 };
            const tokens = generateTokenPair(playerUser);
            const decoded = verifyToken(tokens.accessToken);

            expect(decoded.competitionId).toBe(3);
        });

        it('should set competitionId to null when not provided', () => {
            const tokens = generateTokenPair(testUser);
            const decoded = verifyToken(tokens.accessToken);

            expect(decoded.competitionId).toBeNull();
        });

        it('should generate refresh token with type refresh', () => {
            const tokens = generateTokenPair(testUser);
            const decoded = verifyToken(tokens.refreshToken);

            expect(decoded.type).toBe('refresh');
            expect(decoded.userId).toBe(testUser.id);
        });
    });

    describe('verifyToken', () => {
        it('should verify a valid token', () => {
            const tokens = generateTokenPair(testUser);
            const decoded = verifyToken(tokens.accessToken);

            expect(decoded.userId).toBe(testUser.id);
            expect(decoded.role).toBe('admin');
        });

        it('should throw on invalid token', () => {
            expect(() => verifyToken('invalid-token')).toThrow('Invalid token');
        });

        it('should throw on tampered token', () => {
            const tokens = generateTokenPair(testUser);
            const tampered = tokens.accessToken.slice(0, -5) + 'xxxxx';

            expect(() => verifyToken(tampered)).toThrow('Invalid token');
        });

        it('should throw on token signed with different secret', () => {
            const jwt = require('jsonwebtoken');
            const fakeToken = jwt.sign(
                { userId: 1, role: 'admin' },
                'wrong-secret',
                { issuer: 'quiz-game', audience: 'quiz-client' }
            );

            expect(() => verifyToken(fakeToken)).toThrow('Invalid token');
        });
    });

    describe('extractTokenFromHeader', () => {
        it('should extract token from Bearer header', () => {
            const token = extractTokenFromHeader('Bearer abc123');
            expect(token).toBe('abc123');
        });

        it('should return null for missing header', () => {
            expect(extractTokenFromHeader(null)).toBeNull();
            expect(extractTokenFromHeader(undefined)).toBeNull();
        });

        it('should return null for non-Bearer header', () => {
            expect(extractTokenFromHeader('Basic abc123')).toBeNull();
        });

        it('should return null for malformed header', () => {
            expect(extractTokenFromHeader('Bearer')).toBeNull();
            expect(extractTokenFromHeader('Bearer a b c')).toBeNull();
        });
    });

    describe('decodeToken', () => {
        it('should decode token without verification', () => {
            const tokens = generateTokenPair(testUser);
            const decoded = decodeToken(tokens.accessToken);

            expect(decoded.userId).toBe(testUser.id);
            expect(decoded.role).toBe('admin');
        });

        it('should return null for garbage input', () => {
            expect(decodeToken('not-a-token')).toBeNull();
        });
    });
});
