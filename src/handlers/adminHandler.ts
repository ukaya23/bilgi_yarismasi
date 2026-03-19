/**
 * Admin (Sunucu) Event Handler
 */

import type { Server, Socket } from 'socket.io';
import db from '../../database/postgres';
import log from '../utils/logger';
import type { GameState } from '../state/gameState';

export async function registerAdminHandlers(io: Server, socket: Socket, gameState: GameState): Promise<void> {
    log.info({ socketId: socket.id }, 'Admin baglandi');

    socket.join('admin');

    const competitionId = gameState.competitionId;
    socket.emit('INIT_DATA', {
        questions: await db.getAllQuestions(),
        contestants: await db.getAllContestants(competitionId),
        gameState: gameState.getState(),
        leaderboard: await db.getLeaderboard(competitionId),
        askedQuestionIds: await db.getAskedQuestionIds(competitionId)
    });

    socket.on('ADMIN_START_QUESTION', async (data: { questionId: number }) => {
        try {
            await gameState.startQuestion(data.questionId);
            socket.emit('ACTION_RESULT', { success: true, action: 'START_QUESTION' });
        } catch (error: any) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });

    socket.on('ADMIN_SKIP_TO_GRADING', async () => {
        try {
            await gameState.lockQuestion();
            socket.emit('ACTION_RESULT', { success: true, action: 'SKIP_TO_GRADING' });
        } catch (error: any) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });

    socket.on('ADMIN_REVEAL_RESULTS', async () => {
        try {
            await gameState.showResults();
            socket.emit('ACTION_RESULT', { success: true, action: 'REVEAL_RESULTS' });
        } catch (error: any) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });

    socket.on('ADMIN_GO_IDLE', async () => {
        try {
            await gameState.goToIdle();
            socket.emit('ACTION_RESULT', { success: true, action: 'GO_IDLE' });
        } catch (error: any) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });

    socket.on('ADMIN_SHOW_PODIUM', async () => {
        try {
            const leaderboard = await db.getLeaderboard(competitionId);
            gameState.io!.emit('SHOW_PODIUM', { leaderboard: leaderboard.slice(0, 3) });
            socket.emit('ACTION_RESULT', { success: true, action: 'SHOW_PODIUM' });
        } catch (error: any) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });

    socket.on('ADMIN_RESET_GAME', async () => {
        try {
            const activeCompetition = await db.getActiveCompetition();
            if (activeCompetition) {
                await db.resetAllAccessCodes(activeCompetition.id);
            }
            await gameState.resetGame();
            socket.emit('ACTION_RESULT', { success: true, action: 'RESET_GAME' });
        } catch (error: any) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });

    socket.on('ADMIN_ADD_QUESTION', async (data: any) => {
        try {
            const id = await db.addQuestion(data);
            io.to('admin').emit('QUESTIONS_UPDATED', await db.getAllQuestions());
            socket.emit('ACTION_RESULT', { success: true, action: 'ADD_QUESTION', id });
        } catch (error: any) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });

    socket.on('ADMIN_UPDATE_QUESTION', async (data: any) => {
        try {
            const { id, ...question } = data;
            await db.updateQuestion(id, question);
            io.to('admin').emit('QUESTIONS_UPDATED', await db.getAllQuestions());
            socket.emit('ACTION_RESULT', { success: true, action: 'UPDATE_QUESTION' });
        } catch (error: any) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });

    socket.on('ADMIN_DELETE_QUESTION', async (data: { id: number }) => {
        try {
            await db.deleteQuestion(data.id);
            io.to('admin').emit('QUESTIONS_UPDATED', await db.getAllQuestions());
            socket.emit('ACTION_RESULT', { success: true, action: 'DELETE_QUESTION' });
        } catch (error: any) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });

    socket.on('ADMIN_REFRESH_CONTESTANTS', async () => {
        socket.emit('CONTESTANTS_UPDATED', await db.getAllContestants(competitionId));
    });

    socket.on('ADMIN_NEXT_STEP', () => {
        if (gameState.state === 'REVEAL') {
            gameState.nextRevealStep();
        }
    });

    socket.on('disconnect', () => {
        log.info({ socketId: socket.id }, 'Admin ayrildi');
    });
}
