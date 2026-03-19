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
import { GameTimer } from './gameTimer';
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
export declare class GameState {
    competitionId: number;
    state: GamePhase;
    currentQuestion: CurrentQuestion | null;
    questionStartTime: number | null;
    questions: Question[];
    answeredPlayers: Set<number>;
    io: Server | null;
    gameTimer: GameTimer;
    revealManager: RevealManager;
    constructor(competitionId?: number);
    setIO(io: Server): void;
    get timeRemaining(): number;
    getState(): {
        competitionId: number;
        state: GamePhase;
        currentQuestion: CurrentQuestion | null;
        timeRemaining: number;
        answeredPlayers: number[];
    };
    setState(newState: GamePhase): Promise<void>;
    startQuestion(questionId: number): Promise<void>;
    lockQuestion(): Promise<void>;
    startGrading(): Promise<void>;
    submitAnswer(contestantId: number, answerText: string, timeRemaining?: number): Promise<{
        success: boolean;
        message?: string;
        id?: number;
    }>;
    applyJuryGrades(grades: JuryGrade[]): Promise<void>;
    showResults(): Promise<void>;
    nextRevealStep(): void;
    goToIdle(): Promise<void>;
    stopTimer(): void;
    resetGame(): Promise<void>;
}
export {};
//# sourceMappingURL=gameState.d.ts.map