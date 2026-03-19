"use strict";
/**
 * Grading Service - Puanlama ve cevap gruplama mantigi
 *
 * Levenshtein benzerlik algoritmasi, cevap gruplama,
 * otomatik puanlama ve juri degerlendirmesi hazirligi.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSimilar = isSimilar;
exports.groupAnswers = groupAnswers;
exports.createEmptyAnswers = createEmptyAnswers;
exports.autoGradeMultipleChoice = autoGradeMultipleChoice;
exports.prepareJuryReview = prepareJuryReview;
const postgres_1 = __importDefault(require("../../database/postgres"));
const logger_1 = __importDefault(require("../utils/logger"));
/**
 * Basit benzerlik kontrolu (Levenshtein mesafesi)
 */
function isSimilar(str1, str2, threshold = 0.8) {
    if (str1 === str2)
        return true;
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix = [];
    for (let i = 0; i <= len1; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
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
function groupAnswers(answers, correctKeys) {
    const groups = {
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
        const isMatch = correctKeys.some(key => key.toLowerCase().trim() === normalizedAnswer ||
            isSimilar(normalizedAnswer, key.toLowerCase().trim()));
        if (isMatch) {
            groups.correct.push(answer);
        }
        else {
            groups.incorrect.push(answer);
        }
    }
    return groups;
}
/**
 * Cevap vermeyen yarismacilar icin bos cevap olustur (batch INSERT)
 */
async function createEmptyAnswers(questionId, competitionId) {
    const existingAnswers = await postgres_1.default.getAnswersForQuestion(questionId, competitionId);
    const allContestants = await postgres_1.default.getAllContestants(competitionId);
    const answeredContestantIds = new Set(existingAnswers.map(a => a.contestant_id));
    const missingContestantIds = allContestants
        .filter(c => !answeredContestantIds.has(c.id) && c.status !== 'OFFLINE')
        .map(c => c.id);
    if (missingContestantIds.length > 0) {
        logger_1.default.debug({ questionId, count: missingContestantIds.length }, 'Bos cevap olusturuluyor');
        await postgres_1.default.saveAnswersBulk(questionId, missingContestantIds);
    }
}
/**
 * Coktan secmeli soruyu otomatik puanla
 */
async function autoGradeMultipleChoice(questionId, competitionId, correctKeys, points) {
    await createEmptyAnswers(questionId, competitionId);
    const answers = await postgres_1.default.getAnswersForQuestion(questionId, competitionId);
    const correctIds = [];
    const incorrectIds = [];
    for (const answer of answers) {
        if (answer.answer_text && correctKeys.includes(answer.answer_text)) {
            correctIds.push(answer.id);
        }
        else {
            incorrectIds.push(answer.id);
        }
    }
    logger_1.default.debug({ questionId, correct: correctIds.length, incorrect: incorrectIds.length }, 'Otomatik puanlama');
    if (correctIds.length > 0) {
        await postgres_1.default.gradeAnswersBulk(correctIds, true, points);
    }
    if (incorrectIds.length > 0) {
        await postgres_1.default.gradeAnswersBulk(incorrectIds, false, 0);
    }
}
/**
 * Juri degerlendirmesi icin veri hazirla
 */
async function prepareJuryReview(questionId, competitionId, questionContent, correctKeys, points) {
    await createEmptyAnswers(questionId, competitionId);
    const answers = await postgres_1.default.getAnswersForQuestion(questionId, competitionId);
    const emptyAnswerIds = answers
        .filter(a => !a.answer_text || a.answer_text.trim() === '')
        .map(a => a.id);
    if (emptyAnswerIds.length > 0) {
        await postgres_1.default.gradeAnswersBulk(emptyAnswerIds, false, 0);
    }
    const nonEmptyAnswers = answers.filter(a => a.answer_text && a.answer_text.trim() !== '');
    const groups = groupAnswers(nonEmptyAnswers, correctKeys);
    logger_1.default.debug({ questionId, emptyCount: emptyAnswerIds.length, correctCount: groups.correct.length, incorrectCount: groups.incorrect.length }, 'Juri degerlendirmesi hazirlandi');
    return {
        questionId,
        questionContent,
        correctKeys,
        points,
        groups,
        emptyCount: emptyAnswerIds.length
    };
}
//# sourceMappingURL=gradingService.js.map