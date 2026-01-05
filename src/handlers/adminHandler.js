/**
 * Admin (Sunucu) Event Handler
 */

const db = require('../../database/db');
const gameState = require('../state/gameState');

function registerAdminHandlers(io, socket) {
    console.log(`[ADMIN] Bağlandı: ${socket.id}`);

    // Admin odasına katıl
    socket.join('admin');

    // İlk durumu gönder
    socket.emit('INIT_DATA', {
        questions: db.getAllQuestions(),
        contestants: db.getAllContestants(),
        gameState: gameState.getState(),
        leaderboard: db.getLeaderboard()
    });

    // Soru başlat
    socket.on('ADMIN_START_QUESTION', (data) => {
        try {
            const { questionId } = data;
            gameState.startQuestion(questionId);
            socket.emit('ACTION_RESULT', { success: true, action: 'START_QUESTION' });
        } catch (error) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });

    // Soruyu erken bitir
    socket.on('ADMIN_SKIP_TO_GRADING', () => {
        try {
            gameState.lockQuestion();
            socket.emit('ACTION_RESULT', { success: true, action: 'SKIP_TO_GRADING' });
        } catch (error) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });

    // Sonuçları göster
    socket.on('ADMIN_REVEAL_RESULTS', () => {
        try {
            gameState.showResults();
            socket.emit('ACTION_RESULT', { success: true, action: 'REVEAL_RESULTS' });
        } catch (error) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });

    // Bekleme moduna geç
    socket.on('ADMIN_GO_IDLE', () => {
        try {
            gameState.goToIdle();
            socket.emit('ACTION_RESULT', { success: true, action: 'GO_IDLE' });
        } catch (error) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });

    // Oyunu sıfırla
    socket.on('ADMIN_RESET_GAME', () => {
        try {
            gameState.resetGame();
            socket.emit('ACTION_RESULT', { success: true, action: 'RESET_GAME' });
        } catch (error) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });

    // Yeni soru ekle
    socket.on('ADMIN_ADD_QUESTION', (data) => {
        try {
            const id = db.addQuestion(data);
            io.to('admin').emit('QUESTIONS_UPDATED', db.getAllQuestions());
            socket.emit('ACTION_RESULT', { success: true, action: 'ADD_QUESTION', id });
        } catch (error) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });

    // Soru güncelle
    socket.on('ADMIN_UPDATE_QUESTION', (data) => {
        try {
            const { id, ...question } = data;
            db.updateQuestion(id, question);
            io.to('admin').emit('QUESTIONS_UPDATED', db.getAllQuestions());
            socket.emit('ACTION_RESULT', { success: true, action: 'UPDATE_QUESTION' });
        } catch (error) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });

    // Soru sil
    socket.on('ADMIN_DELETE_QUESTION', (data) => {
        try {
            db.deleteQuestion(data.id);
            io.to('admin').emit('QUESTIONS_UPDATED', db.getAllQuestions());
            socket.emit('ACTION_RESULT', { success: true, action: 'DELETE_QUESTION' });
        } catch (error) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });

    // Yarışmacıları yenile
    socket.on('ADMIN_REFRESH_CONTESTANTS', () => {
        socket.emit('CONTESTANTS_UPDATED', db.getAllContestants());
    });

    // Sonuç açıklama adımını ilerlet
    socket.on('ADMIN_NEXT_STEP', () => {
        if (gameState.state === 'REVEAL') {
            gameState.nextRevealStep();
        }
    });

    // Yarışmayı sonlandır
    // Note: The following line `app.post` is typically used for Express.js routes and 'app' is not defined in this scope.
    // It has been placed as requested, but may require 'app' to be passed into this function or defined globally.
    // Also, the closing brace '}' after this line in the original instruction would prematurely close 'registerAdminHandlers'.
    // It has been adjusted to maintain syntactical correctness of the function.
    // app.post('/api/competition/end', requireAdminAuth, (req, res) => {
    //     console.log(`[ADMIN] Ayrıldı: ${socket.id}`);
    // });

    // Bağlantı kopması
    socket.on('disconnect', () => {
        console.log(`[ADMIN] Ayrıldı: ${socket.id}`);
    });
}

module.exports = { registerAdminHandlers };
