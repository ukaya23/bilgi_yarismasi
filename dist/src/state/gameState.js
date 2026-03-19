"use strict";
/**
 * Oyun Durumu Yonetimi (State Machine)
 *
 * Durumlar: IDLE → QUESTION_ACTIVE → LOCKED → GRADING → REVEAL
 *
 * Sorumluluklar dagitimi:
 * - GameTimer: Zamanlayici yonetimi
 * - GradingService: Puanlama ve cevap gruplama
 * - RevealManager: Sonuc gosterim adimlari
 * - GameState: State machine, orkestrasyon, cevap gonderimi
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameState = void 0;
const postgres_1 = __importDefault(require("../../database/postgres"));
const logger_1 = __importDefault(require("../utils/logger"));
const gameTimer_1 = require("./gameTimer");
const gradingService = __importStar(require("./gradingService"));
const revealManager_1 = require("./revealManager");
const VALID_TRANSITIONS = {
    'IDLE': ['QUESTION_ACTIVE'],
    'QUESTION_ACTIVE': ['LOCKED'],
    'LOCKED': ['GRADING', 'REVEAL'],
    'GRADING': ['REVEAL'],
    'REVEAL': ['IDLE', 'QUESTION_ACTIVE']
};
class GameState {
    constructor(competitionId = 1) {
        this.competitionId = competitionId;
        this.state = 'IDLE';
        this.currentQuestion = null;
        this.questionStartTime = null;
        this.questions = [];
        this.answeredPlayers = new Set();
        this.io = null;
        this.gameTimer = new gameTimer_1.GameTimer();
        this.revealManager = new revealManager_1.RevealManager();
    }
    setIO(io) {
        this.io = io;
    }
    get timeRemaining() {
        return this.gameTimer.timeRemaining;
    }
    getState() {
        return {
            competitionId: this.competitionId,
            state: this.state,
            currentQuestion: this.currentQuestion,
            timeRemaining: this.gameTimer.timeRemaining,
            answeredPlayers: Array.from(this.answeredPlayers)
        };
    }
    async setState(newState) {
        const allowed = VALID_TRANSITIONS[this.state];
        if (allowed && !allowed.includes(newState)) {
            logger_1.default.warn({ from: this.state, to: newState }, 'Gecersiz state gecisi');
        }
        this.state = newState;
        await postgres_1.default.updateSessionState(newState, this.currentQuestion?.id || null);
        if (this.io) {
            this.io.emit('GAME_STATE', this.getState());
        }
        logger_1.default.info({ state: newState }, 'Durum degisti');
    }
    async startQuestion(questionId) {
        const question = await postgres_1.default.getQuestionById(questionId);
        if (!question) {
            throw new Error('Soru bulunamadi');
        }
        this.gameTimer.stop();
        const allQuestions = await postgres_1.default.getAllQuestions();
        const questionIndex = allQuestions.findIndex(q => q.id === question.id) + 1;
        const totalQuestions = allQuestions.length;
        this.currentQuestion = {
            ...question,
            options: question.options || null,
            correct_keys: question.correct_keys || [],
            index: questionIndex,
            total: totalQuestions
        };
        this.questionStartTime = Date.now();
        this.answeredPlayers.clear();
        await this.setState('QUESTION_ACTIVE');
        if (this.io) {
            this.io.to('player').emit('NEW_QUESTION', {
                id: this.currentQuestion.id,
                content: this.currentQuestion.content,
                type: this.currentQuestion.type,
                options: this.currentQuestion.options,
                points: this.currentQuestion.points,
                duration: this.currentQuestion.duration,
                media_url: this.currentQuestion.media_url,
                index: questionIndex,
                total: totalQuestions
            });
            this.io.to('jury').emit('NEW_QUESTION', {
                id: this.currentQuestion.id,
                content: this.currentQuestion.content,
                type: this.currentQuestion.type,
                options: this.currentQuestion.options,
                correct_keys: this.currentQuestion.correct_keys,
                points: this.currentQuestion.points,
                duration: this.currentQuestion.duration,
                index: questionIndex,
                total: totalQuestions
            });
            const quote = await postgres_1.default.getRandomQuote();
            this.io.to('screen').emit('MASKED_QUESTION', {
                category: this.currentQuestion.category || 'Genel Kultur',
                points: this.currentQuestion.points,
                duration: this.currentQuestion.duration,
                quote: quote,
                index: questionIndex,
                total: totalQuestions,
                media_url: this.currentQuestion.media_url
            });
        }
        this.gameTimer.start(question.duration, (timeRemaining) => {
            if (this.io) {
                this.io.emit('TIME_SYNC', {
                    timeRemaining,
                    serverTime: Date.now()
                });
            }
        }, () => this.lockQuestion());
    }
    async lockQuestion() {
        this.gameTimer.clear();
        await this.setState('LOCKED');
        if (this.currentQuestion && this.currentQuestion.type === 'OPEN_ENDED') {
            setTimeout(async () => {
                await this.startGrading();
            }, 1000);
        }
        else {
            await gradingService.autoGradeMultipleChoice(this.currentQuestion.id, this.competitionId, this.currentQuestion.correct_keys, this.currentQuestion.points);
            setTimeout(async () => {
                await this.showResults();
            }, 500);
        }
    }
    async startGrading() {
        await this.setState('GRADING');
        if (!this.currentQuestion || !this.io)
            return;
        const reviewData = await gradingService.prepareJuryReview(this.currentQuestion.id, this.competitionId, this.currentQuestion.content, this.currentQuestion.correct_keys, this.currentQuestion.points);
        this.io.to('jury').emit('JURY_REVIEW_DATA', reviewData);
        this.io.to('screen').emit('GRADING_STATUS', {
            message: 'Juri Degerlendirmesi Suruyor...'
        });
    }
    async submitAnswer(contestantId, answerText, timeRemaining) {
        if (this.state !== 'QUESTION_ACTIVE') {
            return { success: false, message: 'Cevap kabul edilmiyor' };
        }
        if (!this.currentQuestion) {
            return { success: false, message: 'Aktif soru yok' };
        }
        if (this.answeredPlayers.has(contestantId)) {
            return { success: false, message: 'Zaten cevap verildi' };
        }
        const result = await postgres_1.default.saveAnswer(this.currentQuestion.id, contestantId, answerText, timeRemaining || this.gameTimer.timeRemaining);
        if (result.success) {
            this.answeredPlayers.add(contestantId);
            if (this.io) {
                this.io.emit('PLAYER_STATUS_UPDATE', {
                    contestantId,
                    status: 'answered'
                });
            }
        }
        return result;
    }
    async applyJuryGrades(grades) {
        for (const grade of grades) {
            await postgres_1.default.gradeAnswer(grade.answerId, grade.isCorrect, grade.points);
        }
    }
    async showResults() {
        await this.setState('REVEAL');
        this.revealManager.reset();
        if (!this.currentQuestion || !this.io)
            return;
        const answers = await postgres_1.default.getAnswersForQuestion(this.currentQuestion.id, this.competitionId);
        const leaderboard = await postgres_1.default.getLeaderboard(this.competitionId);
        const controlMode = await postgres_1.default.getSetting('screen_control_mode') || 'AUTO';
        this.io.emit('SHOW_RESULTS', {
            question: {
                content: this.currentQuestion.content,
                correctAnswer: this.currentQuestion.correct_keys[0] || '',
                points: this.currentQuestion.points,
                media_url: this.currentQuestion.media_url
            },
            answers: answers,
            leaderboard: leaderboard,
            mode: controlMode
        });
        if (controlMode === 'MANUAL') {
            this.revealManager.notifyAdmin(this.io, 0);
        }
    }
    nextRevealStep() {
        if (this.state !== 'REVEAL')
            return;
        this.revealManager.nextStep(this.io);
    }
    async goToIdle() {
        this.gameTimer.stop();
        this.currentQuestion = null;
        this.questionStartTime = null;
        this.answeredPlayers.clear();
        await this.setState('IDLE');
    }
    stopTimer() {
        this.gameTimer.stop();
    }
    async resetGame() {
        await this.goToIdle();
        await postgres_1.default.resetAllContestants(this.competitionId);
        if (this.io) {
            this.io.emit('GAME_RESET');
            const updatedContestants = await postgres_1.default.getAllContestants(this.competitionId);
            const updatedLeaderboard = await postgres_1.default.getLeaderboard(this.competitionId);
            this.io.emit('CONTESTANTS_UPDATED', updatedContestants);
            this.io.emit('LEADERBOARD_UPDATED', updatedLeaderboard);
        }
        logger_1.default.info({ competitionId: this.competitionId }, 'Oyun sifirlandi');
    }
}
exports.GameState = GameState;
//# sourceMappingURL=gameState.js.map