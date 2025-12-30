/**
 * Jüri Event Handler
 */

const db = require('../../database/db');
const gameState = require('../state/gameState');

function registerJuryHandlers(io, socket) {
    console.log(`[JURY] Bağlandı: ${socket.id}`);

    // Jüri odasına katıl
    socket.join('jury');

    // Mevcut durumu gönder
    socket.emit('GAME_STATE', gameState.getState());

    // Grup puanlama (tüm gruba aynı puan)
    socket.on('JURY_APPROVE_GROUP', (data) => {
        try {
            const { answerIds, isCorrect, points } = data;

            if (!answerIds || !Array.isArray(answerIds)) {
                socket.emit('JURY_ACTION_RESULT', { success: false, error: 'Geçersiz cevap listesi' });
                return;
            }

            db.gradeAnswersBulk(answerIds, isCorrect, points);

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
    socket.on('JURY_MANUAL_SCORE', (data) => {
        try {
            const { answerId, isCorrect, points } = data;

            db.gradeAnswer(answerId, isCorrect, points);

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
    socket.on('JURY_COMMIT_RESULTS', () => {
        try {
            gameState.showResults();

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
    socket.on('JURY_REQUEST_ANSWERS', (data) => {
        try {
            const { questionId } = data;
            const answers = db.getAnswersForQuestion(questionId);

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
