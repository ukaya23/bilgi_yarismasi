import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import log from '../../src/utils/logger';
import type { AdminUser } from '../../src/types';

export class AuthRepository {
    constructor(private pool: Pool) {}

    // ==================== ADMİN İŞLEMLERİ ====================

    async ensureDefaultAdmin(): Promise<void> {
        const existing = await this.pool.query(
            'SELECT id FROM admin_users WHERE username = $1',
            ['admin']
        );

        if (existing.rows.length === 0) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await this.pool.query(
                'INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)',
                ['admin', hashedPassword]
            );
            log.warn('Default admin user created (username: admin) - Change the default password immediately!');
        }
    }

    async getAdminByUsername(username: string): Promise<AdminUser | null> {
        const result = await this.pool.query(
            'SELECT id, username, password_hash FROM admin_users WHERE username = $1',
            [username]
        );
        return result.rows[0] || null;
    }

    async updateAdminPassword(adminId: number, hashedPassword: string): Promise<void> {
        await this.pool.query(
            'UPDATE admin_users SET password_hash = $1 WHERE id = $2',
            [hashedPassword, adminId]
        );
    }

    async authenticateAdmin(username: string, password: string): Promise<{ id: number; username: string } | null> {
        const result = await this.pool.query(
            'SELECT id, username, password_hash FROM admin_users WHERE username = $1',
            [username]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const admin = result.rows[0];
        const isValid = await bcrypt.compare(password, admin.password_hash);

        if (!isValid) {
            return null;
        }

        return { id: admin.id, username: admin.username };
    }

    // ==================== JWT TOKEN İŞLEMLERİ ====================

    async revokeToken(tokenId: string, userId: number, reason: string = 'manual_revoke'): Promise<any> {
        const result = await this.pool.query(`
            INSERT INTO revoked_tokens (token_id, user_id, reason)
            VALUES ($1, $2, $3)
            ON CONFLICT (token_id) DO NOTHING
            RETURNING *
        `, [tokenId, userId, reason]);
        return result.rows[0];
    }

    async isTokenRevoked(tokenId: string): Promise<boolean> {
        const result = await this.pool.query(
            'SELECT EXISTS(SELECT 1 FROM revoked_tokens WHERE token_id = $1) as revoked',
            [tokenId]
        );
        return result.rows[0].revoked;
    }

    async revokeAllUserTokens(userId: number, reason: string = 'logout_all'): Promise<number | null> {
        const result = await this.pool.query(`
            INSERT INTO revoked_tokens (token_id, user_id, reason)
            VALUES ($1, $2, $3)
            RETURNING *
        `, [`user_revoke_all_${userId}_${Date.now()}`, userId, reason]);
        return result.rowCount;
    }

    async isTokenRevokedOrUserBanned(tokenId: string, userId: number, tokenIssuedAt: number): Promise<boolean> {
        const tokenCheck = await this.pool.query(
            'SELECT EXISTS(SELECT 1 FROM revoked_tokens WHERE token_id = $1) as revoked',
            [tokenId]
        );
        if (tokenCheck.rows[0].revoked) return true;

        if (userId && tokenIssuedAt) {
            const userCheck = await this.pool.query(`
                SELECT EXISTS(
                    SELECT 1 FROM revoked_tokens
                    WHERE user_id = $1
                    AND token_id LIKE 'user_revoke_all_%'
                    AND revoked_at > $2
                ) as revoked
            `, [userId, new Date(tokenIssuedAt * 1000)]);
            if (userCheck.rows[0].revoked) return true;
        }

        return false;
    }

    async cleanupRevokedTokens(): Promise<number | null> {
        const result = await this.pool.query(`
            DELETE FROM revoked_tokens
            WHERE revoked_at < NOW() - INTERVAL '7 days'
        `);
        return result.rowCount;
    }
}
