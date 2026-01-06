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
     * Yarışmacı ekle veya güncelle (masa numarasına göre)
     */
    async upsertContestant(name, tableNo) {
        const result = await this.pool.query(`
            INSERT INTO contestants (name, table_no, status)
            VALUES ($1, $2, 'ONLINE')
            ON CONFLICT (table_no)
            DO UPDATE SET name = EXCLUDED.name, status = 'ONLINE'
            RETURNING id
        `, [name, tableNo]);
        return result.rows[0].id;
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
            // TRUNCATE is faster and resets auto-increment IDs. CASCADE cleans up answers too.
            await client.query('TRUNCATE TABLE contestants, answers RESTART IDENTITY CASCADE');
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Yarışmadaki tüm erişim kodlarını sıfırla (tekrar kullanım için)
     */
    async resetAllAccessCodes(competitionId) {
        const result = await this.pool.query(
            'UPDATE access_codes SET is_used = false, session_token = NULL, used_at = NULL WHERE competition_id = $1',
            [competitionId]
        );
        return result.rowCount;
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
    async setSetting(key, value, description = null) {
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
     * Yarışma durumunu güncelle
     */
    async updateCompetitionStatus(id, status) {
        const result = await this.pool.query(
            'UPDATE competitions SET status = $1 WHERE id = $2',
            [status, id]
        );
        return result.rowCount;
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
     * Session token ile erişim kodunu bul (Competition JOIN ile)
     */
    async validateSessionToken(token) {
        const result = await this.pool.query(`
            SELECT ac.*, c.name as competition_name
            FROM access_codes ac
            JOIN competitions c ON ac.competition_id = c.id
            WHERE ac.session_token = $1 AND c.status = 'ACTIVE'
        `, [token]);
        return result.rows[0] || null;
    }

    /**
     * Yarışma erişim kodlarını getir
     */
    async getAccessCodesByCompetition(competitionId) {
        const result = await this.pool.query(
            'SELECT * FROM access_codes WHERE competition_id = $1 ORDER BY role, slot_number',
            [competitionId]
        );
        return result.rows;
    }

    /**
     * Erişim kodu ismini güncelle
     */
    async updateAccessCodeName(codeId, name) {
        const result = await this.pool.query(
            'UPDATE access_codes SET name = $1 WHERE id = $2',
            [name, codeId]
        );
        return result.rowCount;
    }

    /**
     * Erişim kodunu sıfırla
     */
    async resetAccessCode(codeId) {
        const result = await this.pool.query(
            'UPDATE access_codes SET is_used = false, session_token = NULL, used_at = NULL WHERE id = $1',
            [codeId]
        );
        return result.rowCount;
    }
}

module.exports = new PostgresDatabase();
