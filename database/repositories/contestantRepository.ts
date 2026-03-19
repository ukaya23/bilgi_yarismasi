import { Pool } from 'pg';
import log from '../../src/utils/logger';
import type { Contestant, ContestantStatus } from '../../src/types';

export class ContestantRepository {
    constructor(private pool: Pool) {}

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
}
