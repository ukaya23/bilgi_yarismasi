/**
 * Grading Service - Puanlama ve cevap gruplama mantigi
 *
 * Levenshtein benzerlik algoritmasi, cevap gruplama,
 * otomatik puanlama ve juri degerlendirmesi hazirligi.
 */

import db from '../../database/postgres';
import log from '../utils/logger';
import type { Answer, AnswerGroups, JuryReviewData } from '../types';

/**
 * Basit benzerlik kontrolu (Levenshtein mesafesi)
 */
export function isSimilar(str1: string, str2: string, threshold: number = 0.8): boolean {
    if (str1 === str2) return true;

    const len1 = str1.length;
    const len2 = str2.length;
    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }

    const distance = matrix[len1][len2];
    const maxLen = Math.max(len1, len2);
    const similarity = 1 - distance / maxLen;

    return similarity >= threshold;
}

/**
 * Cevaplari grupla (dogru/yanlis/bos)
 */
export function groupAnswers(answers: Answer[], correctKeys: string[]): AnswerGroups {
    const groups: AnswerGroups = {
        correct: [],
        incorrect: [],
        empty: []
    };

    for (const answer of answers) {
        if (!answer.answer_text || answer.answer_text.trim() === '') {
            groups.empty.push(answer);
            continue;
        }

        const normalizedAnswer = answer.answer_text.toLowerCase().trim();
        const isMatch = correctKeys.some(key =>
            key.toLowerCase().trim() === normalizedAnswer ||
            isSimilar(normalizedAnswer, key.toLowerCase().trim())
        );

        if (isMatch) {
            groups.correct.push(answer);
        } else {
            groups.incorrect.push(answer);
        }
    }

    return groups;
}

/**
 * Cevap vermeyen yarismacilar icin bos cevap olustur (batch INSERT)
 */
export async function createEmptyAnswers(questionId: number, competitionId: number): Promise<void> {
    const existingAnswers = await db.getAnswersForQuestion(questionId, competitionId);
    const allContestants = await db.getAllContestants(competitionId);
    const answeredContestantIds = new Set(existingAnswers.map(a => a.contestant_id));

    const missingContestantIds = allContestants
        .filter(c => !answeredContestantIds.has(c.id) && c.status !== 'OFFLINE')
        .map(c => c.id);

    if (missingContestantIds.length > 0) {
        log.debug({ questionId, count: missingContestantIds.length }, 'Bos cevap olusturuluyor');
        await db.saveAnswersBulk(questionId, missingContestantIds);
    }
}

/**
 * Coktan secmeli soruyu otomatik puanla
 */
export async function autoGradeMultipleChoice(questionId: number, competitionId: number, correctKeys: string[], points: number): Promise<void> {
    await createEmptyAnswers(questionId, competitionId);

    const answers = await db.getAnswersForQuestion(questionId, competitionId);

    const correctIds: number[] = [];
    const incorrectIds: number[] = [];

    for (const answer of answers) {
        if (answer.answer_text && correctKeys.includes(answer.answer_text)) {
            correctIds.push(answer.id);
        } else {
            incorrectIds.push(answer.id);
        }
    }

    log.debug({ questionId, correct: correctIds.length, incorrect: incorrectIds.length }, 'Otomatik puanlama');
    if (correctIds.length > 0) {
        await db.gradeAnswersBulk(correctIds, true, points);
    }
    if (incorrectIds.length > 0) {
        await db.gradeAnswersBulk(incorrectIds, false, 0);
    }
}

/**
 * Juri degerlendirmesi icin veri hazirla
 */
export async function prepareJuryReview(questionId: number, competitionId: number, questionContent: string, correctKeys: string[], points: number): Promise<JuryReviewData> {
    await createEmptyAnswers(questionId, competitionId);

    const answers = await db.getAnswersForQuestion(questionId, competitionId);

    const emptyAnswerIds = answers
        .filter(a => !a.answer_text || a.answer_text.trim() === '')
        .map(a => a.id);

    if (emptyAnswerIds.length > 0) {
        await db.gradeAnswersBulk(emptyAnswerIds, false, 0);
    }

    const nonEmptyAnswers = answers.filter(a => a.answer_text && a.answer_text.trim() !== '');
    const groups = groupAnswers(nonEmptyAnswers, correctKeys);

    log.debug({ questionId, emptyCount: emptyAnswerIds.length, correctCount: groups.correct.length, incorrectCount: groups.incorrect.length }, 'Juri degerlendirmesi hazirlandi');
    return {
        questionId,
        questionContent,
        correctKeys,
        points,
        groups,
        emptyCount: emptyAnswerIds.length
    };
}
