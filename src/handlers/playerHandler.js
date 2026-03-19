/**
 * Yarışmacı Event Handler
 */

const db = require('../../database/postgres');
const log = require('../utils/logger');

// Socket ID -> Contestant ID mapping (reconnect için)
const socketContestantMap = new Map();

function registerPlayerHandlers(io, socket, gameState) {
    log.info({ socketId: socket.id }, 'Player baglandi');

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

            log.info({ name, tableNo, contestantId }, 'Player giris basarili');
        } catch (error) {
            log.error({ err: error }, 'Player login hatasi');
            socket.emit('LOGIN_RESULT', { success: false, error: error.message });
        }
    });

    // Cevap gönder
    socket.on('PLAYER_SUBMIT_ANSWER', async (data) => {
        try {
            const contestantId = socket.contestantId;

            log.debug({ socketId: socket.id, contestantId }, 'Cevap gonderme istegi');

            if (contestantId === null || contestantId === undefined) {
                log.debug('Giris yapilmamis - contestantId yok');
                socket.emit('ANSWER_RESULT', { success: false, error: 'Giriş yapılmamış. Lütfen tekrar giriş yapın.' });
                return;
            }

            const { answer, timeRemaining } = data;
            log.debug({ answer, timeRemaining }, 'Cevap alindi');

            const result = await gameState.submitAnswer(contestantId, answer, timeRemaining);

            socket.emit('ANSWER_RESULT', result);

            if (result.success) {
                log.info({ contestantId, answer }, 'Cevap basarili');
            } else {
                log.debug({ contestantId, message: result.message }, 'Cevap basarisiz');
            }
        } catch (error) {
            log.error({ err: error }, 'Cevap gonderme hatasi');
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
            log.info({ contestantId }, 'Player ayrildi');
        }
    });
}

module.exports = { registerPlayerHandlers };
