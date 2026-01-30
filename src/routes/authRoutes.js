/**
 * Authentication Routes
 * Handles login, logout, token refresh
 */

const express = require('express');
const router = express.Router();
const db = require('../../database/postgres');
const { generateTokenPair } = require('../auth/jwtUtils');
const { authenticateToken, authenticateRefreshToken } = require('../auth/authMiddleware');
const bcrypt = require('bcryptjs');

/**
 * POST /api/auth/login/admin
 * Admin login with username/password
 */
router.post('/login/admin', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: 'Username and password are required'
            });
        }

        // Get admin user
        const admin = await db.getAdminByUsername(username);
        if (!admin) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Verify password
        const isValid = await bcrypt.compare(password, admin.password_hash);
        if (!isValid) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Generate tokens
        const tokens = generateTokenPair({
            id: admin.id,
            username: admin.username,
            role: 'admin'
        });

        res.json({
            success: true,
            user: {
                id: admin.id,
                username: admin.username,
                role: 'admin'
            },
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken
        });
    } catch (error) {
        console.error('[AUTH] Admin login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed'
        });
    }
});

/**
 * POST /api/auth/login/player
 * Player login with name, table number, and competition
 */
router.post('/login/player', async (req, res) => {
    try {
        const { name, tableNo, competitionId } = req.body;

        if (!name || !tableNo) {
            return res.status(400).json({
                success: false,
                error: 'Name and table number are required'
            });
        }

        // Default to competition 1 if not specified
        const compId = competitionId || 1;

        // Create or get contestant for this competition
        const contestantId = await db.upsertContestant(name, parseInt(tableNo), compId);
        const contestant = await db.getContestantById(contestantId);

        // Generate tokens with competition context
        const tokens = generateTokenPair({
            id: contestant.id,
            username: contestant.name,
            role: 'player',
            tableNo: contestant.table_no,
            competitionId: compId
        });

        res.json({
            success: true,
            user: {
                id: contestant.id,
                name: contestant.name,
                tableNo: contestant.table_no,
                competitionId: compId,
                role: 'player'
            },
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken
        });
    } catch (error) {
        console.error('[AUTH] Player login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed'
        });
    }
});

/**
 * POST /api/auth/login/jury
 * Jury login (simple auth for now)
 */
router.post('/login/jury', async (req, res) => {
    try {
        const { code } = req.body;

        // Simple jury code check (you can enhance this later)
        if (code !== 'JURY2024') {
            return res.status(401).json({
                success: false,
                error: 'Invalid jury code'
            });
        }

        // Generate tokens
        const tokens = generateTokenPair({
            id: 0, // Special ID for jury
            username: 'jury',
            role: 'jury'
        });

        res.json({
            success: true,
            user: {
                id: 0,
                username: 'jury',
                role: 'jury'
            },
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken
        });
    } catch (error) {
        console.error('[AUTH] Jury login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed'
        });
    }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', authenticateRefreshToken, async (req, res) => {
    try {
        // Generate new access token (keep same refresh token)
        const tokens = generateTokenPair({
            id: req.user.userId,
            username: req.user.username,
            role: req.user.role
        });

        res.json({
            success: true,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken
        });
    } catch (error) {
        console.error('[AUTH] Token refresh error:', error);
        res.status(500).json({
            success: false,
            error: 'Token refresh failed'
        });
    }
});

/**
 * POST /api/auth/logout
 * Logout and revoke tokens
 */
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        // Revoke the current token
        await db.revokeToken(req.user.tokenId, req.user.userId, 'user_logout');

        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        console.error('[AUTH] Logout error:', error);
        res.status(500).json({
            success: false,
            error: 'Logout failed'
        });
    }
});

/**
 * POST /api/auth/logout/all
 * Logout from all devices (revoke all tokens)
 */
router.post('/logout/all', authenticateToken, async (req, res) => {
    try {
        // Revoke all user tokens
        await db.revokeAllUserTokens(req.user.userId, 'logout_all_devices');

        res.json({
            success: true,
            message: 'Logged out from all devices'
        });
    } catch (error) {
        console.error('[AUTH] Logout all error:', error);
        res.status(500).json({
            success: false,
            error: 'Logout failed'
        });
    }
});

/**
 * GET /api/auth/verify
 * Verify current token
 */
router.get('/verify', authenticateToken, (req, res) => {
    res.json({
        success: true,
        user: req.user
    });
});

module.exports = router;
