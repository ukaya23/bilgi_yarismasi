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

import type { Server } from 'socket.io';
import db from '../../database/postgres';
import log from '../utils/logger';
import { GameTimer } from './gameTimer';
import * as gradingService from './gradingService';
import { RevealManager } from './revealManager';
import type { GamePhase, Question } from '../types';

export interface CurrentQuestion extends Question {
    index: number;
    total: number;
}

interface JuryGrade {
    answerId: number;
    isCorrect: boolean;
    points: number;
}

const VALID_TRANSITIONS: Record<GamePhase, GamePhase[]> = {
    'IDLE': ['QUESTION_ACTIVE'],
    'QUESTION_ACTIVE': ['LOCKED'],
    'LOCKED': ['GRADING', 'REVEAL'],
    'GRADING': ['REVEAL'],
    'REVEAL': ['IDLE', 'QUESTION_ACTIVE']
};

export class GameState {
    competitionId: number;
    state: GamePhase;
    currentQuestion: CurrentQuestion | null;
    questionStartTime: number | null;
    questions: Question[];
    answeredPlayers: Set<number>;
    io: Server | null;
    gameTimer: GameTimer;
    revealManager: RevealManager;
    lastResults: any | null;

    constructor(competitionId: number = 1) {
        this.competitionId = competitionId;
        this.state = 'IDLE';
        this.currentQuestion = null;
        this.questionStartTime = null;
        this.questions = [];
        this.answeredPlayers = new Set();
        this.io = null;
        this.lastResults = null;

        this.gameTimer = new GameTimer();
        this.revealManager = new RevealManager();
    }

    setIO(io: Server): void {
        this.io = io;
    }

    /** Broadcast to all sockets in this competition */
    private broadcast(event: string, data: any): void {
        if (this.io) this.io.to(`comp-${this.competitionId}`).emit(event, data);
    }

    /** Log event and broadcast to admin activity feed */
    private async logActivity(entry: Parameters<typeof db.logAndReturnEvent>[0]): Promise<void> {
        const event = await db.logAndReturnEvent(entry);
        if (event && this.io) this.io.to('admin').emit('ACTIVITY_EVENT', event);
    }

    get timeRemaining(): number {
        return this.gameTimer.timeRemaining;
    }

    hasPlayerAnswered(contestantId: number): boolean {
        return this.answeredPlayers.has(contestantId);
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

    async setState(newState: GamePhase): Promise<void> {
        const allowed = VALID_TRANSITIONS[this.state];
        if (allowed && !allowed.includes(newState)) {
            log.warn({ from: this.state, to: newState }, 'Gecersiz state gecisi');
        }

        this.state = newState;
        await db.updateSessionState(newState, this.currentQuestion?.id || null);

        this.broadcast('GAME_STATE', this.getState());

        log.info({ state: newState }, 'Durum degisti');
    }

    async startQuestion(questionId: number): Promise<void> {
        const question = await db.getQuestionById(questionId);
        if (!question) {
            throw new Error('Soru bulunamadi');
        }

        this.gameTimer.stop();

        const allQuestions = await db.getAllQuestions();
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

        this.broadcast('NEW_QUESTION', {
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

        // Jury gets correct_keys too
        if (this.io) {
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

            const quote = await db.getRandomQuote();
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

        this.logActivity({
            eventType: 'QUESTION_STARTED',
            actorType: 'system',
            competitionId: this.competitionId,
            questionId: question.id,
            payload: { content: question.content, type: question.type, points: question.points, duration: question.duration }
        });

        this.gameTimer.start(
            question.duration,
            (timeRemaining: number) => {
                if (this.io) {
                    this.broadcast('TIME_SYNC', {
                        timeRemaining,
                        serverTime: Date.now()
                    });
                }
            },
            () => this.lockQuestion()
        );
    }

    async lockQuestion(): Promise<void> {
        this.gameTimer.clear();

        await this.setState('LOCKED');

        if (this.currentQuestion && this.currentQuestion.type === 'OPEN_ENDED') {
            setTimeout(async () => {
                await this.startGrading();
            }, 1000);
        } else {
            await gradingService.autoGradeMultipleChoice(
                this.currentQuestion!.id,
                this.competitionId,
                this.currentQuestion!.correct_keys,
                this.currentQuestion!.points
            );

            setTimeout(async () => {
                await this.showResults();
            }, 500);
        }
    }

    async startGrading(): Promise<void> {
        await this.setState('GRADING');

        if (!this.currentQuestion || !this.io) return;

        const reviewData = await gradingService.prepareJuryReview(
            this.currentQuestion.id,
            this.competitionId,
            this.currentQuestion.content,
            this.currentQuestion.correct_keys,
            this.currentQuestion.points
        );

        this.broadcast('JURY_REVIEW_DATA', reviewData);

        this.broadcast('GRADING_STATUS', {
            message: 'Juri Degerlendirmesi Suruyor...'
        });
    }

    async submitAnswer(contestantId: number, answerText: string, timeRemaining?: number): Promise<{ success: boolean; message?: string; id?: number }> {
        if (this.state !== 'QUESTION_ACTIVE') {
            return { success: false, message: 'Cevap kabul edilmiyor' };
        }

        if (!this.currentQuestion) {
            return { success: false, message: 'Aktif soru yok' };
        }

        if (this.answeredPlayers.has(contestantId)) {
            return { success: false, message: 'Zaten cevap verildi' };
        }

        const result = await db.saveAnswer(
            this.currentQuestion.id,
            contestantId,
            answerText,
            timeRemaining || this.gameTimer.timeRemaining
        );

        if (result.success) {
            this.answeredPlayers.add(contestantId);

            this.logActivity({
                eventType: 'ANSWER_SUBMITTED',
                actorType: 'player',
                actorId: contestantId,
                competitionId: this.competitionId,
                questionId: this.currentQuestion.id,
                payload: { timeRemaining: timeRemaining || this.gameTimer.timeRemaining }
            });

            if (this.io) {
                this.broadcast('PLAYER_STATUS_UPDATE', {
                    contestantId,
                    status: 'answered'
                });
            }
        }

        return result;
    }

    async applyJuryGrades(grades: JuryGrade[]): Promise<void> {
        for (const grade of grades) {
            await db.gradeAnswer(grade.answerId, grade.isCorrect, grade.points);
        }

        this.logActivity({
            eventType: 'JURY_GRADED',
            actorType: 'jury',
            competitionId: this.competitionId,
            questionId: this.currentQuestion?.id,
            payload: { gradesCount: grades.length, correctCount: grades.filter(g => g.isCorrect).length }
        });
    }

    async showResults(): Promise<void> {
        await this.setState('REVEAL');
        this.revealManager.reset();

        if (!this.currentQuestion || !this.io) return;

        const answers = await db.getAnswersForQuestion(this.currentQuestion.id, this.competitionId);
        const leaderboard = await db.getLeaderboard(this.competitionId);
        const controlMode = await db.getSetting('screen_control_mode') || 'AUTO';

        this.lastResults = {
            question: {
                content: this.currentQuestion.content,
                correctAnswer: this.currentQuestion.correct_keys[0] || '',
                points: this.currentQuestion.points,
                media_url: this.currentQuestion.media_url
            },
            answers: answers,
            leaderboard: leaderboard,
            mode: controlMode
        };

        this.broadcast('SHOW_RESULTS', this.lastResults);

        if (controlMode === 'MANUAL') {
            this.revealManager.notifyAdmin(this.io, 0);
        }
    }

    nextRevealStep(): void {
        if (this.state !== 'REVEAL') return;
        this.revealManager.nextStep(this.io!);
    }

    async goToIdle(): Promise<void> {
        this.gameTimer.stop();

        this.currentQuestion = null;
        this.questionStartTime = null;
        this.answeredPlayers.clear();
        this.lastResults = null;

        await this.setState('IDLE');
    }

    stopTimer(): void {
        this.gameTimer.stop();
    }

    async resetGame(): Promise<void> {
        this.logActivity({
            eventType: 'GAME_RESET',
            actorType: 'admin',
            competitionId: this.competitionId,
        });

        await this.goToIdle();
        await db.resetAllContestants(this.competitionId);

        if (this.io) {
            this.broadcast('GAME_RESET', {});
            const updatedContestants = await db.getAllContestants(this.competitionId);
            const updatedLeaderboard = await db.getLeaderboard(this.competitionId);
            this.broadcast('CONTESTANTS_UPDATED', updatedContestants);
            this.broadcast('LEADERBOARD_UPDATED', updatedLeaderboard);
        }

        log.info({ competitionId: this.competitionId }, 'Oyun sifirlandi');
    }
}
