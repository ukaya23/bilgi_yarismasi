/**
 * Yarışmacı Event Handler
 */

const db = require('../../database/postgres');

// Socket ID -> Contestant ID mapping (reconnect için)
const socketContestantMap = new Map();

function registerPlayerHandlers(io, socket, gameState) {
    console.log(`[PLAYER] Bağlandı: ${socket.id}`);

    // Socket'e contestant bilgisini ekle
    socket.contestantId = null;

    // Player odasına hemen katıl (login olmasa bile eventleri alabilsin)
    socket.join('player');

    // İlk durumu gönder (PLAYER_LOGIN tetiklemesi için gerekli)
    const currentState = gameState.getState();
    const initPayload = {
        gameState: currentState
    };

    // Aktif soru varsa soru verisini de ekle
    if (currentState.state === 'QUESTION_ACTIVE' && gameState.currentQuestion) {
        initPayload.activeQuestion = {
            id: gameState.currentQuestion.id,
            content: gameState.currentQuestion.content,
            type: gameState.currentQuestion.type,
            options: gameState.currentQuestion.options,
            points: gameState.currentQuestion.points,
            duration: gameState.currentQuestion.duration,
            media_url: gameState.currentQuestion.media_url,
            index: gameState.currentQuestion.index,
            total: gameState.currentQuestion.total,
            timeRemaining: gameState.timeRemaining
        };
    }

    socket.emit('INIT_DATA', initPayload);

    // Giriş
    socket.on('PLAYER_LOGIN', async (data) => {
        try {
            const { name, tableNo } = data;

            if (!name || !tableNo) {
                socket.emit('LOGIN_RESULT', { success: false, error: 'İsim ve masa numarası gerekli' });
                return;
            }

            // Yarışmacıyı veritabanına ekle/güncelle
            const competitionId = gameState.competitionId;
            const contestantId = await db.upsertContestant(name, parseInt(tableNo), competitionId);
            await db.updateContestantSocket(contestantId, socket.id);

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
            const contestants = await db.getAllContestants(competitionId);
            io.to('admin').emit('CONTESTANTS_UPDATED', contestants);
            io.to('screen').emit('CONTESTANTS_UPDATED', contestants);

            console.log(`[PLAYER] Giriş başarılı: ${name} (Masa ${tableNo}) - Contestant ID: ${contestantId}`);
        } catch (error) {
            console.error('[PLAYER] Login hatası:', error);
            socket.emit('LOGIN_RESULT', { success: false, error: error.message });
        }
    });

    // Cevap gönder
    socket.on('PLAYER_SUBMIT_ANSWER', async (data) => {
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

            const result = await gameState.submitAnswer(contestantId, answer, timeRemaining);

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
    socket.on('disconnect', async () => {
        const contestantId = socket.contestantId;
        if (contestantId) {
            await db.updateContestantStatus(contestantId, 'OFFLINE');
            socketContestantMap.delete(socket.id);
            const contestants = await db.getAllContestants(gameState.competitionId);
            io.to('admin').emit('CONTESTANTS_UPDATED', contestants);
            io.to('screen').emit('CONTESTANTS_UPDATED', contestants);
            console.log(`[PLAYER] Ayrıldı: Yarışmacı ${contestantId}`);
        }
    });
}

module.exports = { registerPlayerHandlers };
