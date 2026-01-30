/**
 * PostgreSQL Veritabanı Modülü
 * Migration from sql.js to PostgreSQL with async/await
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

class PostgresDatabase {
    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        // Error handler for pool
        this.pool.on('error', (err) => {
            console.error('[DB] Unexpected error on idle client', err);
        });
    }

    /**
     * Initialize database connection
     */
    async initialize() {
        try {
            const client = await this.pool.connect();
            try {
                const result = await client.query('SELECT NOW()');
                console.log('✓ PostgreSQL connected at:', result.rows[0].now);
            } finally {
                client.release();
            }
        } catch (error) {
            console.error('✗ Database connection error:', error);
            throw error;
        }
    }

    /**
     * Close database connection pool
     */
    async close() {
        await this.pool.end();
    }

    // ==================== SORU İŞLEMLERİ ====================

    /**
     * Tüm aktif soruları getir
     */
    async getAllQuestions() {
        const result = await this.pool.query(`
            SELECT id, content, media_url, type, options, correct_keys, points, duration, category
            FROM questions
            WHERE is_active = true
            ORDER BY id
        `);
        return result.rows;
    }

    /**
     * Tek soru getir
     */
    async getQuestionById(id) {
        const result = await this.pool.query(`
            SELECT id, content, media_url, type, options, correct_keys, points, duration, category
            FROM questions
            WHERE id = $1
        `, [id]);
        return result.rows[0] || null;
    }

    /**
     * Yeni soru ekle
     */
    async addQuestion(question) {
        const result = await this.pool.query(`
            INSERT INTO questions (content, media_url, type, options, correct_keys, points, duration, category)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id
        `, [
            question.content,
            question.media_url || null,
            question.type,
            question.options || null,
            question.correct_keys || null,
            question.points || 10,
            question.duration || 30,
            question.category || null
        ]);
        return result.rows[0].id;
    }

    /**
     * Soru güncelle
     */
    async updateQuestion(id, question) {
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
            question.options || null,
            question.correct_keys || null,
            question.points || 10,
            question.duration || 30,
            question.category || null,
            id
        ]);
        return result.rowCount;
    }

    /**
     * Soru sil (soft delete)
     */
    async deleteQuestion(id) {
        const result = await this.pool.query(
            'UPDATE questions SET is_active = false WHERE id = $1',
            [id]
        );
        return result.rowCount;
    }

    // ==================== YARIŞMACI İŞLEMLERİ ====================

    /**
     * Tüm yarışmacıları getir
     */
    async getAllContestants() {
        const result = await this.pool.query(`
            SELECT id, name, table_no, total_score, status, socket_id
            FROM contestants
            ORDER BY table_no
        `);
        return result.rows;
    }

    /**
     * ID'ye göre yarışmacı getir
     */
    async getContestantById(id) {
        const result = await this.pool.query(
            'SELECT * FROM contestants WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    }

    /**
     * Yarışmacı ekle veya güncelle (masa numarasına göre, yarışma bazlı)
     */
    async upsertContestant(name, tableNo, competitionId = 1) {
        // First check for unique constraint on table_no + competition_id
        const existing = await this.pool.query(`
            SELECT id FROM contestants
            WHERE table_no = $1 AND competition_id = $2
        `, [tableNo, competitionId]);

        if (existing.rows.length > 0) {
            // Update existing contestant
            const result = await this.pool.query(`
                UPDATE contestants
                SET name = $1, status = 'ONLINE'
                WHERE table_no = $2 AND competition_id = $3
                RETURNING id
            `, [name, tableNo, competitionId]);
            return result.rows[0].id;
        } else {
            // Insert new contestant
            const result = await this.pool.query(`
                INSERT INTO contestants (name, table_no, competition_id, status)
                VALUES ($1, $2, $3, 'ONLINE')
                RETURNING id
            `, [name, tableNo, competitionId]);
            return result.rows[0].id;
        }
    }

    /**
     * Yarışmacı socket ID güncelle
     */
    async updateContestantSocket(id, socketId) {
        const result = await this.pool.query(
            `UPDATE contestants SET socket_id = $1, status = 'ONLINE' WHERE id = $2`,
            [socketId, id]
        );
        return result.rowCount;
    }

    /**
     * Yarışmacı durumunu güncelle
     */
    async updateContestantStatus(id, status) {
        const result = await this.pool.query(
            'UPDATE contestants SET status = $1 WHERE id = $2',
            [status, id]
        );
        return result.rowCount;
    }

    /**
     * Yarışmacı puanını güncelle
     */
    async updateContestantScore(id, pointsToAdd) {
        const result = await this.pool.query(
            'UPDATE contestants SET total_score = total_score + $1 WHERE id = $2',
            [pointsToAdd, id]
        );
        return result.rowCount;
    }

    /**
     * Socket ID ile yarışmacı bul
     */
    async getContestantBySocketId(socketId) {
        const result = await this.pool.query(
            'SELECT * FROM contestants WHERE socket_id = $1',
            [socketId]
        );
        return result.rows[0] || null;
    }

    /**
     * Liderlik tablosunu getir
     */
    async getLeaderboard() {
        const result = await this.pool.query(`
            SELECT id, name, table_no, total_score
            FROM contestants
            WHERE status != 'DISQUALIFIED'
            ORDER BY total_score DESC, name ASC
        `);
        return result.rows;
    }

    /**
     * Tüm yarışmacıları sil (reset için)
     */
    async resetAllContestants() {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('DELETE FROM answers');
            await client.query('DELETE FROM contestants');
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // ==================== CEVAP İŞLEMLERİ ====================

    /**
     * Cevap kaydet (Transaction ile)
     */
    async saveAnswer(questionId, contestantId, answerText, timeRemaining) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Duplicate check
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

    /**
     * Bir soruya verilen tüm cevapları getir
     */
    async getAnswersForQuestion(questionId) {
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

    /**
     * Cevabı puanla
     */
    async gradeAnswer(answerId, isCorrect, points) {
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

    /**
     * Toplu cevap puanla
     */
    async gradeAnswersBulk(answerIds, isCorrect, points) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            for (const id of answerIds) {
                await client.query(
                    'UPDATE answers SET is_correct = $1, points_awarded = $2 WHERE id = $3',
                    [isCorrect, points, id]
                );

                if (points > 0) {
                    const answer = await client.query(
                        'SELECT contestant_id FROM answers WHERE id = $1',
                        [id]
                    );
                    if (answer.rows.length > 0) {
                        await client.query(
                            'UPDATE contestants SET total_score = total_score + $1 WHERE id = $2',
                            [points, answer.rows[0].contestant_id]
                        );
                    }
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

    // ==================== ÖZLÜ SÖZ İŞLEMLERİ ====================

    /**
     * Rastgele özlü söz getir
     */
    async getRandomQuote() {
        const result = await this.pool.query(
            'SELECT * FROM quotes ORDER BY RANDOM() LIMIT 1'
        );
        return result.rows[0] || null;
    }

    /**
     * Tüm özlü sözleri getir
     */
    async getAllQuotes() {
        const result = await this.pool.query('SELECT * FROM quotes ORDER BY id');
        return result.rows;
    }

    // ==================== OYUN OTURUMU İŞLEMLERİ ====================

    /**
     * Aktif oturumu getir veya oluştur
     */
    async getOrCreateSession() {
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

    /**
     * Oyun durumunu güncelle
     */
    async updateSessionState(state, questionId = null) {
        const result = await this.pool.query(`
            UPDATE game_sessions
            SET state = $1, current_question_id = $2, question_start_time = CURRENT_TIMESTAMP
            WHERE id = (SELECT id FROM game_sessions ORDER BY id DESC LIMIT 1)
            RETURNING *
        `, [state, questionId]);
        return result.rows[0];
    }

    // ==================== AYARLAR İŞLEMLERİ ====================

    /**
     * Ayar getir
     */
    async getSetting(key) {
        const result = await this.pool.query(
            'SELECT value FROM settings WHERE key = $1',
            [key]
        );
        return result.rows[0] ? result.rows[0].value : null;
    }

    /**
     * Tüm ayarları getir
     */
    async getAllSettings() {
        const result = await this.pool.query('SELECT * FROM settings ORDER BY key');
        return result.rows;
    }

    /**
     * Ayar güncelle veya ekle
     */
    async upsertSetting(key, value, description = null) {
        const result = await this.pool.query(`
            INSERT INTO settings (key, value, description)
            VALUES ($1, $2, $3)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
            RETURNING *
        `, [key, value, description]);
        return result.rows[0];
    }

    // ==================== ADMİN İŞLEMLERİ ====================

    /**
     * Varsayılan admin kullanıcısını oluştur
     */
    async ensureDefaultAdmin() {
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
            console.log('✓ Default admin user created (username: admin, password: admin123)');
        }
    }

    /**
     * Kullanıcı adına göre admin kullanıcı getir
     */
    async getAdminByUsername(username) {
        const result = await this.pool.query(
            'SELECT id, username, password_hash FROM admin_users WHERE username = $1',
            [username]
        );
        return result.rows[0] || null;
    }

    /**
     * Admin kimlik doğrulama
     */
    async authenticateAdmin(username, password) {
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

    /**
     * Yarışma oluştur
     */
    async createCompetition(name, contestantCount, juryCount) {
        const result = await this.pool.query(`
            INSERT INTO competitions (name, contestant_count, jury_count, status)
            VALUES ($1, $2, $3, 'ACTIVE')
            RETURNING id
        `, [name, contestantCount, juryCount]);
        return result.rows[0].id;
    }

    /**
     * Aktif yarışmayı getir
     */
    async getActiveCompetition() {
        const result = await this.pool.query(
            "SELECT * FROM competitions WHERE status = 'ACTIVE' ORDER BY id DESC LIMIT 1"
        );
        return result.rows[0] || null;
    }

    /**
     * Tüm aktif yarışmaları getir
     */
    async getActiveCompetitions() {
        const result = await this.pool.query(
            "SELECT * FROM competitions WHERE status = 'ACTIVE' ORDER BY created_at DESC"
        );
        return result.rows;
    }

    /**
     * ID'ye göre yarışma getir
     */
    async getCompetitionById(id) {
        const result = await this.pool.query(
            'SELECT * FROM competitions WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    }

    /**
     * Yarışma bilgilerini güncelle
     */
    async updateCompetition(id, updates) {
        const { name, status } = updates;
        const result = await this.pool.query(
            'UPDATE competitions SET name = COALESCE($1, name), status = COALESCE($2, status) WHERE id = $3',
            [name, status, id]
        );
        return result.rowCount;
    }

    /**
     * Yarışma durumunu güncelle
     */
    async updateCompetitionStatus(id, status) {
        const result = await this.pool.query(
            'UPDATE competitions SET status = $1 WHERE id = $2',
            [status, id]
        );
        return result.rowCount;
    }

    /**
     * Yarışmaya kayıtlı yarışmacıları getir
     */
    async getContestantsByCompetition(competitionId) {
        const result = await this.pool.query(`
            SELECT id, name, table_no, total_score, status, socket_id
            FROM contestants
            WHERE competition_id = $1
            ORDER BY table_no
        `, [competitionId]);
        return result.rows;
    }

    /**
     * Yarışma sıralamasını getir
     */
    async getLeaderboardByCompetition(competitionId) {
        const result = await this.pool.query(`
            SELECT id, name, table_no, total_score
            FROM contestants
            WHERE competition_id = $1
            ORDER BY total_score DESC, name ASC
        `, [competitionId]);
        return result.rows;
    }

    // ==================== ERİŞİM KODU İŞLEMLERİ ====================

    /**
     * Erişim kodları oluştur
     */
    async generateAccessCodes(competitionId, contestantCount, juryCount) {
        const codes = [];

        // Yarışmacı kodları
        for (let i = 1; i <= contestantCount; i++) {
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            const result = await this.pool.query(`
                INSERT INTO access_codes (competition_id, code, role, name, slot_number)
                VALUES ($1, $2, 'CONTESTANT', $3, $4)
                RETURNING *
            `, [competitionId, code, `Yarışmacı ${i}`, i]);
            codes.push(result.rows[0]);
        }

        // Jüri kodları
        for (let i = 1; i <= juryCount; i++) {
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            const result = await this.pool.query(`
                INSERT INTO access_codes (competition_id, code, role, name, slot_number)
                VALUES ($1, $2, 'JURY', $3, $4)
                RETURNING *
            `, [competitionId, code, `Jüri ${i}`, i]);
            codes.push(result.rows[0]);
        }

        return codes;
    }

    /**
     * Erişim kodunu doğrula
     */
    async validateAccessCode(code) {
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

    /**
     * Erişim kodunu kullanıldı olarak işaretle
     */
    async markCodeAsUsed(codeId, sessionToken) {
        const result = await this.pool.query(`
            UPDATE access_codes
            SET is_used = true, session_token = $1, used_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *
        `, [sessionToken, codeId]);
        return result.rows[0];
    }

    /**
     * Session token ile erişim kodunu bul
     */
    async getAccessCodeByToken(token) {
        const result = await this.pool.query(
            'SELECT * FROM access_codes WHERE session_token = $1',
            [token]
        );
        return result.rows[0] || null;
    }

    /**
     * Yarışma erişim kodlarını getir
     */
    async getCompetitionAccessCodes(competitionId) {
        const result = await this.pool.query(
            'SELECT * FROM access_codes WHERE competition_id = $1 ORDER BY role, slot_number',
            [competitionId]
        );
        return result.rows;
    }

    // ==================== JWT TOKEN İŞLEMLERİ ====================

    /**
     * Token'ı iptal edilmiş listesine ekle
     */
    async revokeToken(tokenId, userId, reason = 'manual_revoke') {
        const result = await this.pool.query(`
            INSERT INTO revoked_tokens (token_id, user_id, reason)
            VALUES ($1, $2, $3)
            ON CONFLICT (token_id) DO NOTHING
            RETURNING *
        `, [tokenId, userId, reason]);
        return result.rows[0];
    }

    /**
     * Token'ın iptal edilip edilmediğini kontrol et
     */
    async isTokenRevoked(tokenId) {
        const result = await this.pool.query(
            'SELECT EXISTS(SELECT 1 FROM revoked_tokens WHERE token_id = $1) as revoked',
            [tokenId]
        );
        return result.rows[0].revoked;
    }

    /**
     * Kullanıcının tüm token'larını iptal et
     */
    async revokeAllUserTokens(userId, reason = 'logout_all') {
        const result = await this.pool.query(`
            INSERT INTO revoked_tokens (token_id, user_id, reason)
            SELECT gen_random_uuid(), $1, $2
            WHERE NOT EXISTS (
                SELECT 1 FROM revoked_tokens WHERE user_id = $1
            )
            RETURNING *
        `, [userId, reason]);
        return result.rowCount;
    }

    /**
     * Eski iptal edilmiş token'ları temizle (7 günden eski)
     */
    async cleanupRevokedTokens() {
        const result = await this.pool.query(`
            DELETE FROM revoked_tokens
            WHERE revoked_at < NOW() - INTERVAL '7 days'
        `);
        return result.rowCount;
    }
}

module.exports = new PostgresDatabase();
