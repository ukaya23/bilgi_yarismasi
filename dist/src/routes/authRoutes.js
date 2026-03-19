"use strict";
/**
 * Authentication Routes
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const uuid_1 = require("uuid");
const postgres_1 = __importDefault(require("../../database/postgres"));
const jwtUtils_1 = require("../auth/jwtUtils");
const authMiddleware_1 = require("../auth/authMiddleware");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const logger_1 = __importDefault(require("../utils/logger"));
const router = express_1.default.Router();
router.post('/login/admin', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            res.status(400).json({ success: false, error: 'Username and password are required' });
            return;
        }
        const admin = await postgres_1.default.getAdminByUsername(username);
        if (!admin) {
            res.status(401).json({ success: false, error: 'Invalid credentials' });
            return;
        }
        const isValid = await bcryptjs_1.default.compare(password, admin.password_hash);
        if (!isValid) {
            res.status(401).json({ success: false, error: 'Invalid credentials' });
            return;
        }
        const tokens = (0, jwtUtils_1.generateTokenPair)({ id: admin.id, username: admin.username, role: 'admin' });
        res.json({
            success: true,
            user: { id: admin.id, username: admin.username, role: 'admin' },
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Admin login hatasi');
        res.status(500).json({ success: false, error: 'Login failed' });
    }
});
router.post('/validate-code', async (req, res) => {
    try {
        const { code } = req.body;
        if (!code || code.length < 6) {
            res.status(400).json({ error: 'Geçersiz kod formatı' });
            return;
        }
        const result = await postgres_1.default.validateAccessCode(code);
        if (!result.valid) {
            res.status(401).json({ error: result.message });
            return;
        }
        const sessionToken = (0, uuid_1.v4)();
        await postgres_1.default.markCodeAsUsed(result.accessCode.id, sessionToken);
        const jwtRole = result.accessCode.role === 'CONTESTANT' ? 'player' : 'jury';
        const tokens = (0, jwtUtils_1.generateTokenPair)({
            id: result.accessCode.slot_number,
            username: result.accessCode.name,
            role: jwtRole,
            competitionId: result.accessCode.competition_id
        });
        res.json({
            success: true,
            sessionToken,
            role: result.accessCode.role,
            name: result.accessCode.name,
            slotNumber: result.accessCode.slot_number,
            competitionName: result.accessCode.competition_name,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Kod dogrulama hatasi');
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});
router.post('/validate-session', async (req, res) => {
    try {
        const { sessionToken } = req.body;
        if (!sessionToken) {
            res.json({ valid: false });
            return;
        }
        const accessCode = await postgres_1.default.validateSessionToken(sessionToken);
        if (!accessCode) {
            res.json({ valid: false });
            return;
        }
        const jwtRole = accessCode.role === 'CONTESTANT' ? 'player' : 'jury';
        const tokens = (0, jwtUtils_1.generateTokenPair)({
            id: accessCode.slot_number,
            username: accessCode.name,
            role: jwtRole,
            competitionId: accessCode.competition_id
        });
        res.json({
            valid: true,
            role: accessCode.role,
            name: accessCode.name,
            slotNumber: accessCode.slot_number,
            competitionName: accessCode.competition_name,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Session dogrulama hatasi');
        res.json({ valid: false });
    }
});
router.post('/refresh', authMiddleware_1.authenticateRefreshToken, async (req, res) => {
    try {
        const tokens = (0, jwtUtils_1.generateTokenPair)({
            id: req.user.userId,
            username: req.user.username,
            role: req.user.role
        });
        res.json({ success: true, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Token refresh hatasi');
        res.status(500).json({ success: false, error: 'Token refresh failed' });
    }
});
router.post('/logout', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        await postgres_1.default.revokeToken(req.user.tokenId, req.user.userId, 'user_logout');
        res.json({ success: true, message: 'Logged out successfully' });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Logout hatasi');
        res.status(500).json({ success: false, error: 'Logout failed' });
    }
});
router.post('/logout/all', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        await postgres_1.default.revokeAllUserTokens(req.user.userId, 'logout_all_devices');
        res.json({ success: true, message: 'Logged out from all devices' });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Logout all hatasi');
        res.status(500).json({ success: false, error: 'Logout failed' });
    }
});
router.post('/change-password', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            res.status(403).json({ success: false, error: 'Only admins can change password' });
            return;
        }
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            res.status(400).json({ success: false, error: 'Current and new password are required' });
            return;
        }
        if (newPassword.length < 8) {
            res.status(400).json({ success: false, error: 'New password must be at least 8 characters' });
            return;
        }
        if (currentPassword === newPassword) {
            res.status(400).json({ success: false, error: 'New password must be different from current password' });
            return;
        }
        const admin = await postgres_1.default.getAdminByUsername(req.user.username);
        if (!admin) {
            res.status(404).json({ success: false, error: 'Admin user not found' });
            return;
        }
        const isValid = await bcryptjs_1.default.compare(currentPassword, admin.password_hash);
        if (!isValid) {
            res.status(401).json({ success: false, error: 'Current password is incorrect' });
            return;
        }
        const hashedPassword = await bcryptjs_1.default.hash(newPassword, 12);
        await postgres_1.default.updateAdminPassword(admin.id, hashedPassword);
        await postgres_1.default.revokeAllUserTokens(admin.id, 'password_change');
        const tokens = (0, jwtUtils_1.generateTokenPair)({ id: admin.id, username: admin.username, role: 'admin' });
        res.json({
            success: true,
            message: 'Password changed successfully',
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Sifre degistirme hatasi');
        res.status(500).json({ success: false, error: 'Password change failed' });
    }
});
router.get('/verify', authMiddleware_1.authenticateToken, (req, res) => {
    res.json({ success: true, user: req.user });
});
exports.default = router;
//# sourceMappingURL=authRoutes.js.map