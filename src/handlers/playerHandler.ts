/**
 * Yarışmacı Event Handler
 */

import type { Server, Socket } from 'socket.io';
import db from '../../database/postgres';
import log from '../utils/logger';
import type { GameState } from '../state/gameState';
import { PlayerLoginSchema, PlayerSubmitAnswerSchema } from '../schemas/socketSchemas';
import { validatePayload } from '../schemas/validateEvent';

interface PlayerSocket extends Socket {
    contestantId?: number | null;
}

const socketContestantMap = new Map<string, number>();

export function registerPlayerHandlers(io: Server, socket: PlayerSocket, gameState: GameState): void {
    log.info({ socketId: socket.id }, 'Player baglandi');

    socket.contestantId = null;
    socket.join('player');

    // INIT_DATA is sent after PLAYER_LOGIN so we know the contestantId
    // See PLAYER_LOGIN handler below for the full reconnection flow

    socket.on('PLAYER_LOGIN', async (data: unknown) => {
        try {
            const validated = validatePayload(PlayerLoginSchema, data, socket, 'PLAYER_LOGIN');
            if (!validated) return;

            const { name, tableNo } = validated;

            const competitionId = gameState.competitionId;
            const contestantId = await db.upsertContestant(name, tableNo, competitionId);
            await db.updateContestantSocket(contestantId, socket.id);

            socket.contestantId = contestantId;
            socketContestantMap.set(socket.id, contestantId);

            socket.emit('LOGIN_RESULT', {
                success: true,
                contestantId,
                name,
                tableNo
            });

            // Build and send full INIT_DATA with player's answer status
            const currentState = gameState.getState();
            const initPayload: any = { gameState: currentState };

            if (currentState.state === 'QUESTION_ACTIVE' && gameState.currentQuestion) {
                const alreadyAnswered = gameState.hasPlayerAnswered(contestantId);
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
                initPayload.alreadyAnswered = alreadyAnswered;
            }

            // If we're in REVEAL phase and results are available, resend them
            if ((currentState.state === 'REVEAL' || currentState.state === 'GRADING') && gameState.lastResults) {
                initPayload.lastResults = gameState.lastResults;
            }

            socket.emit('INIT_DATA', initPayload);

            const contestants = await db.getAllContestants(competitionId);
            io.to('admin').emit('CONTESTANTS_UPDATED', contestants);
            io.to('screen').emit('CONTESTANTS_UPDATED', contestants);

            log.info({ name, tableNo, contestantId }, 'Player giris basarili');
        } catch (error: any) {
            log.error({ err: error }, 'Player login hatasi');
            socket.emit('LOGIN_RESULT', { success: false, error: error.message });
        }
    });

    socket.on('PLAYER_SUBMIT_ANSWER', async (data: unknown) => {
        try {
            const validated = validatePayload(PlayerSubmitAnswerSchema, data, socket, 'PLAYER_SUBMIT_ANSWER');
            if (!validated) return;

            const contestantId = socket.contestantId;

            log.debug({ socketId: socket.id, contestantId }, 'Cevap gonderme istegi');

            if (contestantId === null || contestantId === undefined) {
                log.debug('Giris yapilmamis - contestantId yok');
                socket.emit('ANSWER_RESULT', { success: false, error: 'Giriş yapılmamış. Lütfen tekrar giriş yapın.' });
                return;
            }

            const { answer, timeRemaining } = validated;
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
