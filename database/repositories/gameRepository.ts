import { Pool } from 'pg';
import type { Quote, Setting, GamePhase } from '../../src/types';

export class GameRepository {
    constructor(private pool: Pool) {}

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
}
