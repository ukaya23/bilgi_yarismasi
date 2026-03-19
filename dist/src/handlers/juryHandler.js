"use strict";
/**
 * Jüri Event Handler
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerJuryHandlers = registerJuryHandlers;
const postgres_1 = __importDefault(require("../../database/postgres"));
const gradingService_1 = require("../state/gradingService");
const logger_1 = __importDefault(require("../utils/logger"));
async function registerJuryHandlers(io, socket, gameState) {
    logger_1.default.info({ socketId: socket.id }, 'Jury baglandi');
    socket.join('jury');
    const currentState = gameState.getState();
    const initPayload = { gameState: currentState };
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
            const answers = await postgres_1.default.getAnswersForQuestion(gameState.currentQuestion.id, gameState.competitionId);
            const emptyAnswers = answers.filter(a => !a.answer_text || a.answer_text.trim() === '');
            const nonEmptyAnswers = answers.filter(a => a.answer_text && a.answer_text.trim() !== '');
            const groupedAnswers = (0, gradingService_1.groupAnswers)(nonEmptyAnswers, gameState.currentQuestion.correct_keys);
            initPayload.reviewData = {
                questionId: gameState.currentQuestion.id,
                questionContent: gameState.currentQuestion.content,
                correctKeys: gameState.currentQuestion.correct_keys,
                points: gameState.currentQuestion.points,
                groups: groupedAnswers,
                emptyCount: emptyAnswers.length
            };
        }
        catch (err) {
            logger_1.default.error({ err }, 'Jury grading data fetch hatasi');
        }
    }
    socket.emit('INIT_DATA', initPayload);
    socket.on('JURY_APPROVE_GROUP', async (data) => {
        try {
            const { answerIds, isCorrect, points } = data;
            if (!answerIds || !Array.isArray(answerIds)) {
                socket.emit('JURY_ACTION_RESULT', { success: false, error: 'Geçersiz cevap listesi' });
                return;
            }
            await postgres_1.default.gradeAnswersBulk(answerIds, isCorrect, points);
            socket.emit('JURY_ACTION_RESULT', {
                success: true,
                action: 'APPROVE_GROUP',
                count: answerIds.length
            });
            logger_1.default.info({ count: answerIds.length, isCorrect, points }, 'Jury grup puanlama');
        }
        catch (error) {
            socket.emit('JURY_ACTION_RESULT', { success: false, error: error.message });
        }
    });
    socket.on('JURY_MANUAL_SCORE', async (data) => {
        try {
            const { answerId, isCorrect, points } = data;
            await postgres_1.default.gradeAnswer(answerId, isCorrect, points);
            socket.emit('JURY_ACTION_RESULT', {
                success: true,
                action: 'MANUAL_SCORE',
                answerId
            });
            logger_1.default.info({ answerId, isCorrect, points }, 'Jury manuel puanlama');
        }
        catch (error) {
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
            logger_1.default.info('Jury degerlendirme tamamlandi');
        }
        catch (error) {
            socket.emit('JURY_ACTION_RESULT', { success: false, error: error.message });
        }
    });
    socket.on('JURY_REQUEST_ANSWERS', async (data) => {
        try {
            const { questionId } = data;
            const answers = await postgres_1.default.getAnswersForQuestion(questionId, gameState.competitionId);
            socket.emit('JURY_ANSWERS_DATA', { questionId, answers });
        }
        catch (error) {
            socket.emit('JURY_ACTION_RESULT', { success: false, error: error.message });
        }
    });
    socket.on('disconnect', () => {
        logger_1.default.info({ socketId: socket.id }, 'Jury ayrildi');
    });
}
//# sourceMappingURL=juryHandler.js.map