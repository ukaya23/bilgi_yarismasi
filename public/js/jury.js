/**
 * Jury Panel JavaScript
 */

// ==================== STATE ====================

let socketManager;
let currentQuestionId = null;
let currentPoints = 0;
let answerGroups = { correct: [], incorrect: [], empty: [] };
let gradedAnswers = new Set();

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', () => {
    // Socket bağlantısı
    socketManager = new SocketManager('jury');

    // Event listeners
    setupEventListeners();
    setupSocketEvents();

    // Connection status
    updateConnectionStatus();
});

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

    // Yeni soru (izleme amaçlı)
    socketManager.on('NEW_QUESTION', (data) => {
        // Soru geldiğinde bekleme moduna geç
        showPanel('waitingPanel');
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
                showPanel('resultsPanel');
            }
        } else {
            showToast(data.error || 'Bir hata oluştu', 'error');
        }
    });

    // Sonuçlar gösterildi
    socketManager.on('SHOW_RESULTS', (data) => {
        showPanel('resultsPanel');
    });

    // Oyun sıfırlama
    socketManager.on('GAME_RESET', () => {
        resetState();
        showPanel('waitingPanel');
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

// ==================== GAME STATE ====================

function handleGameState(state) {
    switch (state.state) {
        case 'IDLE':
        case 'QUESTION_ACTIVE':
        case 'LOCKED':
            showPanel('waitingPanel');
            break;
        case 'GRADING':
            // JURY_REVIEW_DATA event'ini bekle
            break;
        case 'REVEAL':
            showPanel('resultsPanel');
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
