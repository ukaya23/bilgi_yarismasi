/**
 * Shared Type Definitions
 */

import type { Server, Socket } from 'socket.io';
import type { Request } from 'express';

// ==================== DATABASE MODELS ====================

export type QuestionType = 'MULTIPLE_CHOICE' | 'OPEN_ENDED';
export type GamePhase = 'IDLE' | 'QUESTION_ACTIVE' | 'LOCKED' | 'GRADING' | 'REVEAL';
export type ContestantStatus = 'ONLINE' | 'OFFLINE' | 'DISQUALIFIED';
export type CompetitionStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type AccessCodeRole = 'CONTESTANT' | 'JURY';
export type UserRole = 'admin' | 'player' | 'jury' | 'screen';

export interface Question {
    id: number;
    content: string;
    media_url: string | null;
    type: QuestionType;
    options: string[] | null;
    correct_keys: string[];
    points: number;
    duration: number;
    category: string;
    is_active?: boolean;
}

export interface Contestant {
    id: number;
    name: string;
    table_no?: number;
    slot_number?: number;
    total_score: number;
    status: ContestantStatus;
    socket_id?: string | null;
    competition_id?: number;
}

export interface Answer {
    id: number;
    question_id: number;
    contestant_id: number;
    answer_text: string;
    is_correct: boolean | null;
    points_awarded: number;
    time_remaining: number;
    contestant_name?: string;
}

export interface Competition {
    id: number;
    name: string;
    contestant_count: number;
    jury_count: number;
    status: CompetitionStatus;
    created_at?: string;
}

export interface AccessCode {
    id: number;
    competition_id: number;
    code: string;
    role: AccessCodeRole;
    name: string;
    slot_number: number;
    is_used: boolean;
    session_token: string | null;
    competition_name?: string;
}

export interface AdminUser {
    id: number;
    username: string;
    password_hash: string;
}

export interface Quote {
    text: string;
    author: string;
}

export interface Setting {
    key: string;
    value: string;
    description?: string;
}

// ==================== AUTH ====================

export interface TokenPayload {
    id: number;
    username: string;
    role: UserRole;
    competitionId?: number;
}

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
}

export interface DecodedToken {
    userId: number;
    username: string;
    role: UserRole;
    tokenId: string;
    competitionId?: number;
    type: 'access' | 'refresh';
    iat: number;
    exp: number;
}

// ==================== GAME STATE ====================

export interface GameStateData {
    state: GamePhase;
    currentQuestion: Question | null;
    timeRemaining: number;
    questionIndex: number;
    totalQuestions: number;
    competitionId: number;
}

export interface AnswerGroups {
    correct: Answer[];
    incorrect: Answer[];
    empty: Answer[];
}

export interface JuryReviewData {
    questionId: number;
    questionContent: string;
    correctKeys: string[];
    points: number;
    groups: AnswerGroups;
    emptyCount: number;
}

// ==================== SOCKET ====================

export interface AuthenticatedSocket extends Socket {
    role?: UserRole;
    username?: string;
    userId?: number;
    competitionId?: number;
}

export interface AuthenticatedRequest extends Request {
    user?: DecodedToken;
}

// ==================== VALIDATION RESULT ====================

export interface ValidationResult {
    valid: boolean;
    message?: string;
    accessCode?: AccessCode;
}
