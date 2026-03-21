/**
 * Question Import/Export Routes
 *
 * Excel/CSV bulk import, export, and template download.
 */

import express, { Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { authenticateToken, requireRole } from '../auth/authMiddleware';
import db from '../../database/postgres';
import log from '../utils/logger';
import type { AuthenticatedRequest } from '../types';

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv',
            'application/csv',
        ];
        if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
            cb(null, true);
        } else {
            cb(new Error('Sadece Excel (.xlsx, .xls) veya CSV dosyaları yüklenebilir'));
        }
    }
});

// Valid question types
const VALID_TYPES = ['MULTIPLE_CHOICE', 'OPEN_ENDED'];

interface ImportRow {
    content?: string;
    type?: string;
    options?: string;
    correct_keys?: string;
    points?: number | string;
    duration?: number | string;
    category?: string;
}

interface ImportResult {
    row: number;
    status: 'success' | 'error';
    message?: string;
    id?: number;
}

/**
 * POST /import — Bulk import questions from Excel/CSV
 */
router.post('/import',
    authenticateToken as any,
    requireRole('admin') as any,
    upload.single('file'),
    async (req: any, res: Response) => {
        try {
            if (!req.file) {
                res.status(400).json({ error: 'Dosya yüklenmedi' });
                return;
            }

            const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            if (!sheetName) {
                res.status(400).json({ error: 'Excel dosyasında sayfa bulunamadı' });
                return;
            }

            const rows: ImportRow[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

            if (rows.length === 0) {
                res.status(400).json({ error: 'Dosyada soru bulunamadı' });
                return;
            }

            if (rows.length > 500) {
                res.status(400).json({ error: 'Tek seferde en fazla 500 soru yüklenebilir' });
                return;
            }

            const results: ImportResult[] = [];
            const validQuestions: any[] = [];

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const rowNum = i + 2; // +2 for header row + 0-indexed

                // Validate content
                if (!row.content || String(row.content).trim() === '') {
                    results.push({ row: rowNum, status: 'error', message: 'Soru metni boş' });
                    continue;
                }

                // Parse type
                const type = (row.type || 'OPEN_ENDED').toUpperCase().trim();
                if (!VALID_TYPES.includes(type)) {
                    results.push({ row: rowNum, status: 'error', message: `Geçersiz soru tipi: ${row.type}` });
                    continue;
                }

                // Parse options (semicolon-separated)
                let options: string[] | null = null;
                if (row.options && String(row.options).trim()) {
                    options = String(row.options).split(';').map(o => o.trim()).filter(o => o);
                    if (type === 'MULTIPLE_CHOICE' && options.length < 2) {
                        results.push({ row: rowNum, status: 'error', message: 'Çoktan seçmeli soruda en az 2 seçenek gerekli' });
                        continue;
                    }
                }

                // Parse correct_keys (semicolon-separated)
                let correctKeys: string[] = [];
                if (row.correct_keys && String(row.correct_keys).trim()) {
                    correctKeys = String(row.correct_keys).split(';').map(k => k.trim()).filter(k => k);
                }

                // Parse numeric fields
                const points = Number(row.points) || 10;
                const duration = Number(row.duration) || 30;
                const category = row.category ? String(row.category).trim() : null;

                validQuestions.push({
                    content: String(row.content).trim(),
                    type,
                    options,
                    correct_keys: correctKeys.length > 0 ? correctKeys : null,
                    points,
                    duration,
                    category,
                    _rowNum: rowNum
                });
            }

            // Bulk insert valid questions
            if (validQuestions.length > 0) {
                try {
                    const ids = await db.addQuestionsBulk(validQuestions);
                    for (let i = 0; i < validQuestions.length; i++) {
                        results.push({
                            row: validQuestions[i]._rowNum,
                            status: 'success',
                            id: ids[i]
                        });
                    }
                } catch (err) {
                    log.error({ err }, 'Toplu soru ekleme hatası');
                    for (const q of validQuestions) {
                        results.push({ row: q._rowNum, status: 'error', message: 'Veritabanı hatası' });
                    }
                }
            }

            const successCount = results.filter(r => r.status === 'success').length;
            const errorCount = results.filter(r => r.status === 'error').length;

            log.info({ successCount, errorCount, total: rows.length }, 'Soru import tamamlandı');

            res.json({
                success: true,
                total: rows.length,
                imported: successCount,
                errors: errorCount,
                results
            });
        } catch (error: any) {
            log.error({ err: error }, 'Import hatası');
            res.status(500).json({ error: error.message || 'İçe aktarma sırasında hata oluştu' });
        }
    }
);

/**
 * GET /export — Export all questions as Excel or CSV
 */
router.get('/export',
    authenticateToken as any,
    requireRole('admin') as any,
    async (_req: any, res: Response) => {
        try {
            const format = (_req.query.format || 'xlsx').toString().toLowerCase();
            const questions = await db.getAllQuestions();

            const exportData = questions.map(q => ({
                content: q.content,
                type: q.type,
                options: q.options ? q.options.join(';') : '',
                correct_keys: q.correct_keys ? q.correct_keys.join(';') : '',
                points: q.points,
                duration: q.duration,
                category: q.category || ''
            }));

            const worksheet = XLSX.utils.json_to_sheet(exportData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Sorular');

            if (format === 'csv') {
                const csv = XLSX.utils.sheet_to_csv(worksheet);
                res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                res.setHeader('Content-Disposition', 'attachment; filename="sorular.csv"');
                res.send('\uFEFF' + csv); // BOM for Excel UTF-8
            } else {
                const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', 'attachment; filename="sorular.xlsx"');
                res.send(buffer);
            }
        } catch (error) {
            log.error({ err: error }, 'Export hatası');
            res.status(500).json({ error: 'Dışa aktarma sırasında hata oluştu' });
        }
    }
);

/**
 * GET /template — Download empty template
 */
router.get('/template',
    authenticateToken as any,
    requireRole('admin') as any,
    (_req: any, res: Response) => {
        try {
            const format = (_req.query.format || 'xlsx').toString().toLowerCase();

            const sampleData = [
                {
                    content: 'Türkiye\'nin başkenti neresidir?',
                    type: 'MULTIPLE_CHOICE',
                    options: 'İstanbul;Ankara;İzmir;Bursa',
                    correct_keys: 'Ankara',
                    points: 10,
                    duration: 30,
                    category: 'Coğrafya'
                },
                {
                    content: 'Dünya\'nın en uzun nehri hangisidir?',
                    type: 'OPEN_ENDED',
                    options: '',
                    correct_keys: 'Nil',
                    points: 15,
                    duration: 45,
                    category: 'Coğrafya'
                }
            ];

            const worksheet = XLSX.utils.json_to_sheet(sampleData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Şablon');

            if (format === 'csv') {
                const csv = XLSX.utils.sheet_to_csv(worksheet);
                res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                res.setHeader('Content-Disposition', 'attachment; filename="soru_sablonu.csv"');
                res.send('\uFEFF' + csv);
            } else {
                const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', 'attachment; filename="soru_sablonu.xlsx"');
                res.send(buffer);
            }
        } catch (error) {
            log.error({ err: error }, 'Şablon indirme hatası');
            res.status(500).json({ error: 'Şablon oluşturulurken hata oluştu' });
        }
    }
);

export default router;
