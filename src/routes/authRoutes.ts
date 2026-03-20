/**
 * Authentication Routes
 */

import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../../database/postgres';
import { generateTokenPair } from '../auth/jwtUtils';
import { authenticateToken, authenticateRefreshToken } from '../auth/authMiddleware';
import bcrypt from 'bcryptjs';
import log from '../utils/logger';
import type { AuthenticatedRequest, UserRole } from '../types';

const router = express.Router();

router.post('/login/admin', async (req: Request, res: Response) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            res.status(400).json({ success: false, error: 'Username and password are required' });
            return;
        }

        const admin = await db.getAdminByUsername(username);
        if (!admin) {
            res.status(401).json({ success: false, error: 'Invalid credentials' });
            return;
        }

        const isValid = await bcrypt.compare(password, admin.password_hash);
        if (!isValid) {
            res.status(401).json({ success: false, error: 'Invalid credentials' });
            return;
        }

        const tokens = generateTokenPair({ id: admin.id, username: admin.username, role: 'admin' as UserRole });

        db.logEvent({
            eventType: 'ADMIN_LOGIN',
            actorType: 'admin',
            actorId: admin.id,
            actorName: admin.username,
        });

        res.json({
            success: true,
            user: { id: admin.id, username: admin.username, role: 'admin' },
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken
        });
    } catch (error) {
        log.error({ err: error }, 'Admin login hatasi');
        res.status(500).json({ success: false, error: 'Login failed' });
    }
});

router.post('/validate-code', async (req: Request, res: Response) => {
    try {
        const { code } = req.body;

        if (!code || code.length < 6) {
            res.status(400).json({ error: 'Geçersiz kod formatı' });
            return;
        }

        const result = await db.validateAccessCode(code);

        if (!result.valid) {
            res.status(401).json({ error: result.message });
            return;
        }

        const sessionToken = uuidv4();
        await db.markCodeAsUsed(result.accessCode!.id, sessionToken);

        const jwtRole: UserRole = result.accessCode!.role === 'CONTESTANT' ? 'player' : 'jury';
        const tokens = generateTokenPair({
            id: result.accessCode!.slot_number,
            username: result.accessCode!.name,
            role: jwtRole,
            competitionId: result.accessCode!.competition_id
        });

        db.logEvent({
            eventType: 'ACCESS_CODE_LOGIN',
            actorType: jwtRole === 'player' ? 'player' : 'jury',
            actorName: result.accessCode!.name,
            competitionId: result.accessCode!.competition_id,
            payload: { role: result.accessCode!.role, slotNumber: result.accessCode!.slot_number }
        });

        res.json({
            success: true,
            sessionToken,
            role: result.accessCode!.role,
            name: result.accessCode!.name,
            slotNumber: result.accessCode!.slot_number,
            competitionName: result.accessCode!.competition_name,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken
        });
    } catch (error) {
        log.error({ err: error }, 'Kod dogrulama hatasi');
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.post('/validate-session', async (req: Request, res: Response) => {
    try {
        const { sessionToken } = req.body;

        if (!sessionToken) {
            res.json({ valid: false });
            return;
        }

        const accessCode = await db.validateSessionToken(sessionToken);

        if (!accessCode) {
            res.json({ valid: false });
            return;
        }

        const jwtRole: UserRole = accessCode.role === 'CONTESTANT' ? 'player' : 'jury';
        const tokens = generateTokenPair({
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
    } catch (error) {
        log.error({ err: error }, 'Session dogrulama hatasi');
        res.json({ valid: false });
    }
});

router.post('/refresh', authenticateRefreshToken as any, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const tokens = generateTokenPair({
            id: req.user!.userId,
            username: req.user!.username,
            role: req.user!.role
        });

        res.json({ success: true, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
    } catch (error) {
        log.error({ err: error }, 'Token refresh hatasi');
        res.status(500).json({ success: false, error: 'Token refresh failed' });
    }
});

router.post('/logout', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
    try {
        await db.revokeToken(req.user!.tokenId, req.user!.userId, 'user_logout');
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        log.error({ err: error }, 'Logout hatasi');
        res.status(500).json({ success: false, error: 'Logout failed' });
    }
});

router.post('/logout/all', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
    try {
        await db.revokeAllUserTokens(req.user!.userId, 'logout_all_devices');
        res.json({ success: true, message: 'Logged out from all devices' });
    } catch (error) {
        log.error({ err: error }, 'Logout all hatasi');
        res.status(500).json({ success: false, error: 'Logout failed' });
    }
});

router.post('/change-password', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (req.user!.role !== 'admin') {
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

        const admin = await db.getAdminByUsername(req.user!.username);
        if (!admin) {
            res.status(404).json({ success: false, error: 'Admin user not found' });
            return;
        }

        const isValid = await bcrypt.compare(currentPassword, admin.password_hash);
        if (!isValid) {
            res.status(401).json({ success: false, error: 'Current password is incorrect' });
            return;
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await db.updateAdminPassword(admin.id, hashedPassword);
        await db.revokeAllUserTokens(admin.id, 'password_change');

        const tokens = generateTokenPair({ id: admin.id, username: admin.username, role: 'admin' as UserRole });

        res.json({
            success: true,
            message: 'Password changed successfully',
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken
        });
    } catch (error) {
        log.error({ err: error }, 'Sifre degistirme hatasi');
        res.status(500).json({ success: false, error: 'Password change failed' });
    }
});

router.get('/verify', authenticateToken as any, (req: AuthenticatedRequest, res: Response) => {
    res.json({ success: true, user: req.user });
});

export default router;
