/**
 * Jüri Event Handler
 */

const db = require('../../database/postgres');
const { groupAnswers } = require('../state/gradingService');
const log = require('../utils/logger');

async function registerJuryHandlers(io, socket, gameState) {
    log.info({ socketId: socket.id }, 'Jury baglandi');

    // Jüri odasına katıl
    socket.join('jury');

    // Mevcut durumu gönder
    const currentState = gameState.getState();
    const initPayload = {
        gameState: currentState
    };

    // Aktif soru varsa soru verisini ekle
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

    // GRADING durumundaysa cevap verilerini tekrar gönder
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

    // Grup puanlama (tüm gruba aynı puan)
    socket.on('JURY_APPROVE_GROUP', async (data) => {
        try {
            const { answerIds, isCorrect, points } = data;

            if (!answerIds || !Array.isArray(answerIds)) {
                socket.emit('JURY_ACTION_RESULT', { success: false, error: 'Geçersiz cevap listesi' });
                return;
            }

            await db.gradeAnswersBulk(answerIds, isCorrect, points);

            socket.emit('JURY_ACTION_RESULT', {
                success: true,
                action: 'APPROVE_GROUP',
                count: answerIds.length
            });

            log.info({ count: answerIds.length, isCorrect, points }, 'Jury grup puanlama');
        } catch (error) {
            socket.emit('JURY_ACTION_RESULT', { success: false, error: error.message });
        }
    });

    // Tekil cevap puanlama
    socket.on('JURY_MANUAL_SCORE', async (data) => {
        try {
            const { answerId, isCorrect, points } = data;

            await db.gradeAnswer(answerId, isCorrect, points);

            socket.emit('JURY_ACTION_RESULT', {
                success: true,
                action: 'MANUAL_SCORE',
                answerId
            });

            log.info({ answerId, isCorrect, points }, 'Jury manuel puanlama');
        } catch (error) {
            socket.emit('JURY_ACTION_RESULT', { success: false, error: error.message });
        }
    });

    // Değerlendirmeyi tamamla ve sonuçları göster
    socket.on('JURY_COMMIT_RESULTS', async () => {
        try {
            await gameState.showResults();

            socket.emit('JURY_ACTION_RESULT', {
                success: true,
                action: 'COMMIT_RESULTS'
            });

            log.info('Jury degerlendirme tamamlandi');
        } catch (error) {
            socket.emit('JURY_ACTION_RESULT', { success: false, error: error.message });
        }
    });

    // Güncel cevapları iste
    socket.on('JURY_REQUEST_ANSWERS', async (data) => {
        try {
            const { questionId } = data;
            const answers = await db.getAnswersForQuestion(questionId, gameState.competitionId);

            socket.emit('JURY_ANSWERS_DATA', { questionId, answers });
        } catch (error) {
            socket.emit('JURY_ACTION_RESULT', { success: false, error: error.message });
        }
    });

    // Bağlantı kopması
    socket.on('disconnect', () => {
        log.info({ socketId: socket.id }, 'Jury ayrildi');
    });
}

module.exports = { registerJuryHandlers };
