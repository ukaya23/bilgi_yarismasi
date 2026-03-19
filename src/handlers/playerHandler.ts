/**
 * Yarışmacı Event Handler
 */

import type { Server, Socket } from 'socket.io';
import db from '../../database/postgres';
import log from '../utils/logger';
import type { GameState } from '../state/gameState';

interface PlayerSocket extends Socket {
    contestantId?: number | null;
}

const socketContestantMap = new Map<string, number>();

export function registerPlayerHandlers(io: Server, socket: PlayerSocket, gameState: GameState): void {
    log.info({ socketId: socket.id }, 'Player baglandi');

    socket.contestantId = null;
    socket.join('player');

    const currentState = gameState.getState();
    const initPayload: any = { gameState: currentState };

    if (currentState.state === 'QUESTION_ACTIVE' && gameState.currentQuestion) {
        initPayload.activeQuestion = {
            id: gameState.currentQuestion.id,
            content: gameState.currentQuestion.content,
            type: gameState.currentQuestion.type,
            options: gameState.currentQuestion.options,
            points: gameState.currentQuestion.points,
            duration: gameState.currentQuestion.duration,
            media_url: gameState.currentQuestion.media_url,
            index: gameState.currentQuestion.index,
            total: gameState.currentQuestion.total,
            timeRemaining: gameState.timeRemaining
        };
    }

    socket.emit('INIT_DATA', initPayload);

    socket.on('PLAYER_LOGIN', async (data: { name: string; tableNo: string | number }) => {
        try {
            const { name, tableNo } = data;

            if (!name || !tableNo) {
                socket.emit('LOGIN_RESULT', { success: false, error: 'İsim ve masa numarası gerekli' });
                return;
            }

            const competitionId = gameState.competitionId;
            const contestantId = await db.upsertContestant(name, parseInt(String(tableNo)), competitionId);
            await db.updateContestantSocket(contestantId, socket.id);

            socket.contestantId = contestantId;
            socketContestantMap.set(socket.id, contestantId);

            socket.emit('LOGIN_RESULT', {
                success: true,
                contestantId,
                name,
                tableNo: parseInt(String(tableNo))
            });

            socket.emit('GAME_STATE', gameState.getState());

            const contestants = await db.getAllContestants(competitionId);
            io.to('admin').emit('CONTESTANTS_UPDATED', contestants);
            io.to('screen').emit('CONTESTANTS_UPDATED', contestants);

            log.info({ name, tableNo, contestantId }, 'Player giris basarili');
        } catch (error: any) {
            log.error({ err: error }, 'Player login hatasi');
            socket.emit('LOGIN_RESULT', { success: false, error: error.message });
        }
    });

    socket.on('PLAYER_SUBMIT_ANSWER', async (data: { answer: string; timeRemaining?: number }) => {
        try {
            const contestantId = socket.contestantId;

            log.debug({ socketId: socket.id, contestantId }, 'Cevap gonderme istegi');

            if (contestantId === null || contestantId === undefined) {
                log.debug('Giris yapilmamis - contestantId yok');
                socket.emit('ANSWER_RESULT', { success: false, error: 'Giriş yapılmamış. Lütfen tekrar giriş yapın.' });
                return;
            }

            const { answer, timeRemaining } = data;
            log.debug({ answer, timeRemaining }, 'Cevap alindi');

            const result = await gameState.submitAnswer(contestantId, answer, timeRemaining);

            socket.emit('ANSWER_RESULT', result);

            if (result.success) {
                log.info({ contestantId, answer }, 'Cevap basarili');
            } else {
                log.debug({ contestantId, message: result.message }, 'Cevap basarisiz');
            }
        } catch (error: any) {
            log.error({ err: error }, 'Cevap gonderme hatasi');
            socket.emit('ANSWER_RESULT', { success: false, error: error.message });
        }
    });

    socket.on('PLAYER_HEARTBEAT', () => {
        socket.emit('HEARTBEAT_ACK', { timestamp: Date.now() });
    });

    socket.on('disconnect', async () => {
        const contestantId = socket.contestantId;
        if (contestantId) {
            await db.updateContestantStatus(contestantId, 'OFFLINE');
            socketContestantMap.delete(socket.id);
            const contestants = await db.getAllContestants(gameState.competitionId);
            io.to('admin').emit('CONTESTANTS_UPDATED', contestants);
            io.to('screen').emit('CONTESTANTS_UPDATED', contestants);
            log.info({ contestantId }, 'Player ayrildi');
        }
    });
}
