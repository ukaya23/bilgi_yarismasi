/**
 * Player Interface - Entry Point (ES Module)
 */

import { SocketManager, Timer, showToast, escapeHtml } from './common.js';

// ==================== STATE ====================

let socketManager;
let timer;
let playerData = null;
let currentQuestion = null;
let selectedAnswer = null;
let hasSubmitted = false;
let sessionToken = null;

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', async () => {
    timer = new Timer(
        document.getElementById('questionTimer'),
        (timeLeft) => {
            if (timeLeft <= 5 && !hasSubmitted) {
                document.getElementById('questionTimer').classList.add('danger');
            }
        },
        () => {
            if (!hasSubmitted && selectedAnswer !== null) {
                submitAnswer();
            }
        }
    );

    setupEventListeners();

    sessionToken = localStorage.getItem('playerSessionToken');
    if (sessionToken) {
        const isValid = await validateExistingSession();
        if (isValid) {
            initializeSocket();
            return;
        }
    }

    updateConnectionStatus();
});

async function validateExistingSession() {
    try {
        const response = await fetch('/api/auth/validate-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken })
        });
        const data = await response.json();

        if (data.valid && data.role === 'CONTESTANT') {
            playerData = {
                name: data.name,
                tableNo: data.slotNumber,
                competitionName: data.competitionName
            };
            if (data.accessToken) {
                localStorage.setItem('playerAccessToken', data.accessToken);
            }
            if (data.refreshToken) {
                localStorage.setItem('playerRefreshToken', data.refreshToken);
            }
            return true;
        }
    } catch (error) {
        console.error('Session validation error:', error);
    }

    localStorage.removeItem('playerSessionToken');
    sessionToken = null;
    return false;
}

function initializeSocket() {
    socketManager = new SocketManager('player');
    setupSocketEvents();
    updateConnectionStatus();

    // Send login on every connect (initial + reconnect)
    socketManager.getSocket().on('connect', () => {
        if (playerData) {
            socketManager.emit('PLAYER_LOGIN', {
                name: playerData.name,
                tableNo: playerData.tableNo
            });
        }
    });

    showScreen('waitingScreen');
    updatePlayerInfo();
}

// ==================== EVENT LISTENERS ====================

function setupEventListeners() {
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await login();
    });

    document.getElementById('submitAnswerBtn').addEventListener('click', submitAnswer);

    document.getElementById('answerInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            submitAnswer();
        }
    });

    const codeInput = document.getElementById('accessCode');
    if (codeInput) {
        codeInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
    }
}

// ==================== SOCKET EVENTS ====================

function setupSocketEvents() {
    socketManager.on('INIT_DATA', (data) => {
        // INIT_DATA now arrives after PLAYER_LOGIN with full reconnection state

        // If player already answered current question, restore submitted state
        if (data.alreadyAnswered) {
            hasSubmitted = true;
            showSubmittedScreen();
            return;
        }

        // If we're in REVEAL/GRADING and results are available, show them
        if (data.lastResults) {
            showResults(data.lastResults);
            return;
        }

        // Active question - show it (page refresh during question)
        if (data.activeQuestion && playerData && !hasSubmitted) {
            currentQuestion = data.activeQuestion;
            showQuestion(data.activeQuestion);
            if (data.activeQuestion.timeRemaining != null) {
                timer.sync(data.activeQuestion.timeRemaining);
            }
        }
    });

    socketManager.on('LOGIN_RESULT', (data) => {
        if (data.success) {
            playerData.id = data.contestantId;
            showToast('Başarıyla giriş yapıldı!', 'success');
        } else {
            showToast(data.error || 'Giriş başarısız', 'error');
        }
    });

    socketManager.on('GAME_STATE', (data) => {
        handleGameState(data);
    });

    socketManager.on('NEW_QUESTION', (data) => {
        currentQuestion = data;
        hasSubmitted = false;
        selectedAnswer = null;
        showQuestion(data);
    });

    socketManager.on('TIME_SYNC', (data) => {
        timer.sync(data.timeRemaining);
    });

    socketManager.on('ANSWER_RESULT', (data) => {
        if (data.success) {
            hasSubmitted = true;
            showSubmittedScreen();
        } else {
            showToast(data.error || 'Cevap gönderilemedi', 'error');
        }
    });

    socketManager.on('SHOW_RESULTS', (data) => {
        showResults(data);
    });

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
        if (socketManager && socketManager.isConnected) {
            dot.classList.add('status-online');
            dot.classList.remove('status-offline');
            text.textContent = 'Bağlı';
        } else {
            dot.classList.remove('status-online');
            dot.classList.add('status-offline');
            text.textContent = sessionToken ? 'Bağlanıyor...' : 'Bağlantı yok';
        }
    }, 1000);
}

// ==================== SCREEN MANAGEMENT ====================

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(screenId).classList.remove('hidden');
}

// ==================== LOGIN ====================

async function login() {
    const code = document.getElementById('accessCode').value.trim().toUpperCase();
    const errorEl = document.getElementById('errorMessage');
    const loginBtn = document.getElementById('loginBtn');

    if (!code || code.length !== 6) {
        errorEl.textContent = 'Lütfen 6 haneli kodu girin';
        errorEl.style.display = 'block';
        return;
    }

    loginBtn.disabled = true;
    errorEl.style.display = 'none';

    try {
        const response = await fetch('/api/auth/validate-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            if (data.role !== 'CONTESTANT') {
                errorEl.textContent = 'Bu kod yarışmacı kodu değil';
                errorEl.style.display = 'block';
                loginBtn.disabled = false;
                return;
            }

            sessionToken = data.sessionToken;
            localStorage.setItem('playerSessionToken', sessionToken);

            if (data.accessToken) {
                localStorage.setItem('playerAccessToken', data.accessToken);
            }
            if (data.refreshToken) {
                localStorage.setItem('playerRefreshToken', data.refreshToken);
            }

            playerData = {
                name: data.name,
                tableNo: data.slotNumber,
                competitionName: data.competitionName
            };

            initializeSocket();
        } else {
            errorEl.textContent = data.error || 'Geçersiz kod';
            errorEl.style.display = 'block';
        }
    } catch (error) {
        console.error('Login error:', error);
        errorEl.textContent = 'Sunucu bağlantı hatası';
        errorEl.style.display = 'block';
    } finally {
        loginBtn.disabled = false;
    }
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

    timer.start(question.duration);
    document.getElementById('questionTimer').classList.remove('warning', 'danger');

    document.getElementById('questionPoints').textContent = `${question.points} Puan`;
    document.getElementById('questionText').textContent = question.content;

    const mediaContainer = document.getElementById('questionMedia');

    if (question.media_url) {
        const img = document.getElementById('questionImage');
        img.src = question.media_url;

        img.onload = () => {
            mediaContainer.classList.remove('hidden');
        };
        img.onerror = () => {
            mediaContainer.classList.add('hidden');
        };

        mediaContainer.classList.remove('hidden');
    } else {
        mediaContainer.classList.add('hidden');
    }

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

    document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));

    btn.classList.add('selected');
    selectedAnswer = option;

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

    document.getElementById('correctAnswer').textContent = data.question.correctAnswer;

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

    leaderboard.slice(0, 10).forEach((entry, index) => {
        const div = document.createElement('div');
        div.className = `p-leaderboard-entry ${entry.id === playerData?.id ? 'is-me' : ''}`;
        div.style.animationDelay = `${index * 0.1}s`;

        div.innerHTML = `
            <div class="p-rank">${index + 1}</div>
            <div class="p-info">
                <span class="p-name">${escapeHtml(entry.name)}</span>
                <span class="p-table">Masa ${escapeHtml(String(entry.table_no))}</span>
            </div>
            <div class="p-score">${entry.total_score}</div>
        `;
        container.appendChild(div);
    });
}

// ==================== HEARTBEAT ====================

setInterval(() => {
    if (socketManager && socketManager.isConnected && playerData) {
        socketManager.emit('PLAYER_HEARTBEAT');
    }
}, 5000);
