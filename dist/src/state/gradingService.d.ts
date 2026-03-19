/**
 * Grading Service - Puanlama ve cevap gruplama mantigi
 *
 * Levenshtein benzerlik algoritmasi, cevap gruplama,
 * otomatik puanlama ve juri degerlendirmesi hazirligi.
 */
import type { Answer, AnswerGroups, JuryReviewData } from '../types';
/**
 * Basit benzerlik kontrolu (Levenshtein mesafesi)
 */
export declare function isSimilar(str1: string, str2: string, threshold?: number): boolean;
/**
 * Cevaplari grupla (dogru/yanlis/bos)
 */
export declare function groupAnswers(answers: Answer[], correctKeys: string[]): AnswerGroups;
/**
 * Cevap vermeyen yarismacilar icin bos cevap olustur (batch INSERT)
 */
export declare function createEmptyAnswers(questionId: number, competitionId: number): Promise<void>;
/**
 * Coktan secmeli soruyu otomatik puanla
 */
export declare function autoGradeMultipleChoice(questionId: number, competitionId: number, correctKeys: string[], points: number): Promise<void>;
/**
 * Juri degerlendirmesi icin veri hazirla
 */
export declare function prepareJuryReview(questionId: number, competitionId: number, questionContent: string, correctKeys: string[], points: number): Promise<JuryReviewData>;
//# sourceMappingURL=gradingService.d.ts.map