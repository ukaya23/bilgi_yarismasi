/**
 * Jüri Event Handler
 */

const db = require('../../database/postgres');
const gameState = require('../state/gameState');

async function registerJuryHandlers(io, socket) {
    console.log(`[JURY] Bağlandı: ${socket.id}`);

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
            const answers = await db.getAnswersForQuestion(gameState.currentQuestion.id);
            const emptyAnswers = answers.filter(a => !a.answer_text || a.answer_text.trim() === '');
            const nonEmptyAnswers = answers.filter(a => a.answer_text && a.answer_text.trim() !== '');
            const groupedAnswers = gameState.groupAnswers(nonEmptyAnswers);
            initPayload.reviewData = {
                questionId: gameState.currentQuestion.id,
                questionContent: gameState.currentQuestion.content,
                correctKeys: gameState.currentQuestion.correct_keys,
                points: gameState.currentQuestion.points,
                groups: groupedAnswers,
                emptyCount: emptyAnswers.length
            };
        } catch (err) {
            console.error('[JURY] Grading data fetch error:', err);
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

            console.log(`[JURY] Grup puanlama: ${answerIds.length} cevap, ${isCorrect ? 'Doğru' : 'Yanlış'}, ${points} puan`);
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

            console.log(`[JURY] Manuel puanlama: Cevap ${answerId}, ${isCorrect ? 'Doğru' : 'Yanlış'}, ${points} puan`);
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

            console.log('[JURY] Değerlendirme tamamlandı, sonuçlar yayınlandı');
        } catch (error) {
            socket.emit('JURY_ACTION_RESULT', { success: false, error: error.message });
        }
    });

    // Güncel cevapları iste
    socket.on('JURY_REQUEST_ANSWERS', async (data) => {
        try {
            const { questionId } = data;
            const answers = await db.getAnswersForQuestion(questionId);

            socket.emit('JURY_ANSWERS_DATA', { questionId, answers });
        } catch (error) {
            socket.emit('JURY_ACTION_RESULT', { success: false, error: error.message });
        }
    });

    // Bağlantı kopması
    socket.on('disconnect', () => {
        console.log(`[JURY] Ayrıldı: ${socket.id}`);
    });
}

module.exports = { registerJuryHandlers };
