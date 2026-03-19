/**
 * PostgreSQL Veritabanı Modülü
 */

import 'dotenv/config';
import { Pool, PoolClient } from 'pg';
import bcrypt from 'bcryptjs';
import log from '../src/utils/logger';
import type {
    Question, Contestant, Answer, Competition, AccessCode,
    AdminUser, Quote, Setting, ValidationResult,
    GamePhase, ContestantStatus, CompetitionStatus
} from '../src/types';

class PostgresDatabase {
    pool: Pool;

    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        this.pool.on('error', (err: Error) => {
            log.error({ err }, 'Unexpected error on idle DB client');
        });
    }

    async initialize(): Promise<void> {
        try {
            const client = await this.pool.connect();
            try {
                const result = await client.query('SELECT NOW()');
                log.info({ connectedAt: result.rows[0].now }, 'PostgreSQL connected');
            } finally {
                client.release();
            }
        } catch (error) {
            log.fatal({ err: error }, 'Database connection error');
            throw error;
        }
    }

    async close(): Promise<void> {
        await this.pool.end();
    }

    // ==================== SORU İŞLEMLERİ ====================

    async getAllQuestions(): Promise<Question[]> {
        const result = await this.pool.query(`
            SELECT id, content, media_url, type, options, correct_keys, points, duration, category
            FROM questions
            WHERE is_active = true
            ORDER BY id
        `);
        return result.rows;
    }

    async getQuestionById(id: number): Promise<Question | null> {
        const result = await this.pool.query(`
            SELECT id, content, media_url, type, options, correct_keys, points, duration, category
            FROM questions
            WHERE id = $1
        `, [id]);
        return result.rows[0] || null;
    }

    async addQuestion(question: Partial<Question>): Promise<number> {
        const result = await this.pool.query(`
            INSERT INTO questions (content, media_url, type, options, correct_keys, points, duration, category)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id
        `, [
            question.content,
            question.media_url || null,
            question.type,
            question.options ? JSON.stringify(question.options) : null,
            question.correct_keys ? JSON.stringify(question.correct_keys) : null,
            question.points || 10,
            question.duration || 30,
            question.category || null
        ]);
        return result.rows[0].id;
    }

    async updateQuestion(id: number, question: Partial<Question>): Promise<number | null> {
        const result = await this.pool.query(`
            UPDATE questions
            SET content = $1, media_url = $2, type = $3, options = $4, correct_keys = $5,
                points = $6, duration = $7, category = $8
            WHERE id = $9
            RETURNING id
        `, [
            question.content,
            question.media_url || null,
            question.type,
            question.options ? JSON.stringify(question.options) : null,
            question.correct_keys ? JSON.stringify(question.correct_keys) : null,
            question.points || 10,
            question.duration || 30,
            question.category || null,
            id
        ]);
        return result.rowCount;
    }

    async deleteQuestion(id: number): Promise<number | null> {
        const result = await this.pool.query(
            'UPDATE questions SET is_active = false WHERE id = $1',
            [id]
        );
        return result.rowCount;
    }

    // ==================== YARIŞMACI İŞLEMLERİ ====================

    async getAllContestants(competitionId: number | null = null): Promise<Contestant[]> {
        if (competitionId) {
            return (await this.pool.query(`
                SELECT id, name, table_no, total_score, status, socket_id
                FROM contestants
                WHERE competition_id = $1
                ORDER BY table_no
            `, [competitionId])).rows;
        }
        const result = await this.pool.query(`
            SELECT id, name, table_no, total_score, status, socket_id
            FROM contestants
            ORDER BY table_no
        `);
        return result.rows;
    }

    async getContestantById(id: number): Promise<Contestant | null> {
        const result = await this.pool.query(
            'SELECT * FROM contestants WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    }

    async upsertContestant(name: string, tableNo: number, competitionId: number = 1): Promise<number> {
        const existing = await this.pool.query(`
            SELECT id FROM contestants
            WHERE table_no = $1 AND competition_id = $2
        `, [tableNo, competitionId]);

        if (existing.rows.length > 0) {
            const result = await this.pool.query(`
                UPDATE contestants
                SET name = $1, status = 'ONLINE'
                WHERE table_no = $2 AND competition_id = $3
                RETURNING id
            `, [name, tableNo, competitionId]);
            return result.rows[0].id;
        } else {
            const result = await this.pool.query(`
                INSERT INTO contestants (name, table_no, competition_id, status)
                VALUES ($1, $2, $3, 'ONLINE')
                RETURNING id
            `, [name, tableNo, competitionId]);
            return result.rows[0].id;
        }
    }

    async updateContestantSocket(id: number, socketId: string): Promise<number | null> {
        const result = await this.pool.query(
            `UPDATE contestants SET socket_id = $1, status = 'ONLINE' WHERE id = $2`,
            [socketId, id]
        );
        return result.rowCount;
    }

    async updateContestantStatus(id: number, status: ContestantStatus): Promise<number | null> {
        const result = await this.pool.query(
            'UPDATE contestants SET status = $1 WHERE id = $2',
            [status, id]
        );
        return result.rowCount;
    }

    async updateContestantScore(id: number, pointsToAdd: number): Promise<number | null> {
        const result = await this.pool.query(
            'UPDATE contestants SET total_score = total_score + $1 WHERE id = $2',
            [pointsToAdd, id]
        );
        return result.rowCount;
    }

    async getContestantBySocketId(socketId: string): Promise<Contestant | null> {
        const result = await this.pool.query(
            'SELECT * FROM contestants WHERE socket_id = $1',
            [socketId]
        );
        return result.rows[0] || null;
    }

    async getLeaderboard(competitionId: number | null = null): Promise<Contestant[]> {
        if (competitionId) {
            return (await this.pool.query(`
                SELECT id, name, table_no, total_score
                FROM contestants
                WHERE status != 'DISQUALIFIED' AND competition_id = $1
                ORDER BY total_score DESC, name ASC
            `, [competitionId])).rows;
        }
        const result = await this.pool.query(`
            SELECT id, name, table_no, total_score
            FROM contestants
            WHERE status != 'DISQUALIFIED'
            ORDER BY total_score DESC, name ASC
        `);
        return result.rows;
    }

    async resetAllContestants(competitionId: number | null = null): Promise<void> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            if (competitionId) {
                await client.query(`
                    DELETE FROM answers WHERE contestant_id IN (
                        SELECT id FROM contestants WHERE competition_id = $1
                    )
                `, [competitionId]);
                await client.query('DELETE FROM contestants WHERE competition_id = $1', [competitionId]);
            } else {
                await client.query('DELETE FROM answers');
                await client.query('DELETE FROM contestants');

                try {
                    await client.query('ALTER SEQUENCE answers_id_seq RESTART WITH 1');
                    await client.query('ALTER SEQUENCE contestants_id_seq RESTART WITH 1');
                } catch (seqError: any) {
                    log.debug({ message: seqError.message }, 'Sequence reset atlaniyor');
                }
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async resetAllAccessCodes(competitionId: number): Promise<number | null> {
        const result = await this.pool.query(
            'UPDATE access_codes SET is_used = false, session_token = NULL, used_at = NULL WHERE competition_id = $1',
            [competitionId]
        );
        return result.rowCount;
    }

    // ==================== CEVAP İŞLEMLERİ ====================

    async saveAnswer(questionId: number, contestantId: number, answerText: string, timeRemaining: number): Promise<{ success: boolean; message?: string; id?: number }> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            const existing = await client.query(
                'SELECT id FROM answers WHERE question_id = $1 AND contestant_id = $2',
                [questionId, contestantId]
            );

            if (existing.rows.length > 0) {
                await client.query('ROLLBACK');
                return { success: false, message: 'Bu soru için zaten cevap verilmiş' };
            }

            const result = await client.query(
                `INSERT INTO answers (question_id, contestant_id, answer_text, time_remaining)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [questionId, contestantId, answerText, timeRemaining]
            );

            await client.query('COMMIT');
            return { success: true, id: result.rows[0].id };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async saveAnswersBulk(questionId: number, contestantIds: number[]): Promise<void> {
        if (!contestantIds || contestantIds.length === 0) return;

        const params: (number)[] = [questionId];
        const valueClauses = contestantIds.map((cId, i) => {
            params.push(cId);
            return `($1, $${i + 2}, '', 0)`;
        });

        await this.pool.query(
            `INSERT INTO answers (question_id, contestant_id, answer_text, time_remaining)
             VALUES ${valueClauses.join(', ')}`,
            params
        );
    }

    async getAnswersForQuestion(questionId: number, competitionId: number | null = null): Promise<Answer[]> {
        if (competitionId) {
            return (await this.pool.query(`
                SELECT a.id, a.answer_text, a.is_correct, a.points_awarded, a.time_remaining,
                       c.id as contestant_id, c.name, c.table_no
                FROM answers a
                JOIN contestants c ON a.contestant_id = c.id
                WHERE a.question_id = $1 AND c.competition_id = $2
                ORDER BY a.submit_time ASC
            `, [questionId, competitionId])).rows;
        }
        const result = await this.pool.query(`
            SELECT a.id, a.answer_text, a.is_correct, a.points_awarded, a.time_remaining,
                   c.id as contestant_id, c.name, c.table_no
            FROM answers a
            JOIN contestants c ON a.contestant_id = c.id
            WHERE a.question_id = $1
            ORDER BY a.submit_time ASC
        `, [questionId]);
        return result.rows;
    }

    async getAskedQuestionIds(competitionId: number | null = null): Promise<number[]> {
        if (competitionId) {
            const result = await this.pool.query(`
                SELECT DISTINCT a.question_id
                FROM answers a
                JOIN contestants c ON a.contestant_id = c.id
                WHERE c.competition_id = $1
            `, [competitionId]);
            return result.rows.map((r: any) => r.question_id);
        }
        const result = await this.pool.query(
            'SELECT DISTINCT question_id FROM answers'
        );
        return result.rows.map((r: any) => r.question_id);
    }

    async gradeAnswer(answerId: number, isCorrect: boolean, points: number): Promise<void> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            await client.query(
                'UPDATE answers SET is_correct = $1, points_awarded = $2 WHERE id = $3',
                [isCorrect, points, answerId]
            );

            if (points > 0) {
                const answer = await client.query(
                    'SELECT contestant_id FROM answers WHERE id = $1',
                    [answerId]
                );
                if (answer.rows.length > 0) {
                    await client.query(
                        'UPDATE contestants SET total_score = total_score + $1 WHERE id = $2',
                        [points, answer.rows[0].contestant_id]
                    );
                }
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async gradeAnswersBulk(answerIds: number[], isCorrect: boolean, points: number): Promise<void> {
        if (!answerIds || answerIds.length === 0) return;

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            await client.query(
                'UPDATE answers SET is_correct = $1, points_awarded = $2 WHERE id = ANY($3)',
                [isCorrect, points, answerIds]
            );

            if (points > 0) {
                await client.query(`
                    UPDATE contestants c
                    SET total_score = c.total_score + $1
                    FROM answers a
                    WHERE a.contestant_id = c.id AND a.id = ANY($2)
                `, [points, answerIds]);
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // ==================== ÖZLÜ SÖZ İŞLEMLERİ ====================

    async getRandomQuote(): Promise<Quote | null> {
        const result = await this.pool.query(
            'SELECT * FROM quotes ORDER BY RANDOM() LIMIT 1'
        );
        return result.rows[0] || null;
    }

    async getAllQuotes(): Promise<Quote[]> {
        const result = await this.pool.query('SELECT * FROM quotes ORDER BY id');
        return result.rows;
    }

    // ==================== OYUN OTURUMU İŞLEMLERİ ====================

    async getOrCreateSession(): Promise<any> {
        let result = await this.pool.query(
            'SELECT * FROM game_sessions ORDER BY id DESC LIMIT 1'
        );

        if (result.rows.length === 0) {
            result = await this.pool.query(
                'INSERT INTO game_sessions (state) VALUES ($1) RETURNING *',
                ['IDLE']
            );
        }

        return result.rows[0];
    }

    async updateSessionState(state: GamePhase, questionId: number | null = null): Promise<any> {
        const result = await this.pool.query(`
            UPDATE game_sessions
            SET state = $1, current_question_id = $2, question_start_time = CURRENT_TIMESTAMP
            WHERE id = (SELECT id FROM game_sessions ORDER BY id DESC LIMIT 1)
            RETURNING *
        `, [state, questionId]);
        return result.rows[0];
    }

    // ==================== AYARLAR İŞLEMLERİ ====================

    async getSetting(key: string): Promise<string | null> {
        const result = await this.pool.query(
            'SELECT value FROM settings WHERE key = $1',
            [key]
        );
        return result.rows[0] ? result.rows[0].value : null;
    }

    async getAllSettings(): Promise<Setting[]> {
        const result = await this.pool.query('SELECT * FROM settings ORDER BY key');
        return result.rows;
    }

    async setSetting(key: string, value: string, description: string | null = null): Promise<Setting> {
        const result = await this.pool.query(`
            INSERT INTO settings (key, value, description)
            VALUES ($1, $2, $3)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
            RETURNING *
        `, [key, value, description]);
        return result.rows[0];
    }

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

    // ==================== YARIŞMA İŞLEMLERİ ====================

    async createCompetition(name: string, contestantCount: number, juryCount: number): Promise<number> {
        const result = await this.pool.query(`
            INSERT INTO competitions (name, contestant_count, jury_count, status)
            VALUES ($1, $2, $3, 'ACTIVE')
            RETURNING id
        `, [name, contestantCount, juryCount]);
        return result.rows[0].id;
    }

    async getActiveCompetition(): Promise<Competition | null> {
        const result = await this.pool.query(
            "SELECT * FROM competitions WHERE status = 'ACTIVE' ORDER BY id DESC LIMIT 1"
        );
        return result.rows[0] || null;
    }

    async getActiveCompetitions(): Promise<Competition[]> {
        const result = await this.pool.query(
            "SELECT * FROM competitions WHERE status = 'ACTIVE' ORDER BY created_at DESC"
        );
        return result.rows;
    }

    async getCompetitionById(id: number): Promise<Competition | null> {
        const result = await this.pool.query(
            'SELECT * FROM competitions WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    }

    async updateCompetition(id: number, updates: { name?: string; status?: CompetitionStatus }): Promise<number | null> {
        const { name, status } = updates;
        const result = await this.pool.query(
            'UPDATE competitions SET name = COALESCE($1, name), status = COALESCE($2, status) WHERE id = $3',
            [name, status, id]
        );
        return result.rowCount;
    }

    async updateCompetitionStatus(id: number, status: CompetitionStatus): Promise<number | null> {
        const result = await this.pool.query(
            'UPDATE competitions SET status = $1 WHERE id = $2',
            [status, id]
        );
        return result.rowCount;
    }

    async getContestantsByCompetition(competitionId: number): Promise<Contestant[]> {
        const result = await this.pool.query(`
            SELECT id, name, table_no, total_score, status, socket_id
            FROM contestants
            WHERE competition_id = $1
            ORDER BY table_no
        `, [competitionId]);
        return result.rows;
    }

    async getLeaderboardByCompetition(competitionId: number): Promise<Contestant[]> {
        const result = await this.pool.query(`
            SELECT id, name, table_no, total_score
            FROM contestants
            WHERE competition_id = $1
            ORDER BY total_score DESC, name ASC
        `, [competitionId]);
        return result.rows;
    }

    // ==================== ERİŞİM KODU İŞLEMLERİ ====================

    async generateAccessCodes(competitionId: number, contestantCount: number, juryCount: number): Promise<AccessCode[]> {
        const params: (number | string)[] = [];
        const valueClauses: string[] = [];
        let paramIdx = 1;

        for (let i = 1; i <= contestantCount; i++) {
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            valueClauses.push(`($${paramIdx}, $${paramIdx + 1}, 'CONTESTANT', $${paramIdx + 2}, $${paramIdx + 3})`);
            params.push(competitionId, code, `Yarışmacı ${i}`, i);
            paramIdx += 4;
        }

        for (let i = 1; i <= juryCount; i++) {
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            valueClauses.push(`($${paramIdx}, $${paramIdx + 1}, 'JURY', $${paramIdx + 2}, $${paramIdx + 3})`);
            params.push(competitionId, code, `Jüri ${i}`, i);
            paramIdx += 4;
        }

        const result = await this.pool.query(`
            INSERT INTO access_codes (competition_id, code, role, name, slot_number)
            VALUES ${valueClauses.join(', ')}
            RETURNING *
        `, params);

        return result.rows;
    }

    async validateAccessCode(code: string): Promise<ValidationResult> {
        const result = await this.pool.query(`
            SELECT ac.*, c.name as competition_name, c.status as competition_status
            FROM access_codes ac
            JOIN competitions c ON ac.competition_id = c.id
            WHERE ac.code = $1
        `, [code]);

        if (result.rows.length === 0) {
            return { valid: false, message: 'Geçersiz kod' };
        }

        const accessCode = result.rows[0];

        if (accessCode.competition_status !== 'ACTIVE') {
            return { valid: false, message: 'Yarışma aktif değil' };
        }

        return { valid: true, accessCode };
    }

    async markCodeAsUsed(codeId: number, sessionToken: string): Promise<AccessCode> {
        const result = await this.pool.query(`
            UPDATE access_codes
            SET is_used = true, session_token = $1, used_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *
        `, [sessionToken, codeId]);
        return result.rows[0];
    }

    async validateSessionToken(token: string): Promise<AccessCode | null> {
        const result = await this.pool.query(`
            SELECT ac.*, c.name as competition_name
            FROM access_codes ac
            JOIN competitions c ON ac.competition_id = c.id
            WHERE ac.session_token = $1 AND c.status = 'ACTIVE'
        `, [token]);
        return result.rows[0] || null;
    }

    async getAccessCodesByCompetition(competitionId: number): Promise<AccessCode[]> {
        const result = await this.pool.query(
            'SELECT * FROM access_codes WHERE competition_id = $1 ORDER BY role, slot_number',
            [competitionId]
        );
        return result.rows;
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

    // ==================== ERİŞİM KODU EK İŞLEMLERİ ====================

    async updateAccessCodeName(codeId: number, name: string): Promise<number | null> {
        const result = await this.pool.query(
            'UPDATE access_codes SET name = $1 WHERE id = $2',
            [name, codeId]
        );
        return result.rowCount;
    }

    async resetAccessCode(codeId: number): Promise<number | null> {
        const result = await this.pool.query(
            'UPDATE access_codes SET is_used = false, session_token = NULL, used_at = NULL WHERE id = $1',
            [codeId]
        );
        return result.rowCount;
    }
}

const db = new PostgresDatabase();
export default db;
