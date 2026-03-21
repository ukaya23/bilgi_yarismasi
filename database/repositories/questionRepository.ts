import { Pool } from 'pg';
import type { Question } from '../../src/types';

export class QuestionRepository {
    constructor(private pool: Pool) {}

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

    async addQuestionsBulk(questions: Partial<import('../../src/types').Question>[]): Promise<number[]> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const ids: number[] = [];
            for (const q of questions) {
                const result = await client.query(`
                    INSERT INTO questions (content, media_url, type, options, correct_keys, points, duration, category)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING id
                `, [
                    q.content,
                    q.media_url || null,
                    q.type || 'OPEN_ENDED',
                    q.options ? JSON.stringify(q.options) : null,
                    q.correct_keys ? JSON.stringify(q.correct_keys) : null,
                    q.points || 10,
                    q.duration || 30,
                    q.category || null
                ]);
                ids.push(result.rows[0].id);
            }
            await client.query('COMMIT');
            return ids;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }
}
