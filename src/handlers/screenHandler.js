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
    socket.emit('INIT_DATA', {
        contestants: await db.getAllContestants(),
        leaderboard: await db.getLeaderboard(),
        gameState: gameState.getState(),
        quote: await db.getRandomQuote()
    });

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
