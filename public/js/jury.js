/**
 * Jury Panel JavaScript
 */

// ==================== STATE ====================

let socketManager;
let currentQuestionId = null;
let currentPoints = 0;
let currentQuestion = null; // Aktif soru bilgisi
let answerGroups = { correct: [], incorrect: [], empty: [] };
let gradedAnswers = new Set();
let sessionToken = null;
let juryData = null;

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', async () => {
    // Check for existing session
    sessionToken = localStorage.getItem('jurySessionToken');
    if (sessionToken) {
        const isValid = await validateExistingSession();
        if (isValid) {
            initializeSocket();
            return;
        }
    }

    // Event listeners for login
    setupLoginListeners();

    // Connection status
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

        if (data.valid && data.role === 'JURY') {
            juryData = {
                name: data.name,
                slotNumber: data.slotNumber,
                competitionName: data.competitionName
            };
            return true;
        }
    } catch (error) {
        console.error('Session validation error:', error);
    }

    localStorage.removeItem('jurySessionToken');
    sessionToken = null;
    return false;
}

function initializeSocket() {
    // Socket bağlantısı
    socketManager = new SocketManager('jury');

    // Event listeners
    setupEventListeners();
    setupSocketEvents();
    updateConnectionStatus();

    // Yeniden bağlantıda durumu senkronize et
    socketManager.onReconnect(() => {
        console.log('[JURY] Reconnect - state senkronizasyonu...');
    });

    showPanel('waitingPanel');
}

function setupLoginListeners() {
    const loginForm = document.getElementById('juryLoginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await login();
        });
    }

    // Auto uppercase for code input
    const codeInput = document.getElementById('accessCode');
    if (codeInput) {
        codeInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
    }
}

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
            if (data.role !== 'JURY') {
                errorEl.textContent = 'Bu kod jüri kodu değil';
                errorEl.style.display = 'block';
                loginBtn.disabled = false;
                return;
            }

            sessionToken = data.sessionToken;
            localStorage.setItem('jurySessionToken', sessionToken);

            juryData = {
                name: data.name,
                slotNumber: data.slotNumber,
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

// ==================== EVENT LISTENERS ====================

function setupEventListeners() {
    // Toplu puanlama butonları
    document.getElementById('approveCorrectBtn').addEventListener('click', () => {
        gradeGroup('correct', true);
    });

    document.getElementById('rejectAllBtn').addEventListener('click', () => {
        gradeGroup('incorrect', false);
    });

    // Sonuçları işle
    document.getElementById('commitResultsBtn').addEventListener('click', commitResults);
}

// ==================== SOCKET EVENTS ====================

function setupSocketEvents() {
    // Oyun durumu
    socketManager.on('GAME_STATE', (data) => {
        handleGameState(data);
    });

    // Yeni soru
    socketManager.on('NEW_QUESTION', (data) => {
        currentQuestion = data;
        showActiveQuestion(data);
    });

    // Zaman senkronizasyonu
    socketManager.on('TIME_SYNC', (data) => {
        updateTimer(data.timeRemaining);
    });

    // Jüri değerlendirme verileri
    socketManager.on('JURY_REVIEW_DATA', (data) => {
        loadReviewData(data);
    });

    // İşlem sonucu
    socketManager.on('JURY_ACTION_RESULT', (data) => {
        if (data.success) {
            showToast(`${data.action} başarılı`, 'success');

            if (data.action === 'COMMIT_RESULTS') {
                showResultsPanel();
            }
        } else {
            showToast(data.error || 'Bir hata oluştu', 'error');
        }
    });

    // Sonuçlar gösterildi
    socketManager.on('SHOW_RESULTS', (data) => {
        showResultsWithData(data);
    });

    // Oyun sıfırlama
    socketManager.on('GAME_RESET', () => {
        resetState();
        showPanel('waitingPanel');
        updateWaitingMessage('Yarışma Sıfırlandı', 'Yeni bir yarışma bekleniyor...');
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

// ==================== PANEL MANAGEMENT ====================

function showPanel(panelId) {
    document.querySelectorAll('.state-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById(panelId).classList.remove('hidden');
}

function updateWaitingMessage(title, message) {
    document.getElementById('waitingTitle').textContent = title;
    document.getElementById('waitingMessage').textContent = message;
}

// ==================== ACTIVE QUESTION ====================

function showActiveQuestion(question) {
    document.getElementById('activeQuestionBadge').textContent = `Soru #${question.id}`;
    document.getElementById('activeQuestionCategory').textContent = question.category || 'Genel Kültür';
    document.getElementById('activeQuestionPoints').textContent = `${question.points} Puan`;
    document.getElementById('activeQuestionText').textContent = question.content;
    document.getElementById('activeCorrectKeys').textContent = question.correct_keys ? question.correct_keys.join(', ') : '-';
    document.getElementById('timerDisplay').textContent = question.duration;

    // Soru tipi
    const typeInfo = document.getElementById('questionTypeInfo');
    if (question.type === 'MULTIPLE_CHOICE') {
        typeInfo.innerHTML = '<span class="badge badge-primary">Çoktan Seçmeli</span>';
    } else {
        typeInfo.innerHTML = '<span class="badge badge-warning">Açık Uçlu</span>';
    }

    showPanel('activeQuestionPanel');
}

function updateTimer(timeRemaining) {
    const timerEl = document.getElementById('timerDisplay');
    if (timerEl) {
        timerEl.textContent = timeRemaining;

        // Renk değişimi
        if (timeRemaining <= 5) {
            timerEl.classList.add('timer-critical');
        } else if (timeRemaining <= 10) {
            timerEl.classList.add('timer-warning');
            timerEl.classList.remove('timer-critical');
        } else {
            timerEl.classList.remove('timer-warning', 'timer-critical');
        }
    }
}

// ==================== RESULTS PANEL ====================

function showResultsPanel() {
    if (currentQuestion) {
        document.getElementById('resultQuestionText').textContent = currentQuestion.content || '-';
        document.getElementById('resultCorrectAnswer').textContent =
            currentQuestion.correct_keys ? currentQuestion.correct_keys.join(', ') : '-';
    }
    showPanel('resultsPanel');
}

function showResultsWithData(data) {
    if (data.question) {
        document.getElementById('resultQuestionText').textContent = data.question.content || '-';
        document.getElementById('resultCorrectAnswer').textContent = data.question.correctAnswer || '-';
    }
    showPanel('resultsPanel');
}

// ==================== GAME STATE ====================

function handleGameState(state) {
    switch (state.state) {
        case 'IDLE':
            showPanel('waitingPanel');
            updateWaitingMessage('Yarışma Bekleniyor', 'Yeni bir soru başlatıldığında burada gösterilecek');
            break;
        case 'QUESTION_ACTIVE':
            // NEW_QUESTION event'i ile zaten gösterilecek; burada güvence
            if (currentQuestion) {
                showPanel('activeQuestionPanel');
            }
            break;
        case 'LOCKED':
            showPanel('lockedPanel');
            break;
        case 'GRADING':
            // JURY_REVIEW_DATA event'ini bekle
            break;
        case 'REVEAL':
            showResultsPanel();
            break;
    }
}

// ==================== REVIEW DATA ====================

function loadReviewData(data) {
    currentQuestionId = data.questionId;
    currentPoints = data.points;
    answerGroups = data.groups;
    gradedAnswers.clear();

    // Soru bilgilerini göster
    document.getElementById('questionBadge').textContent = `Soru #${data.questionId}`;
    document.getElementById('questionPoints').textContent = `${data.points} Puan`;
    document.getElementById('questionText').textContent = data.questionContent;
    document.getElementById('correctAnswers').textContent = data.correctKeys.join(', ');

    // Grupları render et
    renderAnswerGroup('correct', answerGroups.correct);
    renderAnswerGroup('incorrect', answerGroups.incorrect);
    renderAnswerGroup('empty', answerGroups.empty);

    // İstatistikleri güncelle
    updateStats();

    // Paneli göster
    showPanel('gradingPanel');
}

function renderAnswerGroup(groupType, answers) {
    const listEl = document.getElementById(`${groupType}AnswersList`);
    const countEl = document.getElementById(`${groupType}Count`);

    countEl.textContent = answers.length;

    if (answers.length === 0) {
        listEl.innerHTML = '<div class="empty-state">Bu grupta cevap yok</div>';
        return;
    }

    listEl.innerHTML = '';

    answers.forEach(answer => {
        const item = document.createElement('div');
        item.className = 'answer-item';
        item.id = `answer-${answer.id}`;

        item.innerHTML = `
            <div class="answer-info">
                <div class="answer-contestant">
                    <span class="contestant-table">Masa ${answer.table_no}</span>
                    <span class="contestant-name">${escapeHtml(answer.name)}</span>
                </div>
                <div class="answer-text">${escapeHtml(answer.answer_text || '(Boş)')}</div>
            </div>
            <div class="answer-actions">
                <button class="action-btn correct-btn" onclick="gradeAnswer(${answer.id}, true)" title="Doğru">✓</button>
                <button class="action-btn incorrect-btn" onclick="gradeAnswer(${answer.id}, false)" title="Yanlış">✗</button>
            </div>
        `;

        listEl.appendChild(item);
    });
}

// ==================== GRADING ====================

function gradeAnswer(answerId, isCorrect) {
    const points = isCorrect ? currentPoints : 0;

    socketManager.emit('JURY_MANUAL_SCORE', {
        answerId,
        isCorrect,
        points
    });

    // UI güncelle
    markAsGraded(answerId);
}

function gradeGroup(groupType, isCorrect) {
    const answers = answerGroups[groupType];
    const ungradedAnswers = answers.filter(a => !gradedAnswers.has(a.id));

    if (ungradedAnswers.length === 0) {
        showToast('Bu grupta puanlanacak cevap kalmadı', 'warning');
        return;
    }

    const answerIds = ungradedAnswers.map(a => a.id);
    const points = isCorrect ? currentPoints : 0;

    socketManager.emit('JURY_APPROVE_GROUP', {
        answerIds,
        isCorrect,
        points
    });

    // UI güncelle
    answerIds.forEach(id => markAsGraded(id));
}

function markAsGraded(answerId) {
    gradedAnswers.add(answerId);

    const item = document.getElementById(`answer-${answerId}`);
    if (item) {
        item.classList.add('graded');
        item.querySelectorAll('.action-btn').forEach(btn => btn.disabled = true);
    }

    updateStats();
}

function updateStats() {
    const totalAnswers = answerGroups.correct.length + answerGroups.incorrect.length;
    const gradedCount = gradedAnswers.size;
    const pendingCount = totalAnswers - gradedCount;

    document.getElementById('gradedCount').textContent = gradedCount;
    document.getElementById('pendingCount').textContent = pendingCount;

    // Commit butonunu aktif/pasif yap
    document.getElementById('commitResultsBtn').disabled = pendingCount > 0;
}

// ==================== COMMIT RESULTS ====================

function commitResults() {
    if (confirm('Puanları işleyip sonuçları göstermek istiyor musunuz?')) {
        socketManager.emit('JURY_COMMIT_RESULTS');
    }
}

// ==================== RESET ====================

function resetState() {
    currentQuestionId = null;
    currentPoints = 0;
    answerGroups = { correct: [], incorrect: [], empty: [] };
    gradedAnswers.clear();
}
