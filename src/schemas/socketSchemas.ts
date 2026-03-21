/**
 * Socket.io Event Payload Schemas (zod)
 *
 * Client -> Server event'leri için payload doğrulama şemaları.
 * Server -> Client event'leri doğrulanmaz (biz üretiyoruz).
 */

import { z } from 'zod';

// ==================== ADMIN EVENT'LERİ ====================

export const AdminStartQuestionSchema = z.object({
    questionId: z.number().int().positive()
});

export const AdminDeleteQuestionSchema = z.object({
    id: z.number().int().positive()
});

export const AdminAddQuestionSchema = z.object({
    content: z.string().min(1).max(2000),
    type: z.enum(['MULTIPLE_CHOICE', 'OPEN_ENDED']),
    options: z.array(z.string().max(500)).nullish().transform(v => v ?? undefined),
    correct_keys: z.array(z.string().max(500)).optional(),
    points: z.number().int().min(1).max(1000).optional().default(10),
    duration: z.number().int().min(5).max(300).optional().default(30),
    category: z.string().max(200).nullish().transform(v => v ?? undefined),
    media_url: z.string().max(500).nullish().transform(v => v ?? undefined)
});

export const AdminUpdateQuestionSchema = z.object({
    id: z.number().int().positive(),
    content: z.string().min(1).max(2000),
    type: z.enum(['MULTIPLE_CHOICE', 'OPEN_ENDED']),
    options: z.array(z.string().max(500)).nullish().transform(v => v ?? undefined),
    correct_keys: z.array(z.string().max(500)).optional(),
    points: z.number().int().min(1).max(1000).optional().default(10),
    duration: z.number().int().min(5).max(300).optional().default(30),
    category: z.string().max(200).nullish().transform(v => v ?? undefined),
    media_url: z.string().max(500).nullish().transform(v => v ?? undefined)
});

// ==================== PLAYER EVENT'LERİ ====================

export const PlayerLoginSchema = z.object({
    name: z.string().min(1).max(100),
    tableNo: z.union([
        z.number().int().positive(),
        z.string().regex(/^\d+$/).transform(Number)
    ])
});

export const PlayerSubmitAnswerSchema = z.object({
    answer: z.string().max(5000),
    timeRemaining: z.number().min(0).optional()
});

// ==================== JURY EVENT'LERİ ====================

export const JuryApproveGroupSchema = z.object({
    answerIds: z.array(z.number().int().positive()).min(1),
    isCorrect: z.boolean(),
    points: z.number().int().min(0).max(1000)
});

export const JuryManualScoreSchema = z.object({
    answerId: z.number().int().positive(),
    isCorrect: z.boolean(),
    points: z.number().int().min(0).max(1000)
});

export const JuryRequestAnswersSchema = z.object({
    questionId: z.number().int().positive()
});

// ==================== TYPE EXPORTS ====================

export type AdminStartQuestion = z.infer<typeof AdminStartQuestionSchema>;
export type AdminDeleteQuestion = z.infer<typeof AdminDeleteQuestionSchema>;
export type AdminAddQuestion = z.infer<typeof AdminAddQuestionSchema>;
export type AdminUpdateQuestion = z.infer<typeof AdminUpdateQuestionSchema>;
export type PlayerLogin = z.infer<typeof PlayerLoginSchema>;
export type PlayerSubmitAnswer = z.infer<typeof PlayerSubmitAnswerSchema>;
export type JuryApproveGroup = z.infer<typeof JuryApproveGroupSchema>;
export type JuryManualScore = z.infer<typeof JuryManualScoreSchema>;
export type JuryRequestAnswers = z.infer<typeof JuryRequestAnswersSchema>;

// ==================== DIRECTOR EVENT'LERİ ====================

export const DirectorShowImageSchema = z.object({
    media_url: z.string().max(500),
    title: z.string().max(200).optional().default('')
});

export const DirectorShowTextSchema = z.object({
    text: z.string().min(1).max(1000),
    subtitle: z.string().max(500).optional().default('')
});
