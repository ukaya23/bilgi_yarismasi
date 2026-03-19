/**
 * Admin Panel JavaScript
 */

// ==================== STATE ====================

let socketManager;
let questions = [];
let contestants = [];
let askedQuestionIds = new Set();
let currentGameState = 'IDLE';
let timer;
let adminToken = null;

// JSON alanlarını güvenli şekilde parse et (pg driver bazen otomatik parse eder)
function safeParseJSON(val, fallback = []) {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
        try { return JSON.parse(val); } catch (e) { return fallback; }
    }
    return fallback;
}

document.addEventListener('DOMContentLoaded', async () => {
    // Auth kontrolü - JWT token
    adminToken = localStorage.getItem('adminAccessToken');
    if (!adminToken) {
        window.location.href = '/admin-login';
        return;
    }

    // Oturum geçerliliğini kontrol et
    try {
        const response = await fetch('/api/auth/verify', {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        const data = await response.json();
        if (!data.success || data.user.role !== 'admin') {
            localStorage.removeItem('adminAccessToken');
            localStorage.removeItem('adminRefreshToken');
            window.location.href = '/admin-login';
            return;
        }
        // Admin bilgilerini göster
        const userDisplay = document.getElementById('adminUsername');
        if (userDisplay) {
            userDisplay.textContent = data.user.username;
        }
    } catch (error) {
        console.error('Auth kontrol hatası:', error);
        localStorage.removeItem('adminAccessToken');
        localStorage.removeItem('adminRefreshToken');
        window.location.href = '/admin-login';
        return;
    }

    // Socket bağlantısı
    socketManager = new SocketManager('admin');

    // Timer
    timer = new Timer(
        document.getElementById('timerDisplay'),
        null,
        null
    );

    // Event listeners
    setupNavigation();
    setupEventListeners();
    setupSocketEvents();

    // Yeniden bağlantıda verileri yenile
    socketManager.onReconnect(() => {
        console.log('[ADMIN] Reconnect - verileri yeniliyorum...');
        loadActiveCompetition();
        loadSettings();
    });

    // Yarışma yönetimi
    loadActiveCompetition();
    loadSettings();
});

// ==================== NAVIGATION ====================

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.section;

            // Active state güncelle
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Section göster
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            document.getElementById(`${section}-section`).classList.add('active');
        });
    });
}

// ==================== EVENT LISTENERS ====================

function setupEventListeners() {
    // Soru seçimi
    document.getElementById('questionSelect').addEventListener('change', (e) => {
        document.getElementById('startQuestionBtn').disabled = !e.target.value;
    });

    // Kontrol butonları
    document.getElementById('startQuestionBtn').addEventListener('click', startQuestion);
    document.getElementById('skipToGradingBtn').addEventListener('click', skipToGrading);
    document.getElementById('showResultsBtn').addEventListener('click', showResults);
    document.getElementById('goIdleBtn').addEventListener('click', goIdle);
    document.getElementById('goIdleBtn').addEventListener('click', goIdle);
    document.getElementById('resetGameBtn').addEventListener('click', resetGame);
    document.getElementById('nextStepBtn').addEventListener('click', nextStep);

    // Soru modal
    document.getElementById('addQuestionBtn').addEventListener('click', () => openQuestionModal());
    document.getElementById('closeModalBtn').addEventListener('click', closeQuestionModal);
    document.getElementById('cancelModalBtn').addEventListener('click', closeQuestionModal);
    document.getElementById('saveQuestionBtn').addEventListener('click', saveQuestion);

    // Soru tipi değişimi
    document.getElementById('questionType').addEventListener('change', (e) => {
        const type = e.target.value;
        const optsGroup = document.getElementById('optionsGroup');
        const mcOptsGroup = document.getElementById('mcOptionsGroup');

        if (type === 'MULTIPLE_CHOICE') {
            optsGroup.style.display = 'block';
            mcOptsGroup.style.display = 'block';
        } else {
            optsGroup.style.display = 'none';
            mcOptsGroup.style.display = 'none';
        }
    });

    // Sıralama Kürsüsü Göster
    const podiumBtn = document.getElementById('showPodiumBtn');
    if (podiumBtn) {
        podiumBtn.addEventListener('click', () => {
            if (confirm('Yarışma sıralamasını (İlk 3) ekranda göstermek istediğinize emin misiniz?')) {
                socketManager.emit('ADMIN_SHOW_PODIUM');
            }
        });
    }
    // Dinamik şık ekle butonu
    document.getElementById('addOptionBtn').addEventListener('click', () => {
        const list = document.getElementById('dynamicOptionsList');
        const currentCount = list.querySelectorAll('.dynamic-option-item').length;
        list.appendChild(createDynamicOptionItem('', false, currentCount));
        updateOptionEvents();
    });

    // Resim yükleme
    setupImageUpload();
}

// ==================== SOCKET EVENTS ====================

function setupSocketEvents() {
    // İlk veriler
    socketManager.on('INIT_DATA', (data) => {
        console.log('[ADMIN] Init data:', data);
        questions = data.questions;
        contestants = data.contestants;

        // Sorulan soruları takip et
        if (data.askedQuestionIds) {
            askedQuestionIds = new Set(data.askedQuestionIds);
        }

        updateQuestionsUI();
        updateContestantsUI();
        updateLeaderboard(data.leaderboard);
        updateGameStateUI(data.gameState);

        // Timer senkronizasyonu (sayfa yenilenme durumu)
        if (data.gameState.timeRemaining != null && data.gameState.state === 'QUESTION_ACTIVE') {
            timer.sync(data.gameState.timeRemaining);
        }

        // Connection status
        document.getElementById('connectionDot').classList.add('status-online');
        document.getElementById('connectionText').textContent = 'Bağlı';
    });

    // Oyun durumu değişikliği
    socketManager.on('GAME_STATE', (data) => {
        updateGameStateUI(data);
    });

    // Zaman senkronizasyonu
    socketManager.on('TIME_SYNC', (data) => {
        timer.sync(data.timeRemaining);
    });

    // Yarışmacı güncelleme
    socketManager.on('CONTESTANTS_UPDATED', (data) => {
        contestants = data;
        updateContestantsUI();
    });

    // Soru listesi güncelleme
    socketManager.on('QUESTIONS_UPDATED', (data) => {
        questions = data;
        updateQuestionsUI();
    });

    // Oyuncu durumu güncelleme
    socketManager.on('PLAYER_STATUS_UPDATE', (data) => {
        updatePlayerStatus(data.contestantId, data.status);
    });

    // Sonuçlar
    socketManager.on('SHOW_RESULTS', (data) => {
        updateLeaderboard(data.leaderboard);
        updateButtonStates(); // Mod kontrolü için tetikle
    });

    // Manuel Akış Durumu
    socketManager.on('ADMIN_REVEAL_STATE', (data) => {
        const stepNameEl = document.getElementById('currentStepName');
        const nextBtn = document.getElementById('nextStepBtn');
        const idleBtn = document.getElementById('goIdleBtn');

        if (stepNameEl) stepNameEl.textContent = `${data.step}. ${data.stepName}`;

        if (data.isFinished) {
            nextBtn.disabled = true;
            nextBtn.innerHTML = '<span class="btn-icon">✅</span> Tamamlandı';
            idleBtn.disabled = false;
        } else {
            nextBtn.disabled = false;
            nextBtn.innerHTML = '<span class="btn-icon">➡️</span> Sonraki Adım';
            idleBtn.disabled = true;
        }
    });

    // İşlem sonucu
    socketManager.on('ACTION_RESULT', (data) => {
        if (data.success) {
            showToast(`${data.action} başarılı`, 'success');
        } else {
            showToast(data.error || 'Bir hata oluştu', 'error');
        }
    });

    // Oyun Resetlendiğinde
    socketManager.on('GAME_RESET', () => {
        console.log('[ADMIN] Game reset received');
        contestants = [];
        questions = []; // Sorular veritabanından tekrar yüklenecek ama şimdilik boşalt

        updateContestantsUI();
        updateLeaderboard([]);

        // Ekstra UI temizliği
        document.getElementById('answeredCount').textContent = '0/0';
        document.getElementById('currentQuestion').textContent = '-';
        document.getElementById('gameState').textContent = 'IDLE';
        document.getElementById('gameState').className = 'status-value state-idle';
        currentGameState = 'IDLE';
        updateButtonStates();

        showToast('Yarışma sıfırlandı', 'success');

        // Verileri tekrar yükle (sorular vs.)
        socketManager.emit('ADMIN_REFRESH_CONTESTANTS');
    });
}

// ==================== UI UPDATES ====================

function updateGameStateUI(state) {
    currentGameState = state.state;

    // Durum göstergesi
    document.getElementById('gameState').textContent = state.state;
    document.getElementById('gameState').className = `status-value state-${state.state.toLowerCase()}`;

    // Aktif soru
    if (state.currentQuestion) {
        document.getElementById('currentQuestion').textContent =
            `#${state.currentQuestion.id} - ${truncate(state.currentQuestion.content, 30)}`;
    } else {
        document.getElementById('currentQuestion').textContent = '-';
    }

    // Cevap sayısı
    const totalContestants = contestants.filter(c => c.status === 'ONLINE').length;
    const answeredCount = state.answeredPlayers ? state.answeredPlayers.length : 0;
    document.getElementById('answeredCount').textContent = `${answeredCount}/${totalContestants}`;

    // Buton durumları
    updateButtonStates();
}

function updateButtonStates() {
    const startBtn = document.getElementById('startQuestionBtn');
    const skipBtn = document.getElementById('skipToGradingBtn');
    const showBtn = document.getElementById('showResultsBtn');
    const idleBtn = document.getElementById('goIdleBtn');
    const selectEl = document.getElementById('questionSelect');

    // Mod değişikliği kontrolü
    const stepControlGroup = document.getElementById('stepControlGroup');
    const nextStepBtn = document.getElementById('nextStepBtn');

    if (currentGameState === 'REVEAL') {
        startBtn.disabled = true;
        skipBtn.disabled = true;
        showBtn.disabled = true;

        // Eğer manual mod aktifse ve reveal devam ediyorsa
        if (appSettings.screen_control_mode === 'MANUAL') {
            stepControlGroup.classList.remove('hidden');
            idleBtn.disabled = true; // Bitmeden çıkılmasın (tercihen)
        } else {
            stepControlGroup.classList.add('hidden');
            idleBtn.disabled = false;
        }
    } else {
        stepControlGroup.classList.add('hidden');
        if (currentGameState === 'IDLE') {
            startBtn.disabled = !selectEl.value;
            skipBtn.disabled = true;
            showBtn.disabled = true;
            idleBtn.disabled = true;
        } else if (currentGameState === 'QUESTION_ACTIVE') {
            startBtn.disabled = true;
            skipBtn.disabled = false;
            showBtn.disabled = true;
            idleBtn.disabled = true;
        } else if (currentGameState === 'LOCKED' || currentGameState === 'GRADING') {
            startBtn.disabled = true;
            skipBtn.disabled = true;
            showBtn.disabled = false;
            idleBtn.disabled = true;
        }
    }
}

function nextStep() {
    socketManager.emit('ADMIN_NEXT_STEP');
}

function updateQuestionsUI() {
    // Dropdown güncelle
    const select = document.getElementById('questionSelect');
    select.innerHTML = '<option value="">Soru Seçin...</option>';

    let askedCount = 0;
    questions.forEach(q => {
        const option = document.createElement('option');
        option.value = q.id;
        const isAsked = askedQuestionIds.has(q.id);
        if (isAsked) {
            askedCount++;
            option.textContent = `✓ #${q.id} - ${q.category || 'Genel'}: ${truncate(q.content, 40)}`;
            option.disabled = true;
            option.style.color = '#666';
        } else {
            option.textContent = `#${q.id} - ${q.category || 'Genel'}: ${truncate(q.content, 40)}`;
        }
        select.appendChild(option);
    });

    // İlerleme göstergesi güncelle
    const progressEl = document.getElementById('questionProgress');
    if (progressEl) {
        progressEl.textContent = `${askedCount}/${questions.length} Soru`;
        if (askedCount === questions.length && questions.length > 0) {
            progressEl.className = 'badge badge-success';
        } else {
            progressEl.className = 'badge badge-info';
        }
    }

    // Tablo güncelle
    const tbody = document.getElementById('questionsTableBody');
    tbody.innerHTML = '';

    questions.forEach(q => {
        const tr = document.createElement('tr');

        let typeHtml = '';
        if (q.type === 'MULTIPLE_CHOICE') {
            const optCount = q.options ? safeParseJSON(q.options).length : 0;
            typeHtml = `<span class="badge badge-primary">Çoktan Seçmeli (${optCount} Şık)</span>`;
        } else {
            typeHtml = `<span class="badge badge-warning">Açık Uçlu</span>`;
        }

        const hasImage = q.media_url ? '<span title="Görsel İçerir">🖼️</span> ' : '';

        tr.innerHTML = `
            <td>${q.id}</td>
            <td>${escapeHtml(q.category || '-')}</td>
            <td>${hasImage}${escapeHtml(truncate(q.content, 50))}</td>
            <td>${typeHtml}</td>
            <td>${q.points}</td>
            <td>${q.duration}s</td>
            <td class="action-btns">
                <button class="btn btn-sm btn-secondary" onclick="editQuestion(${q.id})" title="Düzenle">✏️</button>
                <button class="btn btn-sm btn-danger" onclick="deleteQuestion(${q.id})" title="Sil">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateContestantsUI() {
    // Grid güncelle
    const grid = document.getElementById('contestantsGrid');
    const onlineCount = contestants.filter(c => c.status === 'ONLINE').length;

    document.getElementById('onlineCount').textContent = `${onlineCount} Online`;

    if (contestants.length === 0) {
        grid.innerHTML = '<div class="empty-state"><p>Henüz yarışmacı bağlanmadı</p></div>';
        return;
    }

    grid.innerHTML = '';
    contestants.forEach(c => {
        const card = document.createElement('div');
        card.className = `contestant-card ${c.status.toLowerCase()}`;
        card.id = `contestant-${c.id}`;
        card.innerHTML = `
            <div class="contestant-table">${escapeHtml(String(c.table_no))}</div>
            <div class="contestant-name">${escapeHtml(c.name)}</div>
            <div class="contestant-score">${c.total_score} puan</div>
        `;
        grid.appendChild(card);
    });

    // Tablo güncelle
    const tbody = document.getElementById('contestantsTableBody');
    tbody.innerHTML = '';

    contestants.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${c.id}</td>
            <td>${escapeHtml(String(c.table_no))}</td>
            <td>${escapeHtml(c.name)}</td>
            <td>${c.total_score}</td>
            <td><span class="badge ${c.status === 'ONLINE' ? 'badge-success' : 'badge-danger'}">${escapeHtml(c.status)}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function updateLeaderboard(leaderboard) {
    const tbody = document.getElementById('leaderboardBody');

    if (!leaderboard || leaderboard.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Veri yok</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    leaderboard.forEach((entry, index) => {
        const tr = document.createElement('tr');
        const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`;
        tr.innerHTML = `
            <td>${rankEmoji}</td>
            <td>${escapeHtml(String(entry.table_no))}</td>
            <td>${escapeHtml(entry.name)}</td>
            <td><strong>${entry.total_score}</strong></td>
        `;
        tbody.appendChild(tr);
    });
}

function updatePlayerStatus(contestantId, status) {
    const card = document.getElementById(`contestant-${contestantId}`);
    if (card) {
        card.classList.remove('online', 'answered');
        card.classList.add(status === 'answered' ? 'answered' : 'online');
    }
}

// ==================== ACTIONS ====================

function startQuestion() {
    const questionId = document.getElementById('questionSelect').value;
    if (!questionId) return;

    socketManager.emit('ADMIN_START_QUESTION', { questionId: parseInt(questionId) });

    // Soruyu sorulanlar listesine ekle ve dropdown'ı güncelle
    askedQuestionIds.add(parseInt(questionId));
    updateQuestionsUI();
}

function skipToGrading() {
    socketManager.emit('ADMIN_SKIP_TO_GRADING');
}

function showResults() {
    socketManager.emit('ADMIN_REVEAL_RESULTS');
}

function goIdle() {
    socketManager.emit('ADMIN_GO_IDLE');
}

function resetGame() {
    if (confirm('Yarışmayı sıfırlamak istediğinize emin misiniz? Tüm puanlar silinecek!')) {
        socketManager.emit('ADMIN_RESET_GAME');
    }
}

// ==================== QUESTION MODAL ====================

function openQuestionModal(question = null) {
    const modal = document.getElementById('questionModal');
    const title = document.getElementById('modalTitle');

    if (question) {
        title.textContent = 'Soru Düzenle';
        document.getElementById('questionId').value = question.id;
        document.getElementById('questionContent').value = question.content;
        document.getElementById('questionCategory').value = question.category || '';
        document.getElementById('questionType').value = question.type;
        document.getElementById('questionPoints').value = question.points;
        document.getElementById('questionDuration').value = question.duration;
        // Açık uçlu soru ise doğru cevap alanını doldur
        if (question.type === 'OPEN_ENDED') {
            document.getElementById('questionCorrectKeys').value = question.correct_keys ? JSON.parse(question.correct_keys).join('\n') : '';
        }
    } else {
        title.textContent = 'Yeni Soru Ekle';
        document.getElementById('questionForm').reset();
        document.getElementById('questionId').value = '';
        document.getElementById('questionCorrectKeys').value = '';
        // Resim alanını sıfırla
        clearImagePreview();
    }

    // Şıklar görünürlüğü
    const type = document.getElementById('questionType').value;
    document.getElementById('optionsContainer').style.display = type === 'MULTIPLE_CHOICE' ? 'block' : 'none';
    document.getElementById('openEndedAnswerContainer').style.display = type === 'OPEN_ENDED' ? 'block' : 'none';

    // Dinamik şıkları yükle
    renderDynamicOptions(question ? safeParseJSON(question.options) : [], question ? safeParseJSON(question.correct_keys) : []);

    // Resim önizleme (düzenleme modunda)
    if (question && question.media_url) {
        showImagePreview(question.media_url);
    } else {
        clearImagePreview();
    }

    modal.classList.add('active');
}

function closeQuestionModal() {
    document.getElementById('questionModal').classList.remove('active');
}

function saveQuestion() {
    const id = document.getElementById('questionId').value;
    const content = document.getElementById('questionContent').value;
    const category = document.getElementById('questionCategory').value;
    const type = document.getElementById('questionType').value;
    const points = parseInt(document.getElementById('questionPoints').value);
    const duration = parseInt(document.getElementById('questionDuration').value);

    let options = [];
    let correctKeys = [];

    if (type === 'MULTIPLE_CHOICE') {
        const optionItems = document.querySelectorAll('.dynamic-option-item');
        optionItems.forEach(item => {
            const input = item.querySelector('input[type="text"]');
            const radio = item.querySelector('input[type="radio"]');
            const val = input.value.trim();
            if (val) {
                options.push(val);
                if (radio.checked) {
                    correctKeys.push(val);
                }
            }
        });

        if (options.length < 2) {
            showToast('En az 2 şık eklemelisiniz', 'error');
            return;
        }
        if (correctKeys.length === 0) {
            showToast('Lütfen doğru cevabı seçin', 'error');
            return;
        }
    } else { // OPEN_ENDED
        correctKeys = document.getElementById('questionCorrectKeys').value.split('\n').filter(k => k.trim());
        if (correctKeys.length === 0) {
            showToast('Doğru cevap zorunludur', 'error');
            return;
        }
    }

    if (!content) {
        showToast('Soru metni zorunludur', 'error');
        return;
    }

    // Resim URL'sini al
    const mediaUrl = document.getElementById('questionMediaUrl').value || null;

    const questionData = {
        content,
        category,
        type,
        options,
        correct_keys: correctKeys,
        points,
        duration,
        media_url: mediaUrl
    };

    if (id) {
        questionData.id = parseInt(id);
        socketManager.emit('ADMIN_UPDATE_QUESTION', questionData);
    } else {
        socketManager.emit('ADMIN_ADD_QUESTION', questionData);
    }

    closeQuestionModal();
}

function editQuestion(id) {
    const question = questions.find(q => q.id === id);
    if (question) {
        openQuestionModal(question);
    }
}

function deleteQuestion(id) {
    if (confirm('Bu soruyu silmek istediğinize emin misiniz?')) {
        socketManager.emit('ADMIN_DELETE_QUESTION', { id });
    }
}

// ==================== DYNAMIC OPTIONS HELPERS ====================

function renderDynamicOptions(options = [], correctKeys = []) {
    const list = document.getElementById('dynamicOptionsList');
    list.innerHTML = '';

    if (options.length === 0) {
        // Default 2 options if empty
        list.appendChild(createDynamicOptionItem('', false, 0));
        list.appendChild(createDynamicOptionItem('', false, 1));
    } else {
        options.forEach((opt, idx) => {
            const isCorrect = correctKeys.includes(opt);
            list.appendChild(createDynamicOptionItem(opt, isCorrect, idx));
        });
    }
    updateOptionEvents();
}

function createDynamicOptionItem(value = '', isCorrect = false, index = 0) {
    const letter = String.fromCharCode(65 + index); // A, B, C, D...
    const div = document.createElement('div');
    div.className = 'dynamic-option-item';
    if (isCorrect) div.classList.add('correct');

    div.innerHTML = `
        <span class="option-letter">${letter}</span>
        <input type="radio" name="correctOptionRadio" ${isCorrect ? 'checked' : ''} title="Do\u011fru Cevab\u0131 Se\u00e7">
        <input type="text" placeholder="\u015e\u0131k ${letter} metni..." value="${value.replace(/"/g, '&quot;')}">
        <button type="button" class="remove-option-btn" title="\u015e\u0131kk\u0131 Kald\u0131r">&times;</button>
    `;

    return div;
}

function updateOptionEvents() {
    const list = document.getElementById('dynamicOptionsList');
    const items = list.querySelectorAll('.dynamic-option-item');

    items.forEach(item => {
        const radio = item.querySelector('input[type="radio"]');
        const removeBtn = item.querySelector('.remove-option-btn');

        // Remove old listeners to prevent duplicates if called multiple times (lazy approach via clone)
        const newRadio = radio.cloneNode(true);
        radio.parentNode.replaceChild(newRadio, radio);

        const newRemoveBtn = removeBtn.cloneNode(true);
        removeBtn.parentNode.replaceChild(newRemoveBtn, removeBtn);

        // Selection Event
        newRadio.addEventListener('change', () => {
            // Remove 'correct' class from all options
            items.forEach(i => i.classList.remove('correct'));
            // Add to selected
            if (newRadio.checked) item.classList.add('correct');
        });

        // Delete Event
        newRemoveBtn.addEventListener('click', () => {
            const currentItems = list.querySelectorAll('.dynamic-option-item');
            if (currentItems.length <= 2) {
                showToast('En az 2 şık bulunmalıdır', 'warning');
                return;
            }
            item.remove();
            renumberOptionLetters();
        });
    });
}

function renumberOptionLetters() {
    const items = document.querySelectorAll('#dynamicOptionsList .dynamic-option-item');
    items.forEach((item, idx) => {
        const letter = String.fromCharCode(65 + idx);
        const letterEl = item.querySelector('.option-letter');
        const textInput = item.querySelector('input[type="text"]');
        if (letterEl) letterEl.textContent = letter;
        if (textInput && !textInput.value) textInput.placeholder = `Şık ${letter} metni...`;
    });
}

// ==================== COMPETITION MANAGEMENT ====================

let activeCompetition = null;
let competitionCodes = [];

async function loadActiveCompetition() {
    try {
        const response = await fetch('/api/competition/active');
        const data = await response.json();

        if (data.active) {
            activeCompetition = data.competition;
            competitionCodes = data.codes;
            renderCompetitionInfo();
        } else {
            renderNoCompetition();
        }
    } catch (error) {
        console.error('Yarışma yükleme hatası:', error);
    }
}

function renderCompetitionInfo() {
    const container = document.getElementById('competitionInfo');
    if (!container) return;

    const contestantCodes = competitionCodes.filter(c => c.role === 'CONTESTANT');
    const juryCodes = competitionCodes.filter(c => c.role === 'JURY');

    const renderCodeCards = (codes) => codes.map(c => `
        <div class="code-card ${c.is_used ? 'used' : ''}">
            <div class="code-value">${escapeHtml(c.code)}</div>
            <input type="text" class="code-name-input" value="${escapeHtml(c.name)}"
                   onchange="updateCodeName(${c.id}, this.value)" placeholder="İsim girin">
            <div class="code-status">${c.is_used ? '✅ Giriş yapıldı' : '⏳ Bekliyor'}</div>
            ${c.is_used ? `<button class="btn btn-sm btn-secondary" onclick="resetCode(${c.id})">Sıfırla</button>` : ''}
        </div>
    `).join('');

    container.innerHTML = `
        <div class="competition-header">
            <h3>📋 ${escapeHtml(activeCompetition.name)}</h3>
            <span class="badge badge-success">Aktif</span>
        </div>

        <div class="codes-section">
            <h4>👥 Yarışmacı Kodları</h4>
            <div class="codes-grid">${renderCodeCards(contestantCodes)}</div>
        </div>

        <div class="codes-section">
            <h4>⚖️ Jüri Kodları</h4>
            <div class="codes-grid">${renderCodeCards(juryCodes)}</div>
        </div>

        <button class="btn btn-danger mt-2" onclick="endCompetition()">Yarışmayı Sonlandır</button>
    `;
}

function renderNoCompetition() {
    const container = document.getElementById('competitionInfo');
    if (!container) return;

    container.innerHTML = `
        <div class="no-competition">
            <p class="text-muted">Aktif yarışma yok. Yeni yarışma oluşturun.</p>
        </div>
    `;
}

async function createCompetition() {
    const name = document.getElementById('competitionName').value.trim();
    const contestantCount = parseInt(document.getElementById('contestantCount').value);
    const juryCount = parseInt(document.getElementById('juryCount').value);

    if (!name) {
        showToast('Yarışma adı gerekli', 'error');
        return;
    }

    try {
        const response = await fetch('/api/competition', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({ name, contestantCount, juryCount })
        });

        if (response.status === 401) {
            handleAuthExpired();
            return;
        }

        const data = await response.json();

        if (data.success) {
            showToast('Yarışma oluşturuldu!', 'success');
            loadActiveCompetition();
            closeCompetitionModal();
        } else {
            showToast(data.error || 'Hata oluştu', 'error');
        }
    } catch (error) {
        console.error('Yarışma oluşturma hatası:', error);
        showToast('Sunucu hatası', 'error');
    }
}

async function updateCodeName(codeId, name) {
    try {
        await fetch(`/api/competition/code/${codeId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({ name })
        });
    } catch (error) {
        console.error('Kod güncelleme hatası:', error);
    }
}

async function resetCode(codeId) {
    if (!confirm('Bu kodu sıfırlamak istediğinize emin misiniz?')) return;

    try {
        await fetch(`/api/competition/code/${codeId}/reset`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        loadActiveCompetition();
        showToast('Kod sıfırlandı', 'success');
    } catch (error) {
        console.error('Kod sıfırlama hatası:', error);
    }
}

async function endCompetition() {
    if (!confirm('Yarışmayı sonlandırmak istediğinize emin misiniz?')) return;

    try {
        const response = await fetch('/api/competition/end', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        if (response.status === 401) {
            handleAuthExpired();
            return;
        }

        const data = await response.json();

        if (data.success || response.ok) {
            activeCompetition = null;
            competitionCodes = [];
            renderNoCompetition();

            // UI'ı temizle
            document.getElementById('answeredCount').textContent = '0/0';
            document.getElementById('currentQuestion').textContent = '-';
            updateButtonStates();

            showToast('Yarışma sonlandırıldı', 'success');
        } else {
            showToast('Yarışma sonlandırılamadı: ' + (data.error || 'Bilinmeyen hata'), 'error');
        }
    } catch (error) {
        console.error('Yarışma sonlandırma hatası:', error);
        showToast('Sunucu bağlantı hatası', 'error');
    }
}

function openCompetitionModal() {
    document.getElementById('competitionModal').classList.add('active');
}

function closeCompetitionModal() {
    document.getElementById('competitionModal').classList.remove('active');
}

// ==================== SETTINGS ====================

let appSettings = {};

async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        const settings = await response.json();

        appSettings = {};
        settings.forEach(s => {
            appSettings[s.key] = s.value;
        });

        renderSettings();
    } catch (error) {
        console.error('Ayarlar yükleme hatası:', error);
    }
}

function renderSettings() {
    const container = document.getElementById('settingsForm');
    if (!container) return;

    container.innerHTML = `

        <div class="form-group">
            <label class="form-label">Ekran Akış Kontrolü</label>
            <div class="radio-group">
                <label class="radio-label">
                    <input type="radio" name="screen_control_mode" value="AUTO" 
                        ${(!appSettings.screen_control_mode || appSettings.screen_control_mode === 'AUTO') ? 'checked' : ''}>
                    <span class="radio-text">Otomatik (Süreli)</span>
                </label>
                <label class="radio-label">
                    <input type="radio" name="screen_control_mode" value="MANUAL"
                        ${appSettings.screen_control_mode === 'MANUAL' ? 'checked' : ''}>
                    <span class="radio-text">Manuel (Butonla)</span>
                </label>
            </div>
            <small class="form-hint">Sonuç ekranında adımların (Resim, Soru, Cevap, Sıralama) nasıl ilerleyeceğini belirler.</small>
        </div>

        <div class="form-group">
            <label class="form-label">Bekleme Ekranı Alıntı Süresi (saniye)</label>
            <input type="number" class="form-control" id="setting_idle_quote_interval" 
                   value="${appSettings.idle_quote_interval || 8}" min="3" max="30">
        </div>
        
        <div class="form-group">
            <label class="form-label">Süre Uyarısı Başlangıcı (saniye kala)</label>
            <input type="number" class="form-control" id="setting_question_warning_time" 
                   value="${appSettings.question_warning_time || 10}" min="5" max="30">
        </div>
        
        <div class="form-group">
            <label class="form-label">Sonuç Ekranı Gösterim Süresi (saniye)</label>
            <input type="number" class="form-control" id="setting_result_display_duration" 
                   value="${appSettings.result_display_duration || 15}" min="5" max="60">
        </div>
        
        <div class="form-group">
            <label class="form-label">Tik Sesi Başlangıcı (saniye kala)</label>
            <input type="number" class="form-control" id="setting_tick_sound_start" 
                   value="${appSettings.tick_sound_start || 10}" min="3" max="30">
        </div>
        
        <div class="form-group">
            <label class="form-label">Ses Efektleri</label>
            <select class="form-control" id="setting_sound_enabled">
                <option value="1" ${appSettings.sound_enabled === '1' ? 'selected' : ''}>Açık</option>
                <option value="0" ${appSettings.sound_enabled === '0' ? 'selected' : ''}>Kapalı</option>
            </select>
        </div>
        
        <button class="btn btn-primary" onclick="saveSettings()">💾 Ayarları Kaydet</button>
    `;
}

async function saveSettings() {
    const settings = {
        idle_quote_interval: document.getElementById('setting_idle_quote_interval').value,
        question_warning_time: document.getElementById('setting_question_warning_time').value,
        result_display_duration: document.getElementById('setting_result_display_duration').value,
        tick_sound_start: document.getElementById('setting_tick_sound_start').value,
        sound_enabled: document.getElementById('setting_sound_enabled').value, // Select olduğu için .value
        screen_control_mode: document.querySelector('input[name="screen_control_mode"]:checked').value
    };

    try {
        for (const [key, value] of Object.entries(settings)) {
            await fetch(`/api/settings/${key}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({ value })
            });
        }

        showToast('Ayarlar kaydedildi', 'success');
        appSettings = settings;
    } catch (error) {
        console.error('Ayar kaydetme hatası:', error);
        showToast('Hata oluştu', 'error');
    }
}

// ==================== LOGOUT ====================

function logout() {
    fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` }
    }).finally(() => {
        localStorage.removeItem('adminAccessToken');
        localStorage.removeItem('adminRefreshToken');
        window.location.href = '/admin-login';
    });
}

async function changePassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (!currentPassword || !newPassword || !confirmPassword) {
        showToast('Tüm alanları doldurun', 'error');
        return;
    }

    if (newPassword.length < 8) {
        showToast('Yeni şifre en az 8 karakter olmalıdır', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showToast('Yeni şifreler eşleşmiyor', 'error');
        return;
    }

    try {
        const response = await fetch('/api/auth/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({ currentPassword, newPassword })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // Yeni token'ları kaydet
            adminToken = data.accessToken;
            localStorage.setItem('adminAccessToken', data.accessToken);
            localStorage.setItem('adminRefreshToken', data.refreshToken);

            // Formu temizle
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmPassword').value = '';

            showToast('Şifre başarıyla değiştirildi', 'success');
        } else {
            showToast(data.error || 'Şifre değiştirilemedi', 'error');
        }
    } catch (error) {
        console.error('Şifre değiştirme hatası:', error);
        showToast('Sunucu hatası', 'error');
    }
}

function handleAuthExpired() {
    showToast('Oturumunuz süresi dolmuş. Giriş sayfasına yönlendiriliyorsunuz.', 'error');
    setTimeout(() => {
        localStorage.removeItem('adminAccessToken');
        localStorage.removeItem('adminRefreshToken');
        window.location.href = '/admin-login';
    }, 2000);
}

// ==================== IMAGE UPLOAD ====================

function setupImageUpload() {
    const imageInput = document.getElementById('imageInput');
    const removeBtn = document.getElementById('removeImageBtn');

    if (imageInput) {
        imageInput.addEventListener('change', handleImageSelect);
    }

    if (removeBtn) {
        removeBtn.addEventListener('click', removeImage);
    }
}

async function handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Dosya boyutu kontrolü (10MB)
    if (file.size > 10 * 1024 * 1024) {
        showToast('Dosya boyutu 10MB\'dan küçük olmalıdır', 'error');
        return;
    }

    // Dosya türü kontrolü
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        showToast('Sadece JPEG, PNG, GIF veya WEBP dosyaları yüklenebilir', 'error');
        return;
    }

    // Upload progress göster
    document.getElementById('uploadProgress').classList.remove('hidden');
    document.querySelector('.upload-placeholder').classList.add('hidden');

    try {
        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch('/api/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`
            },
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            showImagePreview(data.url);
            showToast('Resim yüklendi', 'success');
        } else {
            showToast(data.error || 'Yükleme hatası', 'error');
            resetUploadArea();
        }
    } catch (error) {
        console.error('Resim yükleme hatası:', error);
        showToast('Resim yüklenemedi', 'error');
        resetUploadArea();
    }
}

function showImagePreview(url) {
    const preview = document.getElementById('imagePreview');
    const previewImg = document.getElementById('previewImage');
    const uploadArea = document.getElementById('imageUploadArea');
    const mediaUrlInput = document.getElementById('questionMediaUrl');

    previewImg.src = url;
    mediaUrlInput.value = url;
    preview.classList.add('has-image');
    uploadArea.classList.add('has-image');

    // Progress'i gizle
    document.getElementById('uploadProgress').classList.add('hidden');
    document.querySelector('.upload-placeholder').classList.remove('hidden');
}

function clearImagePreview() {
    const preview = document.getElementById('imagePreview');
    const previewImg = document.getElementById('previewImage');
    const uploadArea = document.getElementById('imageUploadArea');
    const mediaUrlInput = document.getElementById('questionMediaUrl');
    const imageInput = document.getElementById('imageInput');

    if (previewImg) previewImg.src = '';
    if (mediaUrlInput) mediaUrlInput.value = '';
    if (preview) preview.classList.remove('has-image');
    if (uploadArea) uploadArea.classList.remove('has-image');
    if (imageInput) imageInput.value = '';

    resetUploadArea();
}

function resetUploadArea() {
    document.getElementById('uploadProgress').classList.add('hidden');
    document.querySelector('.upload-placeholder').classList.remove('hidden');
}

async function removeImage() {
    const mediaUrl = document.getElementById('questionMediaUrl').value;

    if (mediaUrl) {
        // Sunucudan sil
        const filename = mediaUrl.split('/').pop();
        try {
            await fetch(`/api/upload/${filename}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });
        } catch (error) {
            console.error('Resim silme hatası:', error);
        }
    }

    clearImagePreview();
    showToast('Resim kaldırıldı', 'success');
}

