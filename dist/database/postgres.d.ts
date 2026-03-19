/**
 * PostgreSQL Veritabanı Modülü
 */
import 'dotenv/config';
import { Pool } from 'pg';
import type { Question, Contestant, Answer, Competition, AccessCode, AdminUser, Quote, Setting, ValidationResult, GamePhase, ContestantStatus, CompetitionStatus } from '../src/types';
declare class PostgresDatabase {
    pool: Pool;
    constructor();
    initialize(): Promise<void>;
    close(): Promise<void>;
    getAllQuestions(): Promise<Question[]>;
    getQuestionById(id: number): Promise<Question | null>;
    addQuestion(question: Partial<Question>): Promise<number>;
    updateQuestion(id: number, question: Partial<Question>): Promise<number | null>;
    deleteQuestion(id: number): Promise<number | null>;
    getAllContestants(competitionId?: number | null): Promise<Contestant[]>;
    getContestantById(id: number): Promise<Contestant | null>;
    upsertContestant(name: string, tableNo: number, competitionId?: number): Promise<number>;
    updateContestantSocket(id: number, socketId: string): Promise<number | null>;
    updateContestantStatus(id: number, status: ContestantStatus): Promise<number | null>;
    updateContestantScore(id: number, pointsToAdd: number): Promise<number | null>;
    getContestantBySocketId(socketId: string): Promise<Contestant | null>;
    getLeaderboard(competitionId?: number | null): Promise<Contestant[]>;
    resetAllContestants(competitionId?: number | null): Promise<void>;
    resetAllAccessCodes(competitionId: number): Promise<number | null>;
    saveAnswer(questionId: number, contestantId: number, answerText: string, timeRemaining: number): Promise<{
        success: boolean;
        message?: string;
        id?: number;
    }>;
    saveAnswersBulk(questionId: number, contestantIds: number[]): Promise<void>;
    getAnswersForQuestion(questionId: number, competitionId?: number | null): Promise<Answer[]>;
    getAskedQuestionIds(competitionId?: number | null): Promise<number[]>;
    gradeAnswer(answerId: number, isCorrect: boolean, points: number): Promise<void>;
    gradeAnswersBulk(answerIds: number[], isCorrect: boolean, points: number): Promise<void>;
    getRandomQuote(): Promise<Quote | null>;
    getAllQuotes(): Promise<Quote[]>;
    getOrCreateSession(): Promise<any>;
    updateSessionState(state: GamePhase, questionId?: number | null): Promise<any>;
    getSetting(key: string): Promise<string | null>;
    getAllSettings(): Promise<Setting[]>;
    setSetting(key: string, value: string, description?: string | null): Promise<Setting>;
    ensureDefaultAdmin(): Promise<void>;
    getAdminByUsername(username: string): Promise<AdminUser | null>;
    updateAdminPassword(adminId: number, hashedPassword: string): Promise<void>;
    authenticateAdmin(username: string, password: string): Promise<{
        id: number;
        username: string;
    } | null>;
    createCompetition(name: string, contestantCount: number, juryCount: number): Promise<number>;
    getActiveCompetition(): Promise<Competition | null>;
    getActiveCompetitions(): Promise<Competition[]>;
    getCompetitionById(id: number): Promise<Competition | null>;
    updateCompetition(id: number, updates: {
        name?: string;
        status?: CompetitionStatus;
    }): Promise<number | null>;
    updateCompetitionStatus(id: number, status: CompetitionStatus): Promise<number | null>;
    getContestantsByCompetition(competitionId: number): Promise<Contestant[]>;
    getLeaderboardByCompetition(competitionId: number): Promise<Contestant[]>;
    generateAccessCodes(competitionId: number, contestantCount: number, juryCount: number): Promise<AccessCode[]>;
    validateAccessCode(code: string): Promise<ValidationResult>;
    markCodeAsUsed(codeId: number, sessionToken: string): Promise<AccessCode>;
    validateSessionToken(token: string): Promise<AccessCode | null>;
    getAccessCodesByCompetition(competitionId: number): Promise<AccessCode[]>;
    revokeToken(tokenId: string, userId: number, reason?: string): Promise<any>;
    isTokenRevoked(tokenId: string): Promise<boolean>;
    revokeAllUserTokens(userId: number, reason?: string): Promise<number | null>;
    isTokenRevokedOrUserBanned(tokenId: string, userId: number, tokenIssuedAt: number): Promise<boolean>;
    cleanupRevokedTokens(): Promise<number | null>;
    updateAccessCodeName(codeId: number, name: string): Promise<number | null>;
    resetAccessCode(codeId: number): Promise<number | null>;
}
declare const db: PostgresDatabase;
export default db;
//# sourceMappingURL=postgres.d.ts.map