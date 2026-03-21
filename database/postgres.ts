/**
 * PostgreSQL Veritabanı Modülü - Facade
 *
 * Pool yönetimi ve repository'lere delegasyon.
 * Tüm metotlar geriye dönük uyumluluk için doğrudan erişilebilir.
 */

import 'dotenv/config';
import { Pool } from 'pg';
import log from '../src/utils/logger';
import {
    QuestionRepository,
    ContestantRepository,
    AnswerRepository,
    CompetitionRepository,
    AuthRepository,
    GameRepository,
    EventLogRepository
} from './repositories';
import type { EventLogEntry } from './repositories/eventLogRepository';

class PostgresDatabase {
    pool: Pool;
    questions: QuestionRepository;
    contestants: ContestantRepository;
    answers: AnswerRepository;
    competitions: CompetitionRepository;
    auth: AuthRepository;
    game: GameRepository;
    eventLog: EventLogRepository;

    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        this.pool.on('error', (err: Error) => {
            log.error({ err }, 'Unexpected error on idle DB client');
        });

        this.questions = new QuestionRepository(this.pool);
        this.contestants = new ContestantRepository(this.pool);
        this.answers = new AnswerRepository(this.pool);
        this.competitions = new CompetitionRepository(this.pool);
        this.auth = new AuthRepository(this.pool);
        this.game = new GameRepository(this.pool);
        this.eventLog = new EventLogRepository(this.pool);
    }

    async initialize(): Promise<void> {
        try {
            const client = await this.pool.connect();
            try {
                const result = await client.query('SELECT NOW()');
                log.info({ connectedAt: result.rows[0].now }, 'PostgreSQL connected');
            } finally {
                client.release();
            }

            await this.runMigrations();
        } catch (error) {
            log.fatal({ err: error }, 'Database connection error');
            throw error;
        }
    }

    private async runMigrations(): Promise<void> {
        const fs = await import('fs');
        const path = await import('path');
        const migrationsDir = path.join(__dirname, '..', 'database', 'migrations');

        // Create migrations tracking table
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS applied_migrations (
                name VARCHAR(255) PRIMARY KEY,
                applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const applied = await this.pool.query('SELECT name FROM applied_migrations');
        const appliedSet = new Set(applied.rows.map((r: { name: string }) => r.name));

        let files: string[];
        try {
            files = fs.readdirSync(migrationsDir).filter((f: string) => f.endsWith('.sql')).sort();
        } catch {
            log.warn('Migrations directory not found, skipping');
            return;
        }

        for (const file of files) {
            if (appliedSet.has(file)) continue;

            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
            try {
                await this.pool.query(sql);
                await this.pool.query('INSERT INTO applied_migrations (name) VALUES ($1)', [file]);
                log.info({ migration: file }, 'Migration applied');
            } catch (err) {
                log.warn({ err, migration: file }, 'Migration failed (may already be applied)');
                // Mark as applied anyway to avoid retry loops
                await this.pool.query(
                    'INSERT INTO applied_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING',
                    [file]
                );
            }
        }
    }

    async close(): Promise<void> {
        await this.pool.end();
    }

    // ==================== SORU İŞLEMLERİ ====================
    getAllQuestions = () => this.questions.getAllQuestions();
    getQuestionById = (id: number) => this.questions.getQuestionById(id);
    addQuestion = (question: Parameters<QuestionRepository['addQuestion']>[0]) => this.questions.addQuestion(question);
    updateQuestion = (id: number, question: Parameters<QuestionRepository['updateQuestion']>[1]) => this.questions.updateQuestion(id, question);
    deleteQuestion = (id: number) => this.questions.deleteQuestion(id);

    // ==================== YARIŞMACI İŞLEMLERİ ====================
    getAllContestants = (competitionId?: number | null) => this.contestants.getAllContestants(competitionId);
    getContestantById = (id: number) => this.contestants.getContestantById(id);
    upsertContestant = (name: string, tableNo: number, competitionId?: number) => this.contestants.upsertContestant(name, tableNo, competitionId);
    updateContestantSocket = (id: number, socketId: string) => this.contestants.updateContestantSocket(id, socketId);
    updateContestantStatus = (id: number, status: Parameters<ContestantRepository['updateContestantStatus']>[1]) => this.contestants.updateContestantStatus(id, status);
    updateContestantScore = (id: number, pointsToAdd: number) => this.contestants.updateContestantScore(id, pointsToAdd);
    getContestantBySocketId = (socketId: string) => this.contestants.getContestantBySocketId(socketId);
    getLeaderboard = (competitionId?: number | null) => this.contestants.getLeaderboard(competitionId);
    resetAllContestants = (competitionId?: number | null) => this.contestants.resetAllContestants(competitionId);
    getContestantsByCompetition = (competitionId: number) => this.contestants.getContestantsByCompetition(competitionId);
    getLeaderboardByCompetition = (competitionId: number) => this.contestants.getLeaderboardByCompetition(competitionId);

    // ==================== CEVAP İŞLEMLERİ ====================
    saveAnswer = (questionId: number, contestantId: number, answerText: string, timeRemaining: number) => this.answers.saveAnswer(questionId, contestantId, answerText, timeRemaining);
    saveAnswersBulk = (questionId: number, contestantIds: number[]) => this.answers.saveAnswersBulk(questionId, contestantIds);
    getAnswersForQuestion = (questionId: number, competitionId?: number | null) => this.answers.getAnswersForQuestion(questionId, competitionId);
    getAskedQuestionIds = (competitionId?: number | null) => this.answers.getAskedQuestionIds(competitionId);
    gradeAnswer = (answerId: number, isCorrect: boolean, points: number) => this.answers.gradeAnswer(answerId, isCorrect, points);
    gradeAnswersBulk = (answerIds: number[], isCorrect: boolean, points: number) => this.answers.gradeAnswersBulk(answerIds, isCorrect, points);

    // ==================== YARIŞMA İŞLEMLERİ ====================
    createCompetition = (name: string, contestantCount: number, juryCount: number) => this.competitions.createCompetition(name, contestantCount, juryCount);
    getActiveCompetition = () => this.competitions.getActiveCompetition();
    getActiveCompetitions = () => this.competitions.getActiveCompetitions();
    getCompetitionById = (id: number) => this.competitions.getCompetitionById(id);
    updateCompetition = (id: number, updates: Parameters<CompetitionRepository['updateCompetition']>[1]) => this.competitions.updateCompetition(id, updates);
    updateCompetitionStatus = (id: number, status: Parameters<CompetitionRepository['updateCompetitionStatus']>[1]) => this.competitions.updateCompetitionStatus(id, status);
    generateAccessCodes = (competitionId: number, contestantCount: number, juryCount: number) => this.competitions.generateAccessCodes(competitionId, contestantCount, juryCount);
    validateAccessCode = (code: string) => this.competitions.validateAccessCode(code);
    markCodeAsUsed = (codeId: number, sessionToken: string) => this.competitions.markCodeAsUsed(codeId, sessionToken);
    validateSessionToken = (token: string) => this.competitions.validateSessionToken(token);
    getAccessCodesByCompetition = (competitionId: number) => this.competitions.getAccessCodesByCompetition(competitionId);
    resetAllAccessCodes = (competitionId: number) => this.competitions.resetAllAccessCodes(competitionId);
    updateAccessCodeName = (codeId: number, name: string) => this.competitions.updateAccessCodeName(codeId, name);
    resetAccessCode = (codeId: number) => this.competitions.resetAccessCode(codeId);

    // ==================== ADMİN & TOKEN İŞLEMLERİ ====================
    ensureDefaultAdmin = () => this.auth.ensureDefaultAdmin();
    getAdminByUsername = (username: string) => this.auth.getAdminByUsername(username);
    updateAdminPassword = (adminId: number, hashedPassword: string) => this.auth.updateAdminPassword(adminId, hashedPassword);
    authenticateAdmin = (username: string, password: string) => this.auth.authenticateAdmin(username, password);
    revokeToken = (tokenId: string, userId: number, reason?: string) => this.auth.revokeToken(tokenId, userId, reason);
    isTokenRevoked = (tokenId: string) => this.auth.isTokenRevoked(tokenId);
    revokeAllUserTokens = (userId: number, reason?: string) => this.auth.revokeAllUserTokens(userId, reason);
    isTokenRevokedOrUserBanned = (tokenId: string, userId: number, tokenIssuedAt: number) => this.auth.isTokenRevokedOrUserBanned(tokenId, userId, tokenIssuedAt);
    cleanupRevokedTokens = () => this.auth.cleanupRevokedTokens();

    // ==================== OYUN İŞLEMLERİ ====================
    getSetting = (key: string) => this.game.getSetting(key);
    getAllSettings = () => this.game.getAllSettings();
    setSetting = (key: string, value: string, description?: string | null) => this.game.setSetting(key, value, description);
    getRandomQuote = () => this.game.getRandomQuote();
    getAllQuotes = () => this.game.getAllQuotes();
    getOrCreateSession = () => this.game.getOrCreateSession();
    updateSessionState = (state: Parameters<GameRepository['updateSessionState']>[0], questionId?: number | null) => this.game.updateSessionState(state, questionId);

    // ==================== EVENT LOG İŞLEMLERİ ====================
    logEvent = (entry: EventLogEntry) => this.eventLog.log(entry);
    logAndReturnEvent = (entry: EventLogEntry) => this.eventLog.logAndReturn(entry);
    getEventsByCompetition = (competitionId: number, limit?: number, offset?: number) => this.eventLog.getByCompetition(competitionId, limit, offset);
    getEventsByType = (eventType: string, limit?: number) => this.eventLog.getByType(eventType, limit);
    getRecentEvents = (limit?: number) => this.eventLog.getRecent(limit);
}

const db = new PostgresDatabase();
export default db;
