/**
 * Player Interface JavaScript
 */

// ==================== STATE ====================

let socketManager;
let timer;
let playerData = null;
let currentQuestion = null;
let selectedAnswer = null;
let hasSubmitted = false;

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', () => {
    // Socket bağlantısı
    socketManager = new SocketManager('player');

    // Timer
    timer = new Timer(
        document.getElementById('questionTimer'),
        (timeLeft) => {
            // Son 5 saniyede uyarı
            if (timeLeft <= 5 && !hasSubmitted) {
                document.getElementById('questionTimer').classList.add('danger');
            }
        },
        () => {
            // Süre doldu, otomatik gönder
            if (!hasSubmitted && selectedAnswer !== null) {
                submitAnswer();
            }
        }
    );

    // Check for saved login
    const savedPlayer = storage.get('playerData');
    if (savedPlayer) {
        document.getElementById('playerName').value = savedPlayer.name || '';
        document.getElementById('tableNo').value = savedPlayer.tableNo || '';
    }

    // Event listeners
    setupEventListeners();
    setupSocketEvents();

    // Connection status
    updateConnectionStatus();
});

// ==================== EVENT LISTENERS ====================

function setupEventListeners() {
    // Login form
    document.getElementById('loginForm').addEventListener('submit', (e) => {
        e.preventDefault();
        login();
    });

    // Submit answer button (open-ended)
    document.getElementById('submitAnswerBtn').addEventListener('click', submitAnswer);

    // Enter key for answer input
    document.getElementById('answerInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            submitAnswer();
        }
    });
}

// ==================== SOCKET EVENTS ====================

function setupSocketEvents() {
    // Login sonucu
    socketManager.on('LOGIN_RESULT', (data) => {
        if (data.success) {
            playerData = {
                id: data.contestantId,
                name: data.name,
                tableNo: data.tableNo
            };

            // Save to localStorage
            storage.set('playerData', playerData);

            showScreen('waitingScreen');
            updatePlayerInfo();
            showToast('Başarıyla giriş yapıldı!', 'success');
        } else {
            showToast(data.error || 'Giriş başarısız', 'error');
        }
    });

    // Oyun durumu
    socketManager.on('GAME_STATE', (data) => {
        handleGameState(data);
    });

    // Yeni soru
    socketManager.on('NEW_QUESTION', (data) => {
        currentQuestion = data;
        hasSubmitted = false;
        selectedAnswer = null;
        showQuestion(data);
    });

    // Zaman senkronizasyonu
    socketManager.on('TIME_SYNC', (data) => {
        timer.sync(data.timeRemaining);
    });

    // Cevap sonucu
    socketManager.on('ANSWER_RESULT', (data) => {
        if (data.success) {
            hasSubmitted = true;
            showSubmittedScreen();
        } else {
            showToast(data.error || 'Cevap gönderilemedi', 'error');
        }
    });

    // Sonuçlar
    socketManager.on('SHOW_RESULTS', (data) => {
        showResults(data);
    });

    // Oyun sıfırlama
    socketManager.on('GAME_RESET', () => {
        showScreen('waitingScreen');
        showToast('Yarışma sıfırlandı', 'warning');
    });
}

// ==================== CONNECTION STATUS ====================

function updateConnectionStatus() {
    const dot = document.getElementById('connectionDot');
    const text = document.getElementById('connectionText');

    setInterval(() => {
        if (socketManager.isConnected) {
            dot.classList.add('status-online');
            dot.classList.remove('status-offline');
            text.textContent = 'Bağlı';
        } else {
            dot.classList.remove('status-online');
            dot.classList.add('status-offline');
            text.textContent = 'Bağlantı yok';
        }
    }, 1000);
}

// ==================== SCREEN MANAGEMENT ====================

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(screenId).classList.remove('hidden');
}

// ==================== LOGIN ====================

function login() {
    const name = document.getElementById('playerName').value.trim();
    const tableNo = document.getElementById('tableNo').value;

    if (!name || !tableNo) {
        showToast('Lütfen tüm alanları doldurun', 'error');
        return;
    }

    socketManager.emit('PLAYER_LOGIN', {
        name: name,
        tableNo: parseInt(tableNo)
    });
}

function updatePlayerInfo() {
    if (playerData) {
        document.getElementById('playerTableBadge').textContent = `Masa ${playerData.tableNo}`;
        document.getElementById('playerNameDisplay').textContent = playerData.name;
    }
}

// ==================== GAME STATE HANDLING ====================

function handleGameState(state) {
    switch (state.state) {
        case 'IDLE':
            resetLeaderboardView();
            showScreen('waitingScreen');
            break;
        case 'QUESTION_ACTIVE':
            resetLeaderboardView();
            if (state.currentQuestion && !hasSubmitted) {
                currentQuestion = state.currentQuestion;
                showQuestion(state.currentQuestion);
            }
            break;
        case 'LOCKED':
        case 'GRADING':
            if (hasSubmitted) {
                showSubmittedScreen();
            }
            break;
        case 'REVEAL':
            // Results will be shown via SHOW_RESULTS event
            break;
    }
}

function resetLeaderboardView() {
    const resultsContainer = document.querySelector('.results-container');
    if (resultsContainer) {
        resultsContainer.classList.remove('show-leaderboard');
    }
    const lbSection = document.getElementById('playerLeaderboardSection');
    if (lbSection) {
        lbSection.classList.add('hidden');
    }
}

// ==================== QUESTION DISPLAY ====================

function showQuestion(question) {
    showScreen('questionScreen');

    // Timer başlat
    timer.start(question.duration);
    document.getElementById('questionTimer').classList.remove('warning', 'danger');

    // Soru bilgilerini göster
    document.getElementById('questionPoints').textContent = `${question.points} Puan`;
    document.getElementById('questionText').textContent = question.content;

    // Medya
    const mediaContainer = document.getElementById('questionMedia');
    if (question.media_url) {
        document.getElementById('questionImage').src = question.media_url;
        mediaContainer.classList.remove('hidden');
    } else {
        mediaContainer.classList.add('hidden');
    }

    // Cevap türüne göre göster
    if (question.type === 'MULTIPLE_CHOICE') {
        showMultipleChoice(question.options);
    } else {
        showOpenEnded();
    }
}

function showMultipleChoice(options) {
    document.getElementById('openEndedSection').classList.add('hidden');
    document.getElementById('multipleChoiceSection').classList.remove('hidden');

    const grid = document.getElementById('optionsGrid');
    grid.innerHTML = '';

    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];

    options.forEach((option, index) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerHTML = `
            <span class="option-letter">${letters[index]}</span>
            <span class="option-text">${escapeHtml(option)}</span>
        `;
        btn.addEventListener('click', () => selectOption(btn, option));
        grid.appendChild(btn);
    });
}

function showOpenEnded() {
    document.getElementById('multipleChoiceSection').classList.add('hidden');
    document.getElementById('openEndedSection').classList.remove('hidden');

    const input = document.getElementById('answerInput');
    input.value = '';
    input.disabled = false;
    input.focus();

    document.getElementById('submitAnswerBtn').disabled = false;
}

function selectOption(btn, option) {
    if (hasSubmitted) return;

    // Önceki seçimi kaldır
    document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));

    // Yeni seçimi işaretle
    btn.classList.add('selected');
    selectedAnswer = option;

    // Otomatik gönder
    submitAnswer();
}

// ==================== ANSWER SUBMISSION ====================

function submitAnswer() {
    if (hasSubmitted) return;

    let answer;

    if (currentQuestion.type === 'MULTIPLE_CHOICE') {
        answer = selectedAnswer;
        if (!answer) {
            showToast('Lütfen bir şık seçin', 'warning');
            return;
        }
    } else {
        answer = document.getElementById('answerInput').value.trim();
        if (!answer) {
            showToast('Lütfen bir cevap yazın', 'warning');
            return;
        }
    }

    // Disable inputs
    if (currentQuestion.type === 'OPEN_ENDED') {
        document.getElementById('answerInput').disabled = true;
        document.getElementById('submitAnswerBtn').disabled = true;
    } else {
        document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
    }

    socketManager.emit('PLAYER_SUBMIT_ANSWER', {
        answer: answer,
        timeRemaining: timer.getTime()
    });

    // Store for display
    selectedAnswer = answer;
}

function showSubmittedScreen() {
    showScreen('submittedScreen');
    timer.stop();

    document.querySelector('#submittedAnswer span').textContent = selectedAnswer || '-';
}

// ==================== RESULTS ====================

function showResults(data) {
    showScreen('resultsScreen');

    // Doğru cevap
    document.getElementById('correctAnswer').textContent = data.question.correctAnswer;

    // Kullanıcının cevabı
    const myAnswer = data.answers.find(a => a.contestant_id === playerData?.id);

    if (myAnswer) {
        document.getElementById('yourAnswer').textContent = myAnswer.answer_text || '-';

        const badge = document.getElementById('resultBadge');
        const icon = document.getElementById('resultIcon');
        const scoreChange = document.getElementById('scoreChange');

        if (myAnswer.is_correct) {
            badge.textContent = 'Doğru!';
            badge.className = 'result-badge correct';
            icon.textContent = '🎉';
            scoreChange.textContent = `+${myAnswer.points_awarded}`;
            scoreChange.style.color = 'var(--success)';
        } else {
            badge.textContent = 'Yanlış';
            badge.className = 'result-badge incorrect';
            icon.textContent = '😔';
            scoreChange.textContent = '0';
            scoreChange.style.color = 'var(--text-muted)';
        }
    } else {
        document.getElementById('yourAnswer').textContent = 'Cevap verilmedi';
        document.getElementById('resultBadge').textContent = 'Süre doldu';
        document.getElementById('resultBadge').className = 'result-badge incorrect';
        document.getElementById('resultIcon').textContent = '⏰';
        document.getElementById('scoreChange').textContent = '0';
    }

    // 5 saniye sonra sıralama ekranına geç
    setTimeout(() => {
        if (!document.getElementById('resultsScreen').classList.contains('hidden')) {
            renderPlayerLeaderboard(data.leaderboard);
            document.querySelector('.results-container').classList.add('show-leaderboard');
            document.getElementById('playerLeaderboardSection').classList.remove('hidden');
        }
    }, 5000);
}

function renderPlayerLeaderboard(leaderboard) {
    const container = document.getElementById('playerLeaderboard');
    container.innerHTML = '';

    // İlk 10'u göster
    leaderboard.slice(0, 10).forEach((entry, index) => {
        const div = document.createElement('div');
        div.className = `p-leaderboard-entry ${entry.id === playerData?.id ? 'is-me' : ''}`;
        div.style.animationDelay = `${index * 0.1}s`;

        div.innerHTML = `
            <div class="p-rank">${index + 1}</div>
            <div class="p-info">
                <span class="p-name">${escapeHtml(entry.name)}</span>
                <span class="p-table">Masa ${entry.table_no}</span>
            </div>
            <div class="p-score">${entry.total_score}</div>
        `;
        container.appendChild(div);
    });
}

// ==================== HEARTBEAT ====================

setInterval(() => {
    if (socketManager.isConnected && playerData) {
        socketManager.emit('PLAYER_HEARTBEAT');
    }
}, 5000);
