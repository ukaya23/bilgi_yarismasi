/**
 * GradingService Tests - Similarity, Answer Grouping, Auto-Grading
 */

jest.mock('../database/postgres', () => ({
    getAnswersForQuestion: jest.fn().mockResolvedValue([]),
    getAllContestants: jest.fn().mockResolvedValue([]),
    saveAnswer: jest.fn().mockResolvedValue({ success: true }),
    saveAnswersBulk: jest.fn().mockResolvedValue(),
    gradeAnswer: jest.fn().mockResolvedValue(),
    gradeAnswersBulk: jest.fn().mockResolvedValue()
}));

const db = require('../database/postgres');
const {
    isSimilar,
    groupAnswers,
    createEmptyAnswers,
    autoGradeMultipleChoice,
    prepareJuryReview
} = require('../src/state/gradingService');

describe('GradingService - isSimilar (Levenshtein)', () => {
    it('should return true for identical strings', () => {
        expect(isSimilar('ankara', 'ankara')).toBe(true);
    });

    it('should return true for very similar strings', () => {
        expect(isSimilar('ankara', 'ankra')).toBe(true); // 1 char missing
        expect(isSimilar('atatürk', 'atatürk')).toBe(true);
    });

    it('should return false for very different strings', () => {
        expect(isSimilar('ankara', 'istanbul')).toBe(false);
        expect(isSimilar('abc', 'xyz')).toBe(false);
    });

    it('should handle single character strings', () => {
        expect(isSimilar('a', 'a')).toBe(true);
        expect(isSimilar('a', 'b')).toBe(false);
    });

    it('should handle empty strings', () => {
        expect(isSimilar('', '')).toBe(true);
    });

    it('should respect custom threshold', () => {
        // "ankara" vs "ankra" - distance 1, maxLen 6, similarity 0.833
        expect(isSimilar('ankara', 'ankra', 0.9)).toBe(false); // strict
        expect(isSimilar('ankara', 'ankra', 0.7)).toBe(true);  // lenient
    });
});

describe('GradingService - groupAnswers', () => {
    const correctKeys = ['Ankara', 'ankara'];

    it('should group exact match as correct', () => {
        const answers = [
            { id: 1, answer_text: 'Ankara', name: 'P1' }
        ];

        const groups = groupAnswers(answers, correctKeys);

        expect(groups.correct).toHaveLength(1);
        expect(groups.incorrect).toHaveLength(0);
    });

    it('should group case-insensitive match as correct', () => {
        const answers = [
            { id: 1, answer_text: 'ANKARA', name: 'P1' },
            { id: 2, answer_text: 'ankara', name: 'P2' }
        ];

        const groups = groupAnswers(answers, correctKeys);

        expect(groups.correct).toHaveLength(2);
    });

    it('should group wrong answers as incorrect', () => {
        const answers = [
            { id: 1, answer_text: 'İstanbul', name: 'P1' },
            { id: 2, answer_text: 'İzmir', name: 'P2' }
        ];

        const groups = groupAnswers(answers, correctKeys);

        expect(groups.incorrect).toHaveLength(2);
        expect(groups.correct).toHaveLength(0);
    });

    it('should group empty answers separately', () => {
        const answers = [
            { id: 1, answer_text: '', name: 'P1' },
            { id: 2, answer_text: '  ', name: 'P2' },
            { id: 3, answer_text: null, name: 'P3' }
        ];

        const groups = groupAnswers(answers, correctKeys);

        expect(groups.empty).toHaveLength(3);
    });

    it('should group similar answers as correct', () => {
        const answers = [
            { id: 1, answer_text: 'Ankra', name: 'P1' } // typo
        ];

        const groups = groupAnswers(answers, correctKeys);

        expect(groups.correct).toHaveLength(1);
    });

    it('should handle mixed answers correctly', () => {
        const answers = [
            { id: 1, answer_text: 'Ankara', name: 'P1' },
            { id: 2, answer_text: 'İstanbul', name: 'P2' },
            { id: 3, answer_text: '', name: 'P3' },
            { id: 4, answer_text: 'ankra', name: 'P4' } // similar
        ];

        const groups = groupAnswers(answers, correctKeys);

        expect(groups.correct).toHaveLength(2); // Ankara + ankra
        expect(groups.incorrect).toHaveLength(1); // İstanbul
        expect(groups.empty).toHaveLength(1);
    });
});

describe('GradingService - createEmptyAnswers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should create empty answers for contestants who did not answer', async () => {
        db.getAnswersForQuestion.mockResolvedValue([
            { contestant_id: 1 }
        ]);
        db.getAllContestants.mockResolvedValue([
            { id: 1, status: 'ONLINE' },
            { id: 2, status: 'ONLINE' },
            { id: 3, status: 'OFFLINE' }
        ]);

        await createEmptyAnswers(10, 1);

        // Only contestant 2 should get an empty answer (3 is OFFLINE)
        expect(db.saveAnswersBulk).toHaveBeenCalledTimes(1);
        expect(db.saveAnswersBulk).toHaveBeenCalledWith(10, [2]);
    });

    it('should not create answers if everyone answered', async () => {
        db.getAnswersForQuestion.mockResolvedValue([
            { contestant_id: 1 },
            { contestant_id: 2 }
        ]);
        db.getAllContestants.mockResolvedValue([
            { id: 1, status: 'ONLINE' },
            { id: 2, status: 'ONLINE' }
        ]);

        await createEmptyAnswers(10, 1);

        expect(db.saveAnswersBulk).not.toHaveBeenCalled();
    });
});

describe('GradingService - autoGradeMultipleChoice', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should grade correct and incorrect answers in bulk', async () => {
        db.getAnswersForQuestion
            .mockResolvedValueOnce([]) // createEmptyAnswers check
            .mockResolvedValueOnce([   // grading pass
                { id: 1, answer_text: 'Ankara', contestant_id: 1 },
                { id: 2, answer_text: 'İstanbul', contestant_id: 2 },
                { id: 3, answer_text: '', contestant_id: 3 }
            ]);
        db.getAllContestants.mockResolvedValue([]);

        await autoGradeMultipleChoice(10, 1, ['Ankara'], 10);

        // Correct answers bulk graded
        expect(db.gradeAnswersBulk).toHaveBeenCalledWith([1], true, 10);
        // Incorrect + empty answers bulk graded
        expect(db.gradeAnswersBulk).toHaveBeenCalledWith([2, 3], false, 0);
    });
});

describe('GradingService - prepareJuryReview', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return grouped answers and bulk-grade empty ones', async () => {
        db.getAnswersForQuestion
            .mockResolvedValueOnce([]) // createEmptyAnswers
            .mockResolvedValueOnce([   // main fetch
                { id: 1, answer_text: 'Ankara', contestant_id: 1 },
                { id: 2, answer_text: '', contestant_id: 2 },
                { id: 3, answer_text: 'İstanbul', contestant_id: 3 }
            ]);
        db.getAllContestants.mockResolvedValue([]);

        const result = await prepareJuryReview(10, 1, 'Başkent?', ['Ankara'], 10);

        expect(result.questionId).toBe(10);
        expect(result.emptyCount).toBe(1);
        expect(result.groups.correct).toHaveLength(1);
        expect(result.groups.incorrect).toHaveLength(1);
        expect(db.gradeAnswersBulk).toHaveBeenCalledWith([2], false, 0);
    });
});
