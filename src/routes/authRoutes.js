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

// Player and Jury login are handled via access codes (/api/auth/validate-code)

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
 * POST /api/auth/change-password
 * Change admin password
 */
router.post('/change-password', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Only admins can change password' });
        }

        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, error: 'Current and new password are required' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ success: false, error: 'New password must be at least 8 characters' });
        }

        if (currentPassword === newPassword) {
            return res.status(400).json({ success: false, error: 'New password must be different from current password' });
        }

        // Verify current password
        const admin = await db.getAdminByUsername(req.user.username);
        if (!admin) {
            return res.status(404).json({ success: false, error: 'Admin user not found' });
        }

        const isValid = await bcrypt.compare(currentPassword, admin.password_hash);
        if (!isValid) {
            return res.status(401).json({ success: false, error: 'Current password is incorrect' });
        }

        // Update password
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await db.updateAdminPassword(admin.id, hashedPassword);

        // Revoke all existing tokens to force re-login
        await db.revokeAllUserTokens(admin.id, 'password_change');

        // Generate new tokens
        const tokens = generateTokenPair({
            id: admin.id,
            username: admin.username,
            role: 'admin'
        });

        res.json({
            success: true,
            message: 'Password changed successfully',
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken
        });
    } catch (error) {
        console.error('[AUTH] Change password error:', error);
        res.status(500).json({ success: false, error: 'Password change failed' });
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
