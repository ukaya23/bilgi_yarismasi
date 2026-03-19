"use strict";
/**
 * Yarışmacı Event Handler
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPlayerHandlers = registerPlayerHandlers;
const postgres_1 = __importDefault(require("../../database/postgres"));
const logger_1 = __importDefault(require("../utils/logger"));
const socketContestantMap = new Map();
function registerPlayerHandlers(io, socket, gameState) {
    logger_1.default.info({ socketId: socket.id }, 'Player baglandi');
    socket.contestantId = null;
    socket.join('player');
    const currentState = gameState.getState();
    const initPayload = { gameState: currentState };
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
    socket.on('PLAYER_LOGIN', async (data) => {
        try {
            const { name, tableNo } = data;
            if (!name || !tableNo) {
                socket.emit('LOGIN_RESULT', { success: false, error: 'İsim ve masa numarası gerekli' });
                return;
            }
            const competitionId = gameState.competitionId;
            const contestantId = await postgres_1.default.upsertContestant(name, parseInt(String(tableNo)), competitionId);
            await postgres_1.default.updateContestantSocket(contestantId, socket.id);
            socket.contestantId = contestantId;
            socketContestantMap.set(socket.id, contestantId);
            socket.emit('LOGIN_RESULT', {
                success: true,
                contestantId,
                name,
                tableNo: parseInt(String(tableNo))
            });
            socket.emit('GAME_STATE', gameState.getState());
            const contestants = await postgres_1.default.getAllContestants(competitionId);
            io.to('admin').emit('CONTESTANTS_UPDATED', contestants);
            io.to('screen').emit('CONTESTANTS_UPDATED', contestants);
            logger_1.default.info({ name, tableNo, contestantId }, 'Player giris basarili');
        }
        catch (error) {
            logger_1.default.error({ err: error }, 'Player login hatasi');
            socket.emit('LOGIN_RESULT', { success: false, error: error.message });
        }
    });
    socket.on('PLAYER_SUBMIT_ANSWER', async (data) => {
        try {
            const contestantId = socket.contestantId;
            logger_1.default.debug({ socketId: socket.id, contestantId }, 'Cevap gonderme istegi');
            if (contestantId === null || contestantId === undefined) {
                logger_1.default.debug('Giris yapilmamis - contestantId yok');
                socket.emit('ANSWER_RESULT', { success: false, error: 'Giriş yapılmamış. Lütfen tekrar giriş yapın.' });
                return;
            }
            const { answer, timeRemaining } = data;
            logger_1.default.debug({ answer, timeRemaining }, 'Cevap alindi');
            const result = await gameState.submitAnswer(contestantId, answer, timeRemaining);
            socket.emit('ANSWER_RESULT', result);
            if (result.success) {
                logger_1.default.info({ contestantId, answer }, 'Cevap basarili');
            }
            else {
                logger_1.default.debug({ contestantId, message: result.message }, 'Cevap basarisiz');
            }
        }
        catch (error) {
            logger_1.default.error({ err: error }, 'Cevap gonderme hatasi');
            socket.emit('ANSWER_RESULT', { success: false, error: error.message });
        }
    });
    socket.on('PLAYER_HEARTBEAT', () => {
        socket.emit('HEARTBEAT_ACK', { timestamp: Date.now() });
    });
    socket.on('disconnect', async () => {
        const contestantId = socket.contestantId;
        if (contestantId) {
            await postgres_1.default.updateContestantStatus(contestantId, 'OFFLINE');
            socketContestantMap.delete(socket.id);
            const contestants = await postgres_1.default.getAllContestants(gameState.competitionId);
            io.to('admin').emit('CONTESTANTS_UPDATED', contestants);
            io.to('screen').emit('CONTESTANTS_UPDATED', contestants);
            logger_1.default.info({ contestantId }, 'Player ayrildi');
        }
    });
}
//# sourceMappingURL=playerHandler.js.map