import { Pool } from 'pg';

export interface EventLogEntry {
    eventType: string;
    actorType: 'admin' | 'player' | 'jury' | 'system';
    actorId?: number | null;
    actorName?: string | null;
    competitionId?: number | null;
    questionId?: number | null;
    payload?: Record<string, unknown>;
}

export class EventLogRepository {
    constructor(private pool: Pool) {}

    async log(entry: EventLogEntry): Promise<void> {
        await this.pool.query(`
            INSERT INTO event_log (event_type, actor_type, actor_id, actor_name, competition_id, question_id, payload)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            entry.eventType,
            entry.actorType,
            entry.actorId ?? null,
            entry.actorName ?? null,
            entry.competitionId ?? null,
            entry.questionId ?? null,
            JSON.stringify(entry.payload ?? {}),
        ]);
    }

    async getByCompetition(competitionId: number, limit = 100, offset = 0): Promise<unknown[]> {
        const result = await this.pool.query(`
            SELECT * FROM event_log
            WHERE competition_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `, [competitionId, limit, offset]);
        return result.rows;
    }

    async getByType(eventType: string, limit = 50): Promise<unknown[]> {
        const result = await this.pool.query(`
            SELECT * FROM event_log
            WHERE event_type = $1
            ORDER BY created_at DESC
            LIMIT $2
        `, [eventType, limit]);
        return result.rows;
    }

    async getRecent(limit = 50): Promise<unknown[]> {
        const result = await this.pool.query(`
            SELECT * FROM event_log
            ORDER BY created_at DESC
            LIMIT $1
        `, [limit]);
        return result.rows;
    }
}
