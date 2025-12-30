/**
 * Seyirci Ekranı Event Handler
 */

const db = require('../../database/db');
const gameState = require('../state/gameState');

function registerScreenHandlers(io, socket) {
    console.log(`[SCREEN] Bağlandı: ${socket.id}`);

    // Screen odasına katıl
    socket.join('screen');

    // İlk verileri gönder
    socket.emit('INIT_DATA', {
        contestants: db.getAllContestants(),
        leaderboard: db.getLeaderboard(),
        gameState: gameState.getState(),
        quote: db.getRandomQuote()
    });

    // Yeni özlü söz iste
    socket.on('SCREEN_REQUEST_QUOTE', () => {
        socket.emit('NEW_QUOTE', db.getRandomQuote());
    });

    // Bağlantı kopması
    socket.on('disconnect', () => {
        console.log(`[SCREEN] Ayrıldı: ${socket.id}`);
    });
}

module.exports = { registerScreenHandlers };
