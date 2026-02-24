/**
 * Seyirci Ekranı Event Handler
 */

const db = require('../../database/postgres');
const gameState = require('../state/gameState');

async function registerScreenHandlers(io, socket) {
    console.log(`[SCREEN] Bağlandı: ${socket.id}`);

    // Screen odasına katıl
    socket.join('screen');

    // İlk verileri gönder
    const currentState = gameState.getState();
    const initPayload = {
        contestants: await db.getAllContestants(),
        leaderboard: await db.getLeaderboard(),
        gameState: currentState,
        quote: await db.getRandomQuote()
    };

    // Aktif soru varsa maskelenmiş soru verisini de ekle
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

    // Yeni özlü söz iste
    socket.on('SCREEN_REQUEST_QUOTE', async () => {
        try {
            socket.emit('NEW_QUOTE', await db.getRandomQuote());
        } catch (error) {
            console.error('[SCREEN] Quote fetch error:', error);
        }
    });

    // Bağlantı kopması
    socket.on('disconnect', () => {
        console.log(`[SCREEN] Ayrıldı: ${socket.id}`);
    });
}

module.exports = { registerScreenHandlers };
