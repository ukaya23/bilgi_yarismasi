/**
 * Spectator Screen JavaScript - Cinematic Edition
 */

// ==================== STATE ====================

let socketManager;
let timer;
let contestants = [];
let currentLeaderboard = [];
let cinematicManager;

// ==================== UTILS ====================

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==================== CINEMATIC MANAGER ====================

class CinematicManager {
    constructor() {
        this.isRevealing = false;
        this.currentData = null;
        this.autoSequenceTimeout = null;
    }

    /**
     * Reveal sürecini başlatır
     * @param {Object} data Sonuç verileri
     */
    startReveal(data) {
        this.currentData = data;
        this.isRevealing = true;

        // Initial setup
        showResultsScreen(data);
        this.resetRevealState();
        showScreen('resultsScreen');

        // Mod kontrolü
        if (data.mode === 'MANUAL') {
            console.log('[CINEMATIC] Manual Mode Active. Waiting for steps...');
            // Manuel modda sadece ilk adımı (suspense) veya 0. adımı bekleriz
        } else {
            console.log('[CINEMATIC] Auto Mode Active. Starting sequence...');
            this.runAutoSequence();
        }
    }

    /**
     * Belirli bir adımı çalıştırır
     * @param {number} step Adım numarası
     */
    async executeStep(step) {
        if (!this.currentData) return;

        console.log(`[CINEMATIC] Executing Step: ${step}`);

        switch (step) {
            case 1: // Reveal Image
                if (this.currentData.question.media_url) {
                    const mediaBox = document.getElementById('revealMediaBox');
                    if (mediaBox) {
                        this.revealElement('revealMediaBox');
                    }
                } else {
                    console.log('[CINEMATIC] No image to reveal, skipping visual...');
                }
                break;

            case 2: // Reveal Question
                this.revealElement('revealQuestionBox');
                break;

            case 3: // Reveal User Answers
                if (this.currentData.answers && this.currentData.answers.length > 0) {
                    updateAnswersGrid(this.currentData.answers, true);
                    this.revealElement('answersPanel');
                    this.staggerRevealAnswers();
                }
                break;

            case 4: // Reveal Correct Answer
                const answerEl = document.getElementById('revealAnswer');
                this.revealElement('revealAnswerBox');
                setTimeout(() => {
                    if (answerEl) answerEl.classList.add('visible');
                }, 800);
                break;

            case 5: // Leaderboard
                // Show Leaderboard Panel (Side-by-Side)
                console.log('[CINEMATIC] Showing Leaderboard (Side-by-Side)');
                const resultsLayout = document.querySelector('.results-layout');
                if (resultsLayout) {
                    resultsLayout.classList.remove('initial-state');
                    // Side-by-side view active
                }

                // Wait for transition, then play animation
                await delay(800);
                await this.playLeaderboardSequence(this.currentData.leaderboard);
                break;

            case 6: // Full Screen Transition
                const finalLayout = document.querySelector('.results-layout');
                if (finalLayout) {
                    finalLayout.classList.add('full-leaderboard');
                }
                this.isRevealing = false; // Bitti
                break;
        }
    }

    /**
     * Otomatik akışı çalıştırır
     */
    async runAutoSequence() {
        // Step 0: Initial suspence (3s)
        await delay(3000);

        // Step 1: Image (2s wait if exists)
        await this.executeStep(1);
        if (this.currentData.question.media_url) await delay(2000);

        // Step 2: Question (4s wait)
        await this.executeStep(2);
        await delay(4000);

        // Step 3: Answers (6s wait)
        await this.executeStep(3);
        if (this.currentData.answers && this.currentData.answers.length > 0) await delay(6000);

        // Step 4: Correct Answer (5s wait)
        await this.executeStep(4);
        await delay(5000);

        // Step 5: Leaderboard
        await this.executeStep(5);
        // Leaderboard sequence takes time inside, usually handled by animations

        // Step 6: Full Screen (3s wait after leaderboard)
        await delay(3000);
        await this.executeStep(6);
    }

    resetRevealState() {
        // Reset full-screen mode
        const resultsLayout = document.querySelector('.results-layout');
        if (resultsLayout) {
            resultsLayout.classList.remove('full-leaderboard');
            resultsLayout.classList.add('initial-state'); // Hide leaderboard initially
        }

        // Add classes to hide elements
        const elementsToHide = ['revealMediaBox', 'revealQuestionBox', 'revealAnswerBox', 'answersPanel'];

        elementsToHide.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.add('reveal-step');
                el.classList.remove('visible');
            }
        });

        // Reset answer visibility
        const answerEl = document.getElementById('revealAnswer');
        if (answerEl) answerEl.classList.remove('visible');
    }

    revealElement(id) {
        const el = document.getElementById(id);
        if (el) el.classList.add('visible');
    }

    staggerRevealAnswers() {
        const cards = document.querySelectorAll('.answer-card');
        cards.forEach((card, index) => {
            setTimeout(() => {
                card.classList.add('reveal-visible');
                card.classList.remove('reveal-hidden');
            }, index * 100);
        });
    }

    async playLeaderboardSequence(newLeaderboard) {
        console.log('[CINEMATIC] Leaderboard sequence...');

        const oldState = [...currentLeaderboard];
        currentLeaderboard = newLeaderboard;

        await this.renderLeaderboardFLIP(oldState, newLeaderboard);
    }

    async renderLeaderboardFLIP(oldData, newData) {
        const container = document.getElementById('leaderboard');

        // 1. Initial Render (Old Positions)
        const startData = oldData.length > 0 ? oldData : newData;
        container.innerHTML = '';
        const cardMap = new Map();

        newData.forEach((p, i) => {
            const oldP = startData.find(o => o.id === p.id) || { ...p, total_score: 0, rank: 999 };
            const oldRankIdx = startData.findIndex(o => o.id === p.id);
            const initialTop = (oldRankIdx !== -1 ? oldRankIdx : i) * 80;

            const card = this.createLeaderboardCard(p, oldP.total_score, oldRankIdx !== -1 ? oldRankIdx : i);
            card.style.top = `${initialTop}px`;

            container.appendChild(card);
            cardMap.set(p.id, card);
        });

        await delay(1000);

        // 2. Animate Scores
        for (const p of newData) {
            const oldP = startData.find(o => o.id === p.id);
            const oldScore = oldP ? oldP.total_score : 0;
            if (p.total_score !== oldScore) {
                const card = cardMap.get(p.id);
                const scoreEl = card.querySelector('.entry-score');
                this.animateCounter(scoreEl, oldScore, p.total_score, 1500);
                scoreEl.classList.add('score-up');
            }
        }

        await delay(2000);

        // 3. Reorder (FLIP)
        newData.forEach((p, newIndex) => {
            const card = cardMap.get(p.id);
            const newTop = newIndex * 80;

            card.style.top = `${newTop}px`;

            card.classList.remove('top-1', 'top-2', 'top-3');
            if (newIndex === 0) card.classList.add('top-1');
            if (newIndex === 1) card.classList.add('top-2');
            if (newIndex === 2) card.classList.add('top-3');

            const rankEmoji = newIndex === 0 ? '🥇' : newIndex === 1 ? '🥈' : newIndex === 2 ? '🥉' : `${newIndex + 1}`;
            card.querySelector('.entry-rank').textContent = rankEmoji;
        });
    }

    createLeaderboardCard(player, score, rankIndex) {
        const div = document.createElement('div');
        div.className = 'leaderboard-entry';

        if (rankIndex === 0) div.classList.add('top-1');
        else if (rankIndex === 1) div.classList.add('top-2');
        else if (rankIndex === 2) div.classList.add('top-3');

        const rankEmoji = rankIndex === 0 ? '🥇' : rankIndex === 1 ? '🥈' : rankIndex === 2 ? '🥉' : `${rankIndex + 1}`;

        div.innerHTML = `
            <div class="entry-rank">${rankEmoji}</div>
            <div class="entry-info">
                <div class="entry-name">${escapeHtml(player.name)}</div>
                <div class="entry-table">Masa ${escapeHtml(String(player.table_no))}</div>
            </div>
            <div class="entry-score">${score}</div>
        `;
        return div;
    }

    animateCounter(el, start, end, duration) {
        const range = end - start;
        const startTime = Date.now();
        const timer = setInterval(() => {
            const timePassed = Date.now() - startTime;
            let progress = timePassed / duration;
            if (progress > 1) progress = 1;

            const ease = 1 - Math.pow(1 - progress, 3);
            const current = Math.floor(start + (range * ease));
            el.textContent = current;

            if (progress === 1) {
                clearInterval(timer);
                el.classList.remove('score-up');
            }
        }, 16);
    }
}

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', () => {
    socketManager = new SocketManager('screen');
    cinematicManager = new CinematicManager();

    // Initialize sound manager
    if (typeof soundManager !== 'undefined') {
        soundManager.init();
    }

    timer = new Timer(
        document.getElementById('timerValue'),
        (timeLeft) => {
            const timerEl = document.getElementById('timerValue');
            timerEl.classList.remove('warning', 'danger');
            if (timeLeft <= 5) {
                timerEl.classList.add('danger');
            } else if (timeLeft <= 10) {
                timerEl.classList.add('warning');
                // Play tick sound during warning phase
                if (typeof soundManager !== 'undefined') {
                    soundManager.playTick();
                }
            }
        },
        null
    );

    setupSocketEvents();
    updateConnectionStatus();

    // Yeniden bağlantıda durumu senkronize et
    socketManager.onReconnect(() => {
        console.log('[SCREEN] Reconnect - state senkronizasyonu...');
    });
});

// ==================== SOCKET EVENTS ====================

function setupSocketEvents() {
    socketManager.on('INIT_DATA', (data) => {
        contestants = data.contestants;
        currentLeaderboard = data.leaderboard; // Initial load

        updateContestantsPreview();
        handleGameState(data.gameState);

        if (data.gameState.currentQuestion) {
            updateQuestionCounter(data.gameState.currentQuestion.index, data.gameState.currentQuestion.total);
        } else {
            updateQuestionCounter('-', '-');
        }

        // Aktif soru varsa ekranı hemen göster (sayfa yenilenme durumu)
        if (data.activeQuestion) {
            showQuestionScreen(data.activeQuestion);
            // Timer'ı kalan süreye senkronize et
            if (data.activeQuestion.timeRemaining != null) {
                timer.sync(data.activeQuestion.timeRemaining);
            }
        }

        if (data.quote && !data.activeQuestion) showQuote(data.quote);
    });

    socketManager.on('GAME_STATE', (data) => {
        if (data.currentQuestion) {
            updateQuestionCounter(data.currentQuestion.index, data.currentQuestion.total);
        }
        handleGameState(data);
    });

    socketManager.on('MASKED_QUESTION', (data) => {
        updateQuestionCounter(data.index, data.total);
        showQuestionScreen(data);
    });

    socketManager.on('TIME_SYNC', (data) => {
        timer.sync(data.timeRemaining);
    });

    socketManager.on('CONTESTANTS_UPDATED', (data) => {
        contestants = data;
        updateContestantsGrid();
        updateContestantsPreview();
    });

    socketManager.on('PLAYER_STATUS_UPDATE', (data) => {
        updatePlayerStatus(data.contestantId, data.status);
    });

    socketManager.on('GRADING_STATUS', (data) => {
        showGradingScreen(data.message);
    });

    socketManager.on('SHOW_RESULTS', (data) => {
        // Play results sound
        if (typeof soundManager !== 'undefined') {
            soundManager.playResults();
        }
        // Trigger Cinematic Reveal
        cinematicManager.startReveal(data);
    });

    socketManager.on('SCREEN_STEP_UPDATE', (data) => {
        cinematicManager.executeStep(data.step);
    });

    socketManager.on('NEW_QUOTE', (data) => {
        showQuote(data);
    });

    socketManager.on('SHOW_PODIUM', (data) => {
        showPodiumScreen(data.leaderboard);
    });

    socketManager.on('GAME_RESET', () => {
        showScreen('idleScreen');
        // Clear podium if it was active
        const podiumContainer = document.getElementById('podiumContainer');
        if (podiumContainer) podiumContainer.innerHTML = ''; // or reset logic
    });
}

function updateQuestionCounter(current, total) {
    document.getElementById('currentQuestionIdx').textContent = current;
    document.getElementById('totalQuestions').textContent = total;
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
            // Wait for MASKED_QUESTION
            break;
        case 'LOCKED':
        case 'GRADING':
            showGradingScreen('Değerlendirme Sürüyor...');
            break;
        case 'REVEAL':
            // Logic handled in SHOW_RESULTS
            break;
    }
}

// ==================== HELPER FUNCTIONS ====================

function updateContestantsPreview() {
    const container = document.getElementById('contestantsPreview');
    const online = contestants.filter(c => c.status === 'ONLINE');
    container.innerHTML = '';
    online.forEach(c => {
        const badge = document.createElement('div');
        badge.className = 'preview-badge online';
        badge.innerHTML = `<span class="status-dot status-online"></span><span>Masa ${escapeHtml(String(c.table_no))}: ${escapeHtml(c.name)}</span>`;
        container.appendChild(badge);
    });
    if (online.length === 0) container.innerHTML = '<p class="text-muted">Henüz yarışmacı bağlanmadı</p>';
}

function showQuestionScreen(data) {
    showScreen('questionScreen');

    // Play question start sound
    if (typeof soundManager !== 'undefined') {
        soundManager.playQuestionStart();
    }

    timer.start(data.duration);
    document.getElementById('timerValue').classList.remove('warning', 'danger');
    document.getElementById('categoryValue').textContent = data.category || 'Genel Kültür';
    document.getElementById('pointsValue').textContent = data.points;
    if (data.index) updateQuestionCounter(data.index, data.total);

    // Resim vs Quote
    const mediaContainer = document.getElementById('screenMedia');
    const quoteContainer = document.getElementById('quoteContainer');
    const imageEl = document.getElementById('screenQuestionImage');

    if (data.media_url) {
        imageEl.src = data.media_url;
        mediaContainer.classList.remove('hidden');
        mediaContainer.style.display = 'flex';
        if (quoteContainer) quoteContainer.classList.add('hidden');
    } else {
        mediaContainer.classList.add('hidden');
        mediaContainer.style.display = 'none';
        if (quoteContainer) {
            quoteContainer.classList.remove('hidden');
            if (data.quote) showQuote(data.quote);
        }
    }

    updateContestantsGrid();
}

function showQuote(quote) {
    const quoteContainer = document.getElementById('quoteContainer');
    // Eğer resim görünüyorsa, quote güncellemelerini yoksay (veya arka planda yap ama gösterme)
    if (document.getElementById('screenMedia').classList.contains('hidden')) {
        quoteContainer.classList.remove('hidden');
    }

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
        card.innerHTML = `<div class="contestant-table">${escapeHtml(String(c.table_no))}</div><div class="contestant-name">${escapeHtml(c.name)}</div>`;
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

function showGradingScreen(message) {
    showScreen('gradingScreen');
    document.querySelector('.grading-content h2').textContent = message;
}

function showResultsScreen(data) {
    showScreen('resultsScreen');

    // Populate Data (Hidden)
    document.getElementById('revealQuestion').textContent = data.question.content;
    document.getElementById('revealAnswer').textContent = data.question.correctAnswer;

    // Resim Gösterimi (Sonuç Ekranı)
    const revealMedia = document.getElementById('revealMedia');
    const revealImage = document.getElementById('revealImage');
    const revealMediaBox = document.getElementById('revealMediaBox');

    if (data.question.media_url) {
        revealImage.src = data.question.media_url;
        revealMedia.classList.remove('hidden');
        revealMedia.style.display = 'flex'; // Zorla göster
        if (revealMediaBox) revealMediaBox.style.display = 'block'; // Container'ı göster (block veya flex)
    } else {
        revealMedia.classList.add('hidden');
        revealMedia.style.display = 'none';
        if (revealMediaBox) revealMediaBox.style.display = 'none';
    }
}

function updateAnswersGrid(answers, hidden = false) {
    const grid = document.getElementById('answersGrid');
    if (!grid) return;
    grid.innerHTML = '';
    answers.forEach(a => {
        const card = document.createElement('div');
        const isCorrect = a.is_correct === 1;
        const isEmpty = !a.answer_text || a.answer_text.trim() === '';
        let statusClass = 'incorrect';
        if (isEmpty) statusClass = 'empty';
        else if (isCorrect) statusClass = 'correct';

        card.className = `answer-card ${statusClass}`;
        if (hidden) card.classList.add('reveal-hidden');

        card.innerHTML = `
            <div class="answer-card-header">
                <span>Masa ${escapeHtml(String(a.table_no))}</span>
                <span>${escapeHtml(a.name)}</span>
            </div>
            <div class="answer-card-content">
                ${isEmpty ? '(Boş)' : escapeHtml(a.answer_text)}
            </div>
        `;
        grid.appendChild(card);
    });
}

// Periodic Quote
setInterval(() => {
    const idleScreen = document.getElementById('idleScreen');
    if (!idleScreen.classList.contains('hidden')) {
        socketManager.emit('SCREEN_REQUEST_QUOTE');
    }
}, 30000);

// ==================== PODIUM SCREEN ====================
function showPodiumScreen(leaderboard) {
    showScreen('podiumScreen');

    // reset bars
    const bars = document.querySelectorAll('.podium-bar');
    bars.forEach(bar => bar.style.height = '0');

    const p1 = leaderboard[0];
    const p2 = leaderboard[1];
    const p3 = leaderboard[2];

    // Set text
    if (p1) {
        document.getElementById('podiumName1').textContent = p1.name;
        document.getElementById('podiumScore1').textContent = p1.total_score;
        document.getElementById('podium1').classList.remove('hidden');
    } else {
        document.getElementById('podium1').classList.add('hidden');
    }

    if (p2) {
        document.getElementById('podiumName2').textContent = p2.name;
        document.getElementById('podiumScore2').textContent = p2.total_score;
        document.getElementById('podium2').classList.remove('hidden');
    } else {
        document.getElementById('podium2').classList.add('hidden');
    }

    if (p3) {
        document.getElementById('podiumName3').textContent = p3.name;
        document.getElementById('podiumScore3').textContent = p3.total_score;
        document.getElementById('podium3').classList.remove('hidden');
    } else {
        document.getElementById('podium3').classList.add('hidden');
    }

    // Animate bars
    setTimeout(() => {
        if (p3) document.querySelector('.place-3 .podium-bar').style.height = '15vh';
        if (p2) document.querySelector('.place-2 .podium-bar').style.height = '25vh';
        if (p1) document.querySelector('.place-1 .podium-bar').style.height = '35vh';
        if (typeof soundManager !== 'undefined') soundManager.playResults();

        startConfetti();
    }, 500);
}

// Simple Confetti logic
let confettiCtx = null;
let confettiParticles = [];
function startConfetti() {
    const canvas = document.getElementById('confettiCanvas');
    if (!canvas) return;
    confettiCtx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    confettiParticles = [];
    for (let i = 0; i < 150; i++) {
        confettiParticles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            r: Math.random() * 6 + 4,
            dx: Math.random() * 4 - 2,
            dy: Math.random() * 5 + 2,
            color: `hsl(${Math.random() * 360}, 100%, 50%)`,
            tilt: Math.random() * 10 - 10,
            tiltAngle: 0,
            tiltAngleInc: (Math.random() * 0.07) + 0.05
        });
    }
    requestAnimationFrame(renderConfetti);
}

function renderConfetti() {
    if (!confettiCtx) return;
    confettiCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    let active = false;
    for (let i = 0; i < confettiParticles.length; i++) {
        let p = confettiParticles[i];
        p.tiltAngle += p.tiltAngleInc;
        p.y += p.dy;
        p.x += Math.sin(p.tiltAngle) * 2;
        p.tilt = Math.sin(p.tiltAngle) * 15;
        if (p.y <= window.innerHeight) active = true;

        confettiCtx.beginPath();
        confettiCtx.lineWidth = p.r;
        confettiCtx.strokeStyle = p.color;
        confettiCtx.moveTo(p.x + p.tilt + p.r, p.y);
        confettiCtx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r);
        confettiCtx.stroke();
    }
    if (active) requestAnimationFrame(renderConfetti);
}

