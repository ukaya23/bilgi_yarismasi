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
    resetAllContestants: jest.fn().mockResolvedValue(),
    logEvent: jest.fn().mockResolvedValue()
}));

jest.mock('../src/state/gradingService', () => ({
    autoGradeMultipleChoice: jest.fn().mockResolvedValue(),
    prepareJuryReview: jest.fn().mockResolvedValue({
        questionId: 1, questionContent: 'Test', correctKeys: ['A'],
        points: 10, groups: { correct: [], incorrect: [], empty: [] }, emptyCount: 0
    }),
    isSimilar: jest.fn(),
    groupAnswers: jest.fn(),
    createEmptyAnswers: jest.fn().mockResolvedValue()
}));

const db = require('../database/postgres');
const { GameState } = require('../src/state/gameState');
// GameState now exports { GameState } class - no singleton

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
        gs.gameTimer.stop();
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
        // broadcast() uses io.to('comp-1').emit(...)
        expect(gs.io.to).toHaveBeenCalledWith('comp-1');
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
        const logModule = require('../src/utils/logger');
        const log = logModule.default || logModule;
        const spy = jest.spyOn(log, 'warn').mockImplementation();

        await gs.setState('GRADING'); // IDLE -> GRADING is invalid

        expect(spy).toHaveBeenCalledWith(
            expect.objectContaining({ from: 'IDLE', to: 'GRADING' }),
            expect.stringContaining('Gecersiz state gecisi')
        );
        // Still transitions (current behavior - warn but allow)
        expect(gs.state).toBe('GRADING');

        spy.mockRestore();
    });

    it('should broadcast state change to competition room', async () => {
        await gs.setState('QUESTION_ACTIVE');

        expect(gs.io.to).toHaveBeenCalledWith('comp-1');
        const roomEmit = gs.io.to.mock.results[0].value.emit;
        expect(roomEmit).toHaveBeenCalledWith('GAME_STATE', expect.objectContaining({
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
        gs.gameTimer.stop();
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

        await expect(gs.startQuestion(999)).rejects.toThrow('Soru bulunamadi');
    });

    it('should clear previous timer when starting new question', async () => {
        await gs.startQuestion(1);
        const firstTimer = gs.gameTimer.timer;

        db.getQuestionById.mockResolvedValue({ ...mockQuestion, id: 2 });
        db.getAllQuestions.mockResolvedValue([mockQuestion, { ...mockQuestion, id: 2 }]);
        await gs.startQuestion(2);

        expect(gs.gameTimer.timer).not.toBe(firstTimer);
    });

    it('should send question to competition room without correct_keys', async () => {
        const roomEmits = {};
        gs.io.to = jest.fn((room) => {
            const emitFn = jest.fn();
            if (!roomEmits[room]) roomEmits[room] = [];
            roomEmits[room].push(emitFn);
            return { emit: emitFn };
        });

        await gs.startQuestion(1);

        // NEW_QUESTION is broadcast to comp-1 (competition room)
        expect(roomEmits['comp-1']).toBeDefined();
        const compEmits = roomEmits['comp-1'];
        const newQuestionEmit = compEmits.find(emitFn =>
            emitFn.mock.calls.some(c => c[0] === 'NEW_QUESTION')
        );
        expect(newQuestionEmit).toBeDefined();
        const questionData = newQuestionEmit.mock.calls.find(c => c[0] === 'NEW_QUESTION')[1];

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
        gs.gameTimer.stop();
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
        const roomEmits = {};
        gs.io.to = jest.fn((room) => {
            const emitFn = jest.fn();
            if (!roomEmits[room]) roomEmits[room] = [];
            roomEmits[room].push(emitFn);
            return { emit: emitFn };
        });

        await gs.submitAnswer(1, 'Ankara', 25);

        expect(roomEmits['comp-1']).toBeDefined();
        const statusEmit = roomEmits['comp-1'].find(emitFn =>
            emitFn.mock.calls.some(c => c[0] === 'PLAYER_STATUS_UPDATE')
        );
        expect(statusEmit).toBeDefined();
        expect(statusEmit).toHaveBeenCalledWith('PLAYER_STATUS_UPDATE', {
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
        gs.gameTimer.stop();
        gs.answeredPlayers.add(1);

        await gs.goToIdle();

        expect(gs.state).toBe('IDLE');
        expect(gs.currentQuestion).toBeNull();
        expect(gs.timeRemaining).toBe(0);
        expect(gs.answeredPlayers.size).toBe(0);
    });

    it('should broadcast GAME_RESET on resetGame', async () => {
        const roomEmits = {};
        gs.io.to = jest.fn((room) => {
            const emitFn = jest.fn();
            if (!roomEmits[room]) roomEmits[room] = [];
            roomEmits[room].push(emitFn);
            return { emit: emitFn };
        });

        await gs.resetGame();

        expect(gs.state).toBe('IDLE');
        expect(db.resetAllContestants).toHaveBeenCalledWith(1);
        expect(roomEmits['comp-1']).toBeDefined();
        const resetEmit = roomEmits['comp-1'].find(emitFn =>
            emitFn.mock.calls.some(c => c[0] === 'GAME_RESET')
        );
        expect(resetEmit).toBeDefined();
    });
});

describe('GameState - Competition Isolation', () => {
    it('should delegate autoGrading with correct competitionId to gradingService', async () => {
        jest.clearAllMocks();
        const gradingService = require('../src/state/gradingService');
        const gs = new GameState(5);
        gs.io = { emit: jest.fn(), to: jest.fn().mockReturnValue({ emit: jest.fn() }) };

        db.getQuestionById.mockResolvedValue(mockQuestion);
        db.getAllQuestions.mockResolvedValue([mockQuestion]);
        db.getSetting.mockResolvedValue('AUTO');
        db.getLeaderboard.mockResolvedValue([]);
        db.getRandomQuote.mockResolvedValue({ text: 'Test', author: 'Author' });
        db.getAnswersForQuestion.mockResolvedValue([]);

        await gs.startQuestion(1);
        gs.gameTimer.stop();

        // Manually trigger lockQuestion (which calls autoGrade for MC)
        await gs.lockQuestion();

        // Verify gradingService was called with competitionId=5
        expect(gradingService.autoGradeMultipleChoice).toHaveBeenCalledWith(
            1, 5, ['Ankara'], 10
        );
    });

    it('should pass competitionId to resetAllContestants', async () => {
        jest.clearAllMocks();
        const gs = new GameState(3);
        gs.io = { emit: jest.fn(), to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
        db.resetAllContestants.mockResolvedValue();
        db.getAllContestants.mockResolvedValue([]);
        db.getLeaderboard.mockResolvedValue([]);

        await gs.resetGame();

        expect(db.resetAllContestants).toHaveBeenCalledWith(3);
        expect(db.getAllContestants).toHaveBeenCalledWith(3);
        expect(db.getLeaderboard).toHaveBeenCalledWith(3);
    });

    it('should use different competitionIds for separate GameState instances', () => {
        const gs1 = new GameState(1);
        const gs2 = new GameState(2);

        expect(gs1.competitionId).toBe(1);
        expect(gs2.competitionId).toBe(2);
        expect(gs1.getState().competitionId).toBe(1);
        expect(gs2.getState().competitionId).toBe(2);
    });
});
