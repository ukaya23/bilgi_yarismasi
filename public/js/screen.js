/**
 * Spectator Screen JavaScript
 */

// ==================== STATE ====================

let socketManager;
let timer;
let contestants = [];
let currentLeaderboard = [];

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', () => {
    // Socket bağlantısı
    socketManager = new SocketManager('screen');

    // Timer
    timer = new Timer(
        document.getElementById('timerValue'),
        (timeLeft) => {
            const timerEl = document.getElementById('timerValue');
            timerEl.classList.remove('warning', 'danger');

            if (timeLeft <= 5) {
                timerEl.classList.add('danger');
            } else if (timeLeft <= 10) {
                timerEl.classList.add('warning');
            }
        },
        null
    );

    // Event listeners
    setupSocketEvents();

    // Connection status
    updateConnectionStatus();
});

// ==================== SOCKET EVENTS ====================

function setupSocketEvents() {
    // İlk veriler
    socketManager.on('INIT_DATA', (data) => {
        console.log('[SCREEN] Init data:', data);
        contestants = data.contestants;
        currentLeaderboard = data.leaderboard;

        updateContestantsPreview();
        handleGameState(data.gameState);

        if (data.quote) {
            showQuote(data.quote);
        }
    });

    // Oyun durumu
    socketManager.on('GAME_STATE', (data) => {
        handleGameState(data);
    });

    // Maskelenmiş soru (soru metni yok)
    socketManager.on('MASKED_QUESTION', (data) => {
        showQuestionScreen(data);
    });

    // Zaman senkronizasyonu
    socketManager.on('TIME_SYNC', (data) => {
        timer.sync(data.timeRemaining);
    });

    // Yarışmacı güncelleme
    socketManager.on('CONTESTANTS_UPDATED', (data) => {
        contestants = data;
        updateContestantsGrid();
        updateContestantsPreview();
    });

    // Oyuncu durumu güncelleme
    socketManager.on('PLAYER_STATUS_UPDATE', (data) => {
        updatePlayerStatus(data.contestantId, data.status);
    });

    // Değerlendirme durumu
    socketManager.on('GRADING_STATUS', (data) => {
        showGradingScreen(data.message);
    });

    // Sonuçlar
    socketManager.on('SHOW_RESULTS', (data) => {
        showResultsScreen(data);
    });

    // Yeni özlü söz
    socketManager.on('NEW_QUOTE', (data) => {
        showQuote(data);
    });

    // Oyun sıfırlama
    socketManager.on('GAME_RESET', () => {
        showScreen('idleScreen');
    });
}

// ==================== CONNECTION STATUS ====================

function updateConnectionStatus() {
    const dot = document.getElementById('connectionDot');

    setInterval(() => {
        if (socketManager.isConnected) {
            dot.classList.add('status-online');
            dot.classList.remove('status-offline');
        } else {
            dot.classList.remove('status-online');
            dot.classList.add('status-offline');
        }
    }, 1000);
}

// ==================== SCREEN MANAGEMENT ====================

function showScreen(screenId) {
    document.querySelectorAll('.screen-state').forEach(s => s.classList.add('hidden'));
    document.getElementById(screenId).classList.remove('hidden');
}

// ==================== GAME STATE ====================

function handleGameState(state) {
    switch (state.state) {
        case 'IDLE':
            showScreen('idleScreen');
            break;
        case 'QUESTION_ACTIVE':
            // MASKED_QUESTION event'ini bekle
            break;
        case 'LOCKED':
        case 'GRADING':
            showGradingScreen('Değerlendirme Sürüyor...');
            break;
        case 'REVEAL':
            // SHOW_RESULTS event'ini bekle
            break;
    }
}

// ==================== IDLE SCREEN ====================

function updateContestantsPreview() {
    const container = document.getElementById('contestantsPreview');
    const online = contestants.filter(c => c.status === 'ONLINE');

    container.innerHTML = '';

    online.forEach(c => {
        const badge = document.createElement('div');
        badge.className = 'preview-badge online';
        badge.innerHTML = `
            <span class="status-dot status-online"></span>
            <span>Masa ${c.table_no}: ${c.name}</span>
        `;
        container.appendChild(badge);
    });

    if (online.length === 0) {
        container.innerHTML = '<p class="text-muted">Henüz yarışmacı bağlanmadı</p>';
    }
}

// ==================== QUESTION SCREEN ====================

function showQuestionScreen(data) {
    showScreen('questionScreen');

    // Timer başlat
    timer.start(data.duration);
    document.getElementById('timerValue').classList.remove('warning', 'danger');

    // Bilgileri göster
    document.getElementById('categoryValue').textContent = data.category || 'Genel Kültür';
    document.getElementById('pointsValue').textContent = data.points;

    // Özlü söz
    if (data.quote) {
        showQuote(data.quote);
    }

    // Yarışmacı gridini güncelle
    updateContestantsGrid();
}

function showQuote(quote) {
    document.getElementById('quoteText').textContent = `"${quote.text}"`;
    document.getElementById('quoteAuthor').textContent = `— ${quote.author}`;
}

function updateContestantsGrid() {
    const grid = document.getElementById('contestantsGrid');
    grid.innerHTML = '';

    contestants.forEach(c => {
        const card = document.createElement('div');
        card.className = `contestant-card ${c.status.toLowerCase()}`;
        card.id = `screen-contestant-${c.id}`;
        card.innerHTML = `
            <div class="contestant-table">${c.table_no}</div>
            <div class="contestant-name">${c.name}</div>
        `;
        grid.appendChild(card);
    });
}

function updatePlayerStatus(contestantId, status) {
    const card = document.getElementById(`screen-contestant-${contestantId}`);
    if (card) {
        card.classList.remove('online', 'answered', 'offline');
        card.classList.add(status === 'answered' ? 'answered' : 'online');
    }
}

// ==================== GRADING SCREEN ====================

function showGradingScreen(message) {
    showScreen('gradingScreen');
    document.querySelector('.grading-content h2').textContent = message;
}

// ==================== RESULTS SCREEN ====================

function showResultsScreen(data) {
    showScreen('resultsScreen');

    // Soru ve cevabı göster
    document.getElementById('revealQuestion').textContent = data.question.content;
    document.getElementById('revealAnswer').textContent = data.question.correctAnswer;

    // Liderlik tablosunu güncelle
    updateLeaderboard(data.leaderboard);
}

function updateLeaderboard(leaderboard) {
    const container = document.getElementById('leaderboard');
    container.innerHTML = '';

    leaderboard.forEach((entry, index) => {
        const div = document.createElement('div');
        div.className = 'leaderboard-entry';

        if (index === 0) div.classList.add('top-1');
        else if (index === 1) div.classList.add('top-2');
        else if (index === 2) div.classList.add('top-3');

        const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`;

        div.innerHTML = `
            <div class="entry-rank">${rankEmoji}</div>
            <div class="entry-info">
                <div class="entry-name">${entry.name}</div>
                <div class="entry-table">Masa ${entry.table_no}</div>
            </div>
            <div class="entry-score">${entry.total_score}</div>
        `;

        container.appendChild(div);
    });
}

// ==================== PERIODIC QUOTE UPDATE ====================

// Her 30 saniyede bir yeni özlü söz iste (idle modunda)
setInterval(() => {
    const idleScreen = document.getElementById('idleScreen');
    if (!idleScreen.classList.contains('hidden')) {
        socketManager.emit('SCREEN_REQUEST_QUOTE');
    }
}, 30000);
