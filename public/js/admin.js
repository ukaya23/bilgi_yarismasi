/**
 * Admin Panel JavaScript
 */

// ==================== INITIALIZATION ====================

let socketManager;
let questions = [];
let contestants = [];
let currentGameState = 'IDLE';
let timer;
let adminToken = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Auth kontrolü
    adminToken = localStorage.getItem('adminToken');
    if (!adminToken) {
        window.location.href = '/admin-login';
        return;
    }

    // Oturum geçerliliğini kontrol et
    try {
        const response = await fetch('/api/auth/check-admin', {
            headers: { 'X-Admin-Token': adminToken }
        });
        const data = await response.json();
        if (!data.authenticated) {
            localStorage.removeItem('adminToken');
            window.location.href = '/admin-login';
            return;
        }
        // Admin bilgilerini göster
        const userDisplay = document.getElementById('adminUsername');
        if (userDisplay) {
            userDisplay.textContent = data.username;
        }
    } catch (error) {
        console.error('Auth kontrol hatası:', error);
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
    document.getElementById('resetGameBtn').addEventListener('click', resetGame);

    // Soru modal
    document.getElementById('addQuestionBtn').addEventListener('click', () => openQuestionModal());
    document.getElementById('closeModalBtn').addEventListener('click', closeQuestionModal);
    document.getElementById('cancelModalBtn').addEventListener('click', closeQuestionModal);
    document.getElementById('saveQuestionBtn').addEventListener('click', saveQuestion);

    // Soru tipi değişimi
    document.getElementById('questionType').addEventListener('change', (e) => {
        const optionsContainer = document.getElementById('optionsContainer');
        optionsContainer.style.display = e.target.value === 'MULTIPLE_CHOICE' ? 'block' : 'none';
    });
}

// ==================== SOCKET EVENTS ====================

function setupSocketEvents() {
    // İlk veriler
    socketManager.on('INIT_DATA', (data) => {
        console.log('[ADMIN] Init data:', data);
        questions = data.questions;
        contestants = data.contestants;

        updateQuestionsUI();
        updateContestantsUI();
        updateLeaderboard(data.leaderboard);
        updateGameStateUI(data.gameState);

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
        updateContestantsUI();
        updateLeaderboard([]); // Açıkça boş dizi ile güncelle
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

    switch (currentGameState) {
        case 'IDLE':
            startBtn.disabled = !selectEl.value;
            skipBtn.disabled = true;
            showBtn.disabled = true;
            idleBtn.disabled = true;
            break;
        case 'QUESTION_ACTIVE':
            startBtn.disabled = true;
            skipBtn.disabled = false;
            showBtn.disabled = true;
            idleBtn.disabled = true;
            break;
        case 'LOCKED':
        case 'GRADING':
            startBtn.disabled = true;
            skipBtn.disabled = true;
            showBtn.disabled = false;
            idleBtn.disabled = true;
            break;
        case 'REVEAL':
            startBtn.disabled = true;
            skipBtn.disabled = true;
            showBtn.disabled = true;
            idleBtn.disabled = false;
            break;
    }
}

function updateQuestionsUI() {
    // Dropdown güncelle
    const select = document.getElementById('questionSelect');
    select.innerHTML = '<option value="">Soru Seçin...</option>';

    questions.forEach(q => {
        const option = document.createElement('option');
        option.value = q.id;
        option.textContent = `#${q.id} - ${q.category || 'Genel'}: ${truncate(q.content, 40)}`;
        select.appendChild(option);
    });

    // Tablo güncelle
    const tbody = document.getElementById('questionsTableBody');
    tbody.innerHTML = '';

    questions.forEach(q => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${q.id}</td>
            <td>${q.category || '-'}</td>
            <td>${truncate(q.content, 50)}</td>
            <td><span class="badge ${q.type === 'MULTIPLE_CHOICE' ? 'badge-primary' : 'badge-warning'}">${q.type === 'MULTIPLE_CHOICE' ? 'Çoktan Seçmeli' : 'Açık Uçlu'}</span></td>
            <td>${q.points}</td>
            <td>${q.duration}s</td>
            <td class="action-btns">
                <button class="btn btn-sm btn-secondary" onclick="editQuestion(${q.id})">✏️</button>
                <button class="btn btn-sm btn-danger" onclick="deleteQuestion(${q.id})">🗑️</button>
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
            <div class="contestant-table">${c.table_no}</div>
            <div class="contestant-name">${c.name}</div>
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
            <td>${c.table_no}</td>
            <td>${c.name}</td>
            <td>${c.total_score}</td>
            <td><span class="badge ${c.status === 'ONLINE' ? 'badge-success' : 'badge-danger'}">${c.status}</span></td>
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
            <td>${entry.table_no}</td>
            <td>${entry.name}</td>
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
        document.getElementById('questionOptions').value = question.options ? JSON.parse(question.options).join('\n') : '';
        document.getElementById('questionCorrectKeys').value = question.correct_keys ? JSON.parse(question.correct_keys).join('\n') : '';
        document.getElementById('questionPoints').value = question.points;
        document.getElementById('questionDuration').value = question.duration;
    } else {
        title.textContent = 'Yeni Soru Ekle';
        document.getElementById('questionForm').reset();
        document.getElementById('questionId').value = '';
    }

    // Şıklar görünürlüğü
    const type = document.getElementById('questionType').value;
    document.getElementById('optionsContainer').style.display = type === 'MULTIPLE_CHOICE' ? 'block' : 'none';

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
    const options = document.getElementById('questionOptions').value.split('\n').filter(o => o.trim());
    const correctKeys = document.getElementById('questionCorrectKeys').value.split('\n').filter(k => k.trim());
    const points = parseInt(document.getElementById('questionPoints').value);
    const duration = parseInt(document.getElementById('questionDuration').value);

    if (!content || !correctKeys.length) {
        showToast('Soru metni ve doğru cevap zorunludur', 'error');
        return;
    }

    const questionData = {
        content,
        category,
        type,
        options,
        correct_keys: correctKeys,
        points,
        duration
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

    container.innerHTML = `
        <div class="competition-header">
            <h3>📋 ${activeCompetition.name}</h3>
            <span class="badge badge-success">Aktif</span>
        </div>
        
        <div class="codes-section">
            <h4>👥 Yarışmacı Kodları</h4>
            <div class="codes-grid">
                ${contestantCodes.map(c => `
                    <div class="code-card ${c.is_used ? 'used' : ''}">
                        <div class="code-value">${c.code}</div>
                        <input type="text" class="code-name-input" value="${c.name}" 
                               onchange="updateCodeName(${c.id}, this.value)" placeholder="İsim girin">
                        <div class="code-status">${c.is_used ? '✅ Giriş yapıldı' : '⏳ Bekliyor'}</div>
                        ${c.is_used ? `<button class="btn btn-sm btn-secondary" onclick="resetCode(${c.id})">Sıfırla</button>` : ''}
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="codes-section">
            <h4>⚖️ Jüri Kodları</h4>
            <div class="codes-grid">
                ${juryCodes.map(c => `
                    <div class="code-card ${c.is_used ? 'used' : ''}">
                        <div class="code-value">${c.code}</div>
                        <input type="text" class="code-name-input" value="${c.name}" 
                               onchange="updateCodeName(${c.id}, this.value)" placeholder="İsim girin">
                        <div class="code-status">${c.is_used ? '✅ Giriş yapıldı' : '⏳ Bekliyor'}</div>
                        ${c.is_used ? `<button class="btn btn-sm btn-secondary" onclick="resetCode(${c.id})">Sıfırla</button>` : ''}
                    </div>
                `).join('')}
            </div>
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
                'X-Admin-Token': adminToken
            },
            body: JSON.stringify({ name, contestantCount, juryCount })
        });

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
                'X-Admin-Token': adminToken
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
            headers: { 'X-Admin-Token': adminToken }
        });
        loadActiveCompetition();
        showToast('Kod sıfırlandı', 'success');
    } catch (error) {
        console.error('Kod sıfırlama hatası:', error);
    }
}

function endCompetition() {
    if (confirm('Yarışmayı sonlandırmak istediğinize emin misiniz?')) {
        // API çağrısı yapılabilir, şimdilik sadece UI güncelle
        activeCompetition = null;
        competitionCodes = [];
        renderNoCompetition();
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
            <label class="form-label">
                <input type="checkbox" id="setting_sound_enabled" 
                       ${appSettings.sound_enabled === '1' ? 'checked' : ''}>
                Ses Efektleri Açık
            </label>
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
        sound_enabled: document.getElementById('setting_sound_enabled').checked ? '1' : '0'
    };

    try {
        for (const [key, value] of Object.entries(settings)) {
            await fetch(`/api/settings/${key}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Admin-Token': adminToken
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
    fetch('/api/auth/admin-logout', {
        method: 'POST',
        headers: { 'X-Admin-Token': adminToken }
    }).finally(() => {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUsername');
        window.location.href = '/admin-login';
    });
}

