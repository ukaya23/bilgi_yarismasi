import { Pool } from 'pg';
import type { Competition, AccessCode, ValidationResult, CompetitionStatus } from '../../src/types';

export class CompetitionRepository {
    constructor(private pool: Pool) {}

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

    async resetAllAccessCodes(competitionId: number): Promise<number | null> {
        const result = await this.pool.query(
            'UPDATE access_codes SET is_used = false, session_token = NULL, used_at = NULL WHERE competition_id = $1',
            [competitionId]
        );
        return result.rowCount;
    }

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
