/**
 * Admin (Sunucu) Event Handler
 */

const db = require('../../database/postgres');

async function registerAdminHandlers(io, socket, gameState) {
    console.log(`[ADMIN] Bağlandı: ${socket.id}`);

    // Admin odasına katıl
    socket.join('admin');

    // İlk durumu gönder
    const competitionId = gameState.competitionId;
    socket.emit('INIT_DATA', {
        questions: await db.getAllQuestions(),
        contestants: await db.getAllContestants(competitionId),
        gameState: gameState.getState(),
        leaderboard: await db.getLeaderboard(competitionId),
        askedQuestionIds: await db.getAskedQuestionIds(competitionId)
    });

    // Soru başlat
    socket.on('ADMIN_START_QUESTION', async (data) => {
        try {
            const { questionId } = data;
            await gameState.startQuestion(questionId);
            socket.emit('ACTION_RESULT', { success: true, action: 'START_QUESTION' });
        } catch (error) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });

    // Soruyu erken bitir
    socket.on('ADMIN_SKIP_TO_GRADING', async () => {
        try {
            await gameState.lockQuestion();
            socket.emit('ACTION_RESULT', { success: true, action: 'SKIP_TO_GRADING' });
        } catch (error) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });

    // Sonuçları göster
    socket.on('ADMIN_REVEAL_RESULTS', async () => {
        try {
            await gameState.showResults();
            socket.emit('ACTION_RESULT', { success: true, action: 'REVEAL_RESULTS' });
        } catch (error) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });

    // Bekleme moduna geç
    socket.on('ADMIN_GO_IDLE', async () => {
        try {
            await gameState.goToIdle();
            socket.emit('ACTION_RESULT', { success: true, action: 'GO_IDLE' });
        } catch (error) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });

    // Kürsüyü Göster
    socket.on('ADMIN_SHOW_PODIUM', async () => {
        try {
            const leaderboard = await db.getLeaderboard(competitionId);
            gameState.io.emit('SHOW_PODIUM', { leaderboard: leaderboard.slice(0, 3) });
            socket.emit('ACTION_RESULT', { success: true, action: 'SHOW_PODIUM' });
        } catch (error) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });

    // Oyunu sıfırla
    socket.on('ADMIN_RESET_GAME', async () => {
        try {
            // Aktif yarışmayı bul ve kodları sıfırla
            const activeCompetition = await db.getActiveCompetition();
            if (activeCompetition) {
                await db.resetAllAccessCodes(activeCompetition.id);
            }

            await gameState.resetGame();
            socket.emit('ACTION_RESULT', { success: true, action: 'RESET_GAME' });
        } catch (error) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });

    // Yeni soru ekle
    socket.on('ADMIN_ADD_QUESTION', async (data) => {
        try {
            const id = await db.addQuestion(data);
            io.to('admin').emit('QUESTIONS_UPDATED', await db.getAllQuestions());
            socket.emit('ACTION_RESULT', { success: true, action: 'ADD_QUESTION', id });
        } catch (error) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });

    // Soru güncelle
    socket.on('ADMIN_UPDATE_QUESTION', async (data) => {
        try {
            const { id, ...question } = data;
            await db.updateQuestion(id, question);
            io.to('admin').emit('QUESTIONS_UPDATED', await db.getAllQuestions());
            socket.emit('ACTION_RESULT', { success: true, action: 'UPDATE_QUESTION' });
        } catch (error) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });

    // Soru sil
    socket.on('ADMIN_DELETE_QUESTION', async (data) => {
        try {
            await db.deleteQuestion(data.id);
            io.to('admin').emit('QUESTIONS_UPDATED', await db.getAllQuestions());
            socket.emit('ACTION_RESULT', { success: true, action: 'DELETE_QUESTION' });
        } catch (error) {
            socket.emit('ACTION_RESULT', { success: false, error: error.message });
        }
    });

    // Yarışmacıları yenile
    socket.on('ADMIN_REFRESH_CONTESTANTS', async () => {
        socket.emit('CONTESTANTS_UPDATED', await db.getAllContestants(competitionId));
    });

    // Sonuç açıklama adımını ilerlet
    socket.on('ADMIN_NEXT_STEP', () => {
        if (gameState.state === 'REVEAL') {
            gameState.nextRevealStep();
        }
    });

    // Bağlantı kopması
    socket.on('disconnect', () => {
        console.log(`[ADMIN] Ayrıldı: ${socket.id}`);
    });
}

module.exports = { registerAdminHandlers };
