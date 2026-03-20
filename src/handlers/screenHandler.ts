/**
 * Seyirci Ekranı Event Handler
 */

import type { Server, Socket } from 'socket.io';
import db from '../../database/postgres';
import log from '../utils/logger';
import type { GameState } from '../state/gameState';

export async function registerScreenHandlers(io: Server, socket: Socket, gameState: GameState): Promise<void> {
    log.info({ socketId: socket.id }, 'Screen baglandi');

    socket.join('screen');

    const currentState = gameState.getState();
    const competitionId = gameState.competitionId;
    const initPayload: any = {
        contestants: await db.getAllContestants(competitionId),
        leaderboard: await db.getLeaderboard(competitionId),
        gameState: currentState,
        quote: await db.getRandomQuote()
    };

    if ((currentState.state === 'QUESTION_ACTIVE' || currentState.state === 'LOCKED') && gameState.currentQuestion) {
        initPayload.activeQuestion = {
            category: gameState.currentQuestion.category || 'Genel Kültür',
            points: gameState.currentQuestion.points,
            duration: gameState.currentQuestion.duration,
            index: gameState.currentQuestion.index,
            total: gameState.currentQuestion.total,
            media_url: gameState.currentQuestion.media_url,
            timeRemaining: gameState.timeRemaining
        };
    }

    // Resend results if screen reconnects during REVEAL
    if (currentState.state === 'REVEAL' && gameState.lastResults) {
        initPayload.lastResults = gameState.lastResults;
    }

    socket.emit('INIT_DATA', initPayload);

    socket.on('SCREEN_REQUEST_QUOTE', async () => {
        try {
            socket.emit('NEW_QUOTE', await db.getRandomQuote());
        } catch (error) {
            log.error({ err: error }, 'Quote fetch hatasi');
        }
    });

    socket.on('disconnect', () => {
        log.info({ socketId: socket.id }, 'Screen ayrildi');
    });
}
