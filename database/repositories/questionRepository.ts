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
}
