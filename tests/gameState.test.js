/**
 * GameState Tests - State Machine, Answer Submission, Scoring
 */

// Mock database before requiring GameState
jest.mock('../database/postgres', () => ({
    updateSessionState: jest.fn().mockResolvedValue(),
    getQuestionById: jest.fn(),
    getAllQuestions: jest.fn().mockResolvedValue([]),
    getAnswersForQuestion: jest.fn().mockResolvedValue([]),
    getAllContestants: jest.fn().mockResolvedValue([]),
    saveAnswer: jest.fn().mockResolvedValue({ success: true }),
    gradeAnswer: jest.fn().mockResolvedValue(),
    gradeAnswersBulk: jest.fn().mockResolvedValue(),
    getLeaderboard: jest.fn().mockResolvedValue([]),
    getSetting: jest.fn().mockResolvedValue('AUTO'),
    getRandomQuote: jest.fn().mockResolvedValue({ text: 'Test', author: 'Author' }),
    resetAllContestants: jest.fn().mockResolvedValue()
}));

const db = require('../database/postgres');
const { GameState } = require('../src/state/gameState');

// Helper: create fresh GameState with mock IO
function createGameState() {
    const gs = new GameState(1);
    gs.io = {
        emit: jest.fn(),
        to: jest.fn().mockReturnValue({ emit: jest.fn() })
    };
    return gs;
}

// Helper: mock question
const mockQuestion = {
    id: 1,
    content: 'Türkiyenin başkenti neresidir?',
    type: 'MULTIPLE_CHOICE',
    options: ['İstanbul', 'Ankara', 'İzmir', 'Bursa'],
    correct_keys: ['Ankara'],
    points: 10,
    duration: 30,
    category: 'Coğrafya',
    media_url: null
};

describe('GameState - State Machine', () => {
    let gs;

    beforeEach(() => {
        jest.clearAllMocks();
        gs = createGameState();
    });

    afterEach(() => {
        // Clear any timers
        if (gs.timer) clearInterval(gs.timer);
    });

    it('should start in IDLE state', () => {
        expect(gs.state).toBe('IDLE');
    });

    it('should return correct state object', () => {
        const state = gs.getState();

        expect(state).toEqual({
            competitionId: 1,
            state: 'IDLE',
            currentQuestion: null,
            timeRemaining: 0,
            answeredPlayers: []
        });
    });

    it('should transition IDLE -> QUESTION_ACTIVE', async () => {
        await gs.setState('QUESTION_ACTIVE');

        expect(gs.state).toBe('QUESTION_ACTIVE');
        expect(db.updateSessionState).toHaveBeenCalledWith('QUESTION_ACTIVE', null);
        expect(gs.io.emit).toHaveBeenCalledWith('GAME_STATE', expect.any(Object));
    });

    it('should allow valid transition chain IDLE -> QUESTION_ACTIVE -> LOCKED -> GRADING -> REVEAL -> IDLE', async () => {
        await gs.setState('QUESTION_ACTIVE');
        expect(gs.state).toBe('QUESTION_ACTIVE');

        await gs.setState('LOCKED');
        expect(gs.state).toBe('LOCKED');

        await gs.setState('GRADING');
        expect(gs.state).toBe('GRADING');

        await gs.setState('REVEAL');
        expect(gs.state).toBe('REVEAL');

        await gs.setState('IDLE');
        expect(gs.state).toBe('IDLE');
    });

    it('should allow LOCKED -> REVEAL (skip grading for MC questions)', async () => {
        await gs.setState('QUESTION_ACTIVE');
        await gs.setState('LOCKED');
        await gs.setState('REVEAL');

        expect(gs.state).toBe('REVEAL');
    });

    it('should warn but allow invalid transition', async () => {
        const spy = jest.spyOn(console, 'warn').mockImplementation();

        await gs.setState('GRADING'); // IDLE -> GRADING is invalid

        expect(spy).toHaveBeenCalledWith(expect.stringContaining('Geçersiz geçiş'));
        // Still transitions (current behavior - warn but allow)
        expect(gs.state).toBe('GRADING');

        spy.mockRestore();
    });

    it('should broadcast state change to all clients', async () => {
        await gs.setState('QUESTION_ACTIVE');

        expect(gs.io.emit).toHaveBeenCalledWith('GAME_STATE', expect.objectContaining({
            state: 'QUESTION_ACTIVE'
        }));
    });
});

describe('GameState - Start Question', () => {
    let gs;

    beforeEach(() => {
        jest.clearAllMocks();
        gs = createGameState();
        db.getQuestionById.mockResolvedValue(mockQuestion);
        db.getAllQuestions.mockResolvedValue([mockQuestion]);
    });

    afterEach(() => {
        if (gs.timer) clearInterval(gs.timer);
    });

    it('should set current question and transition to QUESTION_ACTIVE', async () => {
        await gs.startQuestion(1);

        expect(gs.state).toBe('QUESTION_ACTIVE');
        expect(gs.currentQuestion).toBeDefined();
        expect(gs.currentQuestion.id).toBe(1);
        expect(gs.currentQuestion.content).toBe(mockQuestion.content);
        expect(gs.timeRemaining).toBe(30);
    });

    it('should throw if question not found', async () => {
        db.getQuestionById.mockResolvedValue(null);

        await expect(gs.startQuestion(999)).rejects.toThrow('Soru bulunamadı');
    });

    it('should clear previous timer when starting new question', async () => {
        await gs.startQuestion(1);
        const firstTimer = gs.timer;

        db.getQuestionById.mockResolvedValue({ ...mockQuestion, id: 2 });
        db.getAllQuestions.mockResolvedValue([mockQuestion, { ...mockQuestion, id: 2 }]);
        await gs.startQuestion(2);

        expect(gs.timer).not.toBe(firstTimer);
    });

    it('should send question to players without correct_keys', async () => {
        await gs.startQuestion(1);

        const playerEmit = gs.io.to.mock.results.find(
            (_, i) => gs.io.to.mock.calls[i][0] === 'player'
        );

        expect(gs.io.to).toHaveBeenCalledWith('player');

        // Find the NEW_QUESTION call to player
        const playerCalls = gs.io.to.mock.calls;
        const playerIdx = playerCalls.findIndex(c => c[0] === 'player');
        const emitMock = gs.io.to.mock.results[playerIdx].value.emit;
        const questionData = emitMock.mock.calls[0][1];

        expect(questionData).not.toHaveProperty('correct_keys');
        expect(questionData).toHaveProperty('content');
        expect(questionData).toHaveProperty('options');
    });

    it('should send correct_keys to jury', async () => {
        // Track each to() call with its own emit mock
        const roomEmits = {};
        gs.io.to = jest.fn((room) => {
            const emitFn = jest.fn();
            if (!roomEmits[room]) roomEmits[room] = [];
            roomEmits[room].push(emitFn);
            return { emit: emitFn };
        });

        await gs.startQuestion(1);

        expect(roomEmits['jury']).toBeDefined();
        const juryEmit = roomEmits['jury'][0];
        const questionData = juryEmit.mock.calls[0][1];

        expect(questionData).toHaveProperty('correct_keys');
        expect(questionData.correct_keys).toEqual(['Ankara']);
    });

    it('should clear answered players on new question', async () => {
        gs.answeredPlayers.add(1);
        gs.answeredPlayers.add(2);

        await gs.startQuestion(1);

        expect(gs.answeredPlayers.size).toBe(0);
    });
});

describe('GameState - Submit Answer', () => {
    let gs;

    beforeEach(async () => {
        jest.clearAllMocks();
        gs = createGameState();
        db.getQuestionById.mockResolvedValue(mockQuestion);
        db.getAllQuestions.mockResolvedValue([mockQuestion]);
        await gs.startQuestion(1);
        // Stop timer to avoid interference
        if (gs.timer) { clearInterval(gs.timer); gs.timer = null; }
    });

    it('should accept answer when QUESTION_ACTIVE', async () => {
        const result = await gs.submitAnswer(1, 'Ankara', 25);

        expect(result.success).toBe(true);
        expect(db.saveAnswer).toHaveBeenCalledWith(1, 1, 'Ankara', 25);
        expect(gs.answeredPlayers.has(1)).toBe(true);
    });

    it('should reject duplicate answer from same contestant', async () => {
        await gs.submitAnswer(1, 'Ankara', 25);
        const result = await gs.submitAnswer(1, 'İstanbul', 20);

        expect(result.success).toBe(false);
        expect(result.message).toBe('Zaten cevap verildi');
    });

    it('should reject answer when not QUESTION_ACTIVE', async () => {
        await gs.setState('LOCKED');

        const result = await gs.submitAnswer(1, 'Ankara', 25);

        expect(result.success).toBe(false);
        expect(result.message).toBe('Cevap kabul edilmiyor');
    });

    it('should reject answer when no active question', async () => {
        gs.currentQuestion = null;

        const result = await gs.submitAnswer(1, 'Ankara', 25);

        expect(result.success).toBe(false);
        expect(result.message).toBe('Aktif soru yok');
    });

    it('should broadcast PLAYER_STATUS_UPDATE on successful answer', async () => {
        await gs.submitAnswer(1, 'Ankara', 25);

        expect(gs.io.emit).toHaveBeenCalledWith('PLAYER_STATUS_UPDATE', {
            contestantId: 1,
            status: 'answered'
        });
    });

    it('should accept answers from multiple contestants', async () => {
        await gs.submitAnswer(1, 'Ankara', 25);
        await gs.submitAnswer(2, 'İstanbul', 20);
        await gs.submitAnswer(3, 'Ankara', 15);

        expect(gs.answeredPlayers.size).toBe(3);
        expect(db.saveAnswer).toHaveBeenCalledTimes(3);
    });
});

describe('GameState - isSimilar (Levenshtein)', () => {
    let gs;

    beforeEach(() => {
        gs = createGameState();
    });

    it('should return true for identical strings', () => {
        expect(gs.isSimilar('ankara', 'ankara')).toBe(true);
    });

    it('should return true for very similar strings', () => {
        expect(gs.isSimilar('ankara', 'ankra')).toBe(true); // 1 char missing
        expect(gs.isSimilar('atatürk', 'atatürk')).toBe(true);
    });

    it('should return false for very different strings', () => {
        expect(gs.isSimilar('ankara', 'istanbul')).toBe(false);
        expect(gs.isSimilar('abc', 'xyz')).toBe(false);
    });

    it('should handle single character strings', () => {
        expect(gs.isSimilar('a', 'a')).toBe(true);
        expect(gs.isSimilar('a', 'b')).toBe(false);
    });

    it('should handle empty strings', () => {
        expect(gs.isSimilar('', '')).toBe(true);
    });

    it('should respect custom threshold', () => {
        // "ankara" vs "ankra" - distance 1, maxLen 6, similarity 0.833
        expect(gs.isSimilar('ankara', 'ankra', 0.9)).toBe(false); // strict
        expect(gs.isSimilar('ankara', 'ankra', 0.7)).toBe(true);  // lenient
    });
});

describe('GameState - groupAnswers', () => {
    let gs;

    beforeEach(() => {
        gs = createGameState();
        gs.currentQuestion = {
            correct_keys: ['Ankara', 'ankara']
        };
    });

    it('should group exact match as correct', () => {
        const answers = [
            { id: 1, answer_text: 'Ankara', name: 'P1' }
        ];

        const groups = gs.groupAnswers(answers);

        expect(groups.correct).toHaveLength(1);
        expect(groups.incorrect).toHaveLength(0);
    });

    it('should group case-insensitive match as correct', () => {
        const answers = [
            { id: 1, answer_text: 'ANKARA', name: 'P1' },
            { id: 2, answer_text: 'ankara', name: 'P2' }
        ];

        const groups = gs.groupAnswers(answers);

        expect(groups.correct).toHaveLength(2);
    });

    it('should group wrong answers as incorrect', () => {
        const answers = [
            { id: 1, answer_text: 'İstanbul', name: 'P1' },
            { id: 2, answer_text: 'İzmir', name: 'P2' }
        ];

        const groups = gs.groupAnswers(answers);

        expect(groups.incorrect).toHaveLength(2);
        expect(groups.correct).toHaveLength(0);
    });

    it('should group empty answers separately', () => {
        const answers = [
            { id: 1, answer_text: '', name: 'P1' },
            { id: 2, answer_text: '  ', name: 'P2' },
            { id: 3, answer_text: null, name: 'P3' }
        ];

        const groups = gs.groupAnswers(answers);

        expect(groups.empty).toHaveLength(3);
    });

    it('should group similar answers as correct', () => {
        const answers = [
            { id: 1, answer_text: 'Ankra', name: 'P1' } // typo
        ];

        const groups = gs.groupAnswers(answers);

        expect(groups.correct).toHaveLength(1);
    });

    it('should handle mixed answers correctly', () => {
        const answers = [
            { id: 1, answer_text: 'Ankara', name: 'P1' },
            { id: 2, answer_text: 'İstanbul', name: 'P2' },
            { id: 3, answer_text: '', name: 'P3' },
            { id: 4, answer_text: 'ankra', name: 'P4' } // similar
        ];

        const groups = gs.groupAnswers(answers);

        expect(groups.correct).toHaveLength(2); // Ankara + ankra
        expect(groups.incorrect).toHaveLength(1); // İstanbul
        expect(groups.empty).toHaveLength(1);
    });
});

describe('GameState - goToIdle & resetGame', () => {
    let gs;

    beforeEach(async () => {
        jest.clearAllMocks();
        gs = createGameState();
        db.getQuestionById.mockResolvedValue(mockQuestion);
        db.getAllQuestions.mockResolvedValue([mockQuestion]);
    });

    it('should reset all state on goToIdle', async () => {
        await gs.startQuestion(1);
        if (gs.timer) { clearInterval(gs.timer); gs.timer = null; }
        gs.answeredPlayers.add(1);

        await gs.goToIdle();

        expect(gs.state).toBe('IDLE');
        expect(gs.currentQuestion).toBeNull();
        expect(gs.timeRemaining).toBe(0);
        expect(gs.answeredPlayers.size).toBe(0);
    });

    it('should broadcast GAME_RESET on resetGame', async () => {
        await gs.resetGame();

        expect(gs.state).toBe('IDLE');
        expect(db.resetAllContestants).toHaveBeenCalled();
        expect(gs.io.emit).toHaveBeenCalledWith('GAME_RESET');
    });
});
