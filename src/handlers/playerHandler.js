/**
 * Yarışmacı Event Handler
 */

const db = require('../../database/db');
const gameState = require('../state/gameState');

// Socket ID -> Contestant ID mapping (reconnect için)
const socketContestantMap = new Map();

function registerPlayerHandlers(io, socket) {
    console.log(`[PLAYER] Bağlandı: ${socket.id}`);

    // Socket'e contestant bilgisini ekle
    socket.contestantId = null;

    // Player odasına hemen katıl (login olmasa bile eventleri alabilsin)
    socket.join('player');

    // İlk durumu gönder (PLAYER_LOGIN tetiklemesi için gerekli)
    socket.emit('INIT_DATA', {
        gameState: gameState.getState()
    });

    // Giriş
    socket.on('PLAYER_LOGIN', (data) => {
        try {
            const { name, tableNo } = data;

            if (!name || !tableNo) {
                socket.emit('LOGIN_RESULT', { success: false, error: 'İsim ve masa numarası gerekli' });
                return;
            }

            // Yarışmacıyı veritabanına ekle/güncelle
            const contestantId = db.upsertContestant(name, parseInt(tableNo));
            db.updateContestantSocket(contestantId, socket.id);

            // Socket'e contestant ID'yi kaydet
            socket.contestantId = contestantId;

            // Mapping'e de ekle (reconnect için)
            socketContestantMap.set(socket.id, contestantId);

            // Başarılı giriş bildirimi
            socket.emit('LOGIN_RESULT', {
                success: true,
                contestantId,
                name,
                tableNo: parseInt(tableNo)
            });

            // Mevcut oyun durumunu gönder
            socket.emit('GAME_STATE', gameState.getState());

            // Tüm admin ve seyircilere bildir
            io.to('admin').emit('CONTESTANTS_UPDATED', db.getAllContestants());
            io.to('screen').emit('CONTESTANTS_UPDATED', db.getAllContestants());

            console.log(`[PLAYER] Giriş başarılı: ${name} (Masa ${tableNo}) - Contestant ID: ${contestantId}`);
        } catch (error) {
            console.error('[PLAYER] Login hatası:', error);
            socket.emit('LOGIN_RESULT', { success: false, error: error.message });
        }
    });

    // Cevap gönder
    socket.on('PLAYER_SUBMIT_ANSWER', (data) => {
        try {
            const contestantId = socket.contestantId;

            console.log(`[PLAYER] Cevap gönderme isteği - Socket: ${socket.id}, Contestant ID: ${contestantId}`);

            if (contestantId === null || contestantId === undefined) {
                console.log('[PLAYER] Giriş yapılmamış - contestantId yok');
                socket.emit('ANSWER_RESULT', { success: false, error: 'Giriş yapılmamış. Lütfen tekrar giriş yapın.' });
                return;
            }

            const { answer, timeRemaining } = data;
            console.log(`[PLAYER] Cevap: "${answer}", Kalan süre: ${timeRemaining}`);

            const result = gameState.submitAnswer(contestantId, answer, timeRemaining);

            socket.emit('ANSWER_RESULT', result);

            if (result.success) {
                console.log(`[PLAYER] Cevap başarılı: Yarışmacı ${contestantId} -> "${answer}"`);
            } else {
                console.log(`[PLAYER] Cevap başarısız: ${result.message}`);
            }
        } catch (error) {
            console.error('[PLAYER] Cevap gönderme hatası:', error);
            socket.emit('ANSWER_RESULT', { success: false, error: error.message });
        }
    });

    // Heartbeat (bağlantı kontrolü)
    socket.on('PLAYER_HEARTBEAT', () => {
        socket.emit('HEARTBEAT_ACK', { timestamp: Date.now() });
    });

    // Bağlantı kopması
    socket.on('disconnect', () => {
        const contestantId = socket.contestantId;
        if (contestantId) {
            db.updateContestantStatus(contestantId, 'OFFLINE');
            socketContestantMap.delete(socket.id);
            io.to('admin').emit('CONTESTANTS_UPDATED', db.getAllContestants());
            io.to('screen').emit('CONTESTANTS_UPDATED', db.getAllContestants());
            console.log(`[PLAYER] Ayrıldı: Yarışmacı ${contestantId}`);
        }
    });
}

module.exports = { registerPlayerHandlers };
