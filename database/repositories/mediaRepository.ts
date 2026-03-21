import { Pool } from 'pg';

export interface MediaRecord {
    id: number;
    filename: string;
    original_name: string;
    mime_type: string;
    media_type: 'image' | 'audio' | 'video';
    file_size: number;
    url: string;
    uploaded_by: number | null;
    created_at: string;
}

export class MediaRepository {
    constructor(private pool: Pool) {}

    async addMedia(entry: Omit<MediaRecord, 'id' | 'created_at'>): Promise<MediaRecord> {
        const result = await this.pool.query(`
            INSERT INTO media (filename, original_name, mime_type, media_type, file_size, url, uploaded_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [
            entry.filename,
            entry.original_name,
            entry.mime_type,
            entry.media_type,
            entry.file_size,
            entry.url,
            entry.uploaded_by
        ]);
        return result.rows[0];
    }

    async getAll(mediaType?: string): Promise<MediaRecord[]> {
        if (mediaType && ['image', 'audio', 'video'].includes(mediaType)) {
            const result = await this.pool.query(
                'SELECT * FROM media WHERE media_type = $1 ORDER BY created_at DESC',
                [mediaType]
            );
            return result.rows;
        }
        const result = await this.pool.query('SELECT * FROM media ORDER BY created_at DESC');
        return result.rows;
    }

    async getByFilename(filename: string): Promise<MediaRecord | null> {
        const result = await this.pool.query('SELECT * FROM media WHERE filename = $1', [filename]);
        return result.rows[0] || null;
    }

    async deleteByFilename(filename: string): Promise<number | null> {
        const result = await this.pool.query('DELETE FROM media WHERE filename = $1', [filename]);
        return result.rowCount;
    }

    async getUsageCount(filename: string): Promise<number> {
        const result = await this.pool.query(
            "SELECT COUNT(*) as count FROM questions WHERE media_url LIKE '%' || $1 AND is_active = true",
            [filename]
        );
        return parseInt(result.rows[0].count, 10);
    }
}
