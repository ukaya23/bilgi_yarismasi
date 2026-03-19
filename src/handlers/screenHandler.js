/**
 * Seyirci Ekranı Event Handler
 */

const db = require('../../database/postgres');
const log = require('../utils/logger');

async function registerScreenHandlers(io, socket, gameState) {
    log.info({ socketId: socket.id }, 'Screen baglandi');

    // Screen odasına katıl
    socket.join('screen');

    // İlk verileri gönder
    const currentState = gameState.getState();
    const competitionId = gameState.competitionId;
    const initPayload = {
        contestants: await db.getAllContestants(competitionId),
        leaderboard: await db.getLeaderboard(competitionId),
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
            log.error({ err: error }, 'Quote fetch hatasi');
        }
    });

    // Bağlantı kopması
    socket.on('disconnect', () => {
        log.info({ socketId: socket.id }, 'Screen ayrildi');
    });
}

module.exports = { registerScreenHandlers };
