"use strict";
/**
 * Admin (Sunucu) Event Handler
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAdminHandlers = registerAdminHandlers;
const postgres_1 = __importDefault(require("../../database/postgres"));
const logger_1 = __importDefault(require("../utils/logger"));
async function registerAdminHandlers(io, socket, gameState) {
    logger_1.default.info({ socketId: socket.id }, 'Admin baglandi');
    socket.join('admin');
    const competitionId = gameState.competitionId;
    socket.emit('INIT_DATA', {
        questions: await postgres_1.default.getAllQuestions(),
        contestants: await postgres_1.default.getAllContestants(competitionId),
        gameState: gameState.getState(),
        leaderboard: await postgres_1.default.getLeaderboard(competitionId),
        askedQuestionIds: await postgres_1.default.getAskedQuestionIds(competitionId)
    });
    socket.on('ADMIN_START_QUESTION', async (data) => {
        try {
            await gameState.startQuestion(data.questionId);
            socket.emit('ACTION_RESULT', { success: true, action: 'START_QUESTION' });
        }
        catch (error) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });
    socket.on('ADMIN_SKIP_TO_GRADING', async () => {
        try {
            await gameState.lockQuestion();
            socket.emit('ACTION_RESULT', { success: true, action: 'SKIP_TO_GRADING' });
        }
        catch (error) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });
    socket.on('ADMIN_REVEAL_RESULTS', async () => {
        try {
            await gameState.showResults();
            socket.emit('ACTION_RESULT', { success: true, action: 'REVEAL_RESULTS' });
        }
        catch (error) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });
    socket.on('ADMIN_GO_IDLE', async () => {
        try {
            await gameState.goToIdle();
            socket.emit('ACTION_RESULT', { success: true, action: 'GO_IDLE' });
        }
        catch (error) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });
    socket.on('ADMIN_SHOW_PODIUM', async () => {
        try {
            const leaderboard = await postgres_1.default.getLeaderboard(competitionId);
            gameState.io.emit('SHOW_PODIUM', { leaderboard: leaderboard.slice(0, 3) });
            socket.emit('ACTION_RESULT', { success: true, action: 'SHOW_PODIUM' });
        }
        catch (error) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });
    socket.on('ADMIN_RESET_GAME', async () => {
        try {
            const activeCompetition = await postgres_1.default.getActiveCompetition();
            if (activeCompetition) {
                await postgres_1.default.resetAllAccessCodes(activeCompetition.id);
            }
            await gameState.resetGame();
            socket.emit('ACTION_RESULT', { success: true, action: 'RESET_GAME' });
        }
        catch (error) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });
    socket.on('ADMIN_ADD_QUESTION', async (data) => {
        try {
            const id = await postgres_1.default.addQuestion(data);
            io.to('admin').emit('QUESTIONS_UPDATED', await postgres_1.default.getAllQuestions());
            socket.emit('ACTION_RESULT', { success: true, action: 'ADD_QUESTION', id });
        }
        catch (error) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });
    socket.on('ADMIN_UPDATE_QUESTION', async (data) => {
        try {
            const { id, ...question } = data;
            await postgres_1.default.updateQuestion(id, question);
            io.to('admin').emit('QUESTIONS_UPDATED', await postgres_1.default.getAllQuestions());
            socket.emit('ACTION_RESULT', { success: true, action: 'UPDATE_QUESTION' });
        }
        catch (error) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });
    socket.on('ADMIN_DELETE_QUESTION', async (data) => {
        try {
            await postgres_1.default.deleteQuestion(data.id);
            io.to('admin').emit('QUESTIONS_UPDATED', await postgres_1.default.getAllQuestions());
            socket.emit('ACTION_RESULT', { success: true, action: 'DELETE_QUESTION' });
        }
        catch (error) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });
    socket.on('ADMIN_REFRESH_CONTESTANTS', async () => {
        socket.emit('CONTESTANTS_UPDATED', await postgres_1.default.getAllContestants(competitionId));
    });
    socket.on('ADMIN_NEXT_STEP', () => {
        if (gameState.state === 'REVEAL') {
            gameState.nextRevealStep();
        }
    });
    socket.on('disconnect', () => {
        logger_1.default.info({ socketId: socket.id }, 'Admin ayrildi');
    });
}
//# sourceMappingURL=adminHandler.js.map