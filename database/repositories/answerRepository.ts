import { Pool } from 'pg';
import type { Answer } from '../../src/types';

export class AnswerRepository {
    constructor(private pool: Pool) {}

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
}
