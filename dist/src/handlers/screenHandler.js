"use strict";
/**
 * Seyirci Ekranı Event Handler
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerScreenHandlers = registerScreenHandlers;
const postgres_1 = __importDefault(require("../../database/postgres"));
const logger_1 = __importDefault(require("../utils/logger"));
async function registerScreenHandlers(io, socket, gameState) {
    logger_1.default.info({ socketId: socket.id }, 'Screen baglandi');
    socket.join('screen');
    const currentState = gameState.getState();
    const competitionId = gameState.competitionId;
    const initPayload = {
        contestants: await postgres_1.default.getAllContestants(competitionId),
        leaderboard: await postgres_1.default.getLeaderboard(competitionId),
        gameState: currentState,
        quote: await postgres_1.default.getRandomQuote()
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
    socket.emit('INIT_DATA', initPayload);
    socket.on('SCREEN_REQUEST_QUOTE', async () => {
        try {
            socket.emit('NEW_QUOTE', await postgres_1.default.getRandomQuote());
        }
        catch (error) {
            logger_1.default.error({ err: error }, 'Quote fetch hatasi');
        }
    });
    socket.on('disconnect', () => {
        logger_1.default.info({ socketId: socket.id }, 'Screen ayrildi');
    });
}
//# sourceMappingURL=screenHandler.js.map