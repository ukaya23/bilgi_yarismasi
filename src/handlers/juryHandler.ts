/**
 * Jüri Event Handler
 */

import type { Server, Socket } from 'socket.io';
import db from '../../database/postgres';
import { groupAnswers } from '../state/gradingService';
import log from '../utils/logger';
import type { GameState } from '../state/gameState';
import { JuryApproveGroupSchema, JuryManualScoreSchema, JuryRequestAnswersSchema } from '../schemas/socketSchemas';
import { validatePayload } from '../schemas/validateEvent';

export async function registerJuryHandlers(io: Server, socket: Socket, gameState: GameState): Promise<void> {
    log.info({ socketId: socket.id }, 'Jury baglandi');

    socket.join('jury');

    const currentState = gameState.getState();
    const initPayload: any = { gameState: currentState };

    if ((currentState.state === 'QUESTION_ACTIVE' || currentState.state === 'LOCKED') && gameState.currentQuestion) {
        initPayload.activeQuestion = {
            id: gameState.currentQuestion.id,
            content: gameState.currentQuestion.content,
            type: gameState.currentQuestion.type,
            options: gameState.currentQuestion.options,
            correct_keys: gameState.currentQuestion.correct_keys,
            points: gameState.currentQuestion.points,
            duration: gameState.currentQuestion.duration,
            category: gameState.currentQuestion.category,
            index: gameState.currentQuestion.index,
            total: gameState.currentQuestion.total,
            timeRemaining: gameState.timeRemaining
        };
    }

    if (currentState.state === 'GRADING' && gameState.currentQuestion) {
        try {
            const answers = await db.getAnswersForQuestion(gameState.currentQuestion.id, gameState.competitionId);
            const emptyAnswers = answers.filter(a => !a.answer_text || a.answer_text.trim() === '');
            const nonEmptyAnswers = answers.filter(a => a.answer_text && a.answer_text.trim() !== '');
            const groupedAnswers = groupAnswers(nonEmptyAnswers, gameState.currentQuestion.correct_keys);
            initPayload.reviewData = {
                questionId: gameState.currentQuestion.id,
                questionContent: gameState.currentQuestion.content,
                correctKeys: gameState.currentQuestion.correct_keys,
                points: gameState.currentQuestion.points,
                groups: groupedAnswers,
                emptyCount: emptyAnswers.length
            };
        } catch (err) {
            log.error({ err }, 'Jury grading data fetch hatasi');
        }
    }

    socket.emit('INIT_DATA', initPayload);

    socket.on('JURY_APPROVE_GROUP', async (data: unknown) => {
        try {
            const validated = validatePayload(JuryApproveGroupSchema, data, socket, 'JURY_APPROVE_GROUP');
            if (!validated) return;

            const { answerIds, isCorrect, points } = validated;

            await db.gradeAnswersBulk(answerIds, isCorrect, points);

            socket.emit('JURY_ACTION_RESULT', {
                success: true,
                action: 'APPROVE_GROUP',
                count: answerIds.length
            });

            log.info({ count: answerIds.length, isCorrect, points }, 'Jury grup puanlama');
        } catch (error: any) {
            socket.emit('JURY_ACTION_RESULT', { success: false, error: error.message });
        }
    });

    socket.on('JURY_MANUAL_SCORE', async (data: unknown) => {
        try {
            const validated = validatePayload(JuryManualScoreSchema, data, socket, 'JURY_MANUAL_SCORE');
            if (!validated) return;
            const { answerId, isCorrect, points } = validated;

            await db.gradeAnswer(answerId, isCorrect, points);

            socket.emit('JURY_ACTION_RESULT', {
                success: true,
                action: 'MANUAL_SCORE',
                answerId
            });

            log.info({ answerId, isCorrect, points }, 'Jury manuel puanlama');
        } catch (error: any) {
            socket.emit('JURY_ACTION_RESULT', { success: false, error: error.message });
        }
    });

    socket.on('JURY_COMMIT_RESULTS', async () => {
        try {
            await gameState.showResults();

            socket.emit('JURY_ACTION_RESULT', {
                success: true,
                action: 'COMMIT_RESULTS'
            });

            log.info('Jury degerlendirme tamamlandi');
        } catch (error: any) {
            socket.emit('JURY_ACTION_RESULT', { success: false, error: error.message });
        }
    });

    socket.on('JURY_REQUEST_ANSWERS', async (data: unknown) => {
        try {
            const validated = validatePayload(JuryRequestAnswersSchema, data, socket, 'JURY_REQUEST_ANSWERS');
            if (!validated) return;
            const { questionId } = validated;
            const answers = await db.getAnswersForQuestion(questionId, gameState.competitionId);

            socket.emit('JURY_ANSWERS_DATA', { questionId, answers });
        } catch (error: any) {
            socket.emit('JURY_ACTION_RESULT', { success: false, error: error.message });
        }
    });

    socket.on('disconnect', () => {
        log.info({ socketId: socket.id }, 'Jury ayrildi');
    });
}
