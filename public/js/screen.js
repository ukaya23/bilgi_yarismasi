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
    }

    async playRevealSequence(data) {
        if (this.isRevealing) return;
        this.isRevealing = true;

        console.log('[CINEMATIC] Starting reveal sequence...');

        // 1. Initial State: Hide everything, show suspense
        showScreen('resultsScreen');
        this.resetRevealState();

        // Wait for suspense (3s) - User said "bir kaç saniye beklesin"
        await delay(3000);

        // 2. Reveal Question
        console.log('[CINEMATIC] Phase: Reveal Question');
        this.revealElement('revealQuestionBox');
        // Give time for presenter to read the question (approx 4s)
        await delay(4000);

        // 3. Reveal User Answers
        if (data.answers && data.answers.length > 0) {
            console.log('[CINEMATIC] Phase: Reveal Answers');
            updateAnswersGrid(data.answers, true); // Render hidden
            this.revealElement('answersPanel');
            this.staggerRevealAnswers();
            // Give time to read answers (approx 6s)
            await delay(6000);
        }

        // 4. Reveal Correct Answer
        console.log('[CINEMATIC] Phase: Reveal Correct Answer');
        const answerEl = document.getElementById('revealAnswer');
        // Ensure wrapper is visible, then animate inner text
        this.revealElement('revealAnswerBox');

        setTimeout(() => {
            if (answerEl) answerEl.classList.add('visible');
        }, 800);

        await delay(5000);

        // 5. Leaderboard Phase
        console.log('[CINEMATIC] Phase: Leaderboard');
        await this.playLeaderboardSequence(data.leaderboard);

        this.isRevealing = false;
    }

    resetRevealState() {
        // Add classes to hide elements
        document.getElementById('revealQuestionBox').classList.add('reveal-step');
        document.getElementById('revealQuestionBox').classList.remove('visible');

        document.getElementById('revealAnswerBox').classList.add('reveal-step');
        document.getElementById('revealAnswerBox').classList.remove('visible');

        document.getElementById('answersPanel').classList.add('reveal-step');
        document.getElementById('answersPanel').classList.remove('visible');
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

        // 5.1 Show Leaderboard Container
        // Ensure container is cleared but layout exists
        const container = document.getElementById('leaderboard');
        container.innerHTML = '';

        // Render CURRENT state (before updates if possible, but we only have new state)
        // ideally we should have kept the old state. For now, we render new state but with old scores?
        // Let's just render the new state with animations for now.

        // Render items at their FINAL positions but maybe calculate "previous" positions?
        // Simpler approach: FLIP animation from currentDOM to newDOM? 
        // Since we re-render, let's just animate entry.

        // To do a true rank change animation, we need to know the previous ranks.
        // We have `currentLeaderboard` (global var) which *should* be the old one before we update it.

        const oldState = [...currentLeaderboard];
        currentLeaderboard = newLeaderboard; // Update global state

        // Render "Old" state first (for visual continuity) if possible, OR
        // Just render new state and animate. Use FLIP if we can match IDs.

        // Let's use a robust approach:
        // 1. Render all contestants based on OLD scores/ranks.
        // 2. Wait.
        // 3. Update scores (animate numbers).
        // 4. Sort and move to new positions.

        await this.renderLeaderboardFLIP(oldState, newLeaderboard);
    }

    async renderLeaderboardFLIP(oldData, newData) {
        const container = document.getElementById('leaderboard');

        // Map for easy lookup
        const newMap = new Map(newData.map(p => [p.id, p]));

        // 1. Render Initial State (Old Data)
        // If oldData is empty (first run), just use newData start
        const startData = oldData.length > 0 ? oldData : newData;

        container.innerHTML = '';
        const cardMap = new Map(); // id -> element

        // Create elements for EVERYONE in the new data (even if they weren't in old)
        newData.forEach((p, i) => {
            const oldP = startData.find(o => o.id === p.id) || { ...p, total_score: 0, rank: 999 };
            // Calculate old rank
            const oldRankIdx = startData.findIndex(o => o.id === p.id);
            const initialTop = (oldRankIdx !== -1 ? oldRankIdx : i) * 70; // approx height + gap

            const card = this.createLeaderboardCard(p, oldP.total_score, oldRankIdx !== -1 ? oldRankIdx : i);
            // Force absolute position
            card.style.top = `${initialTop}px`;

            container.appendChild(card);
            cardMap.set(p.id, card);
        });

        // Wait to see old state
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
            const newTop = newIndex * 70; // Height + gap

            // Apply new position
            card.style.top = `${newTop}px`;

            // Update styling for top 3
            card.classList.remove('top-1', 'top-2', 'top-3');
            if (newIndex === 0) card.classList.add('top-1');
            if (newIndex === 1) card.classList.add('top-2');
            if (newIndex === 2) card.classList.add('top-3');

            // Update rank icon
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
                <div class="entry-name">${player.name}</div>
                <div class="entry-table">Masa ${player.table_no}</div>
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

            // Ease out
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

    timer = new Timer(
        document.getElementById('timerValue'),
        (timeLeft) => {
            const timerEl = document.getElementById('timerValue');
            timerEl.classList.remove('warning', 'danger');
            if (timeLeft <= 5) timerEl.classList.add('danger');
            else if (timeLeft <= 10) timerEl.classList.add('warning');
        },
        null
    );

    setupSocketEvents();
    updateConnectionStatus();
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

        if (data.quote) showQuote(data.quote);
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
        // Trigger Cinematic Reveal
        cinematicManager.playRevealSequence(data);
    });

    socketManager.on('NEW_QUOTE', (data) => {
        showQuote(data);
    });

    socketManager.on('GAME_RESET', () => {
        showScreen('idleScreen');
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
        badge.innerHTML = `<span class="status-dot status-online"></span><span>Masa ${c.table_no}: ${c.name}</span>`;
        container.appendChild(badge);
    });
    if (online.length === 0) container.innerHTML = '<p class="text-muted">Henüz yarışmacı bağlanmadı</p>';
}

function showQuestionScreen(data) {
    showScreen('questionScreen');
    timer.start(data.duration);
    document.getElementById('timerValue').classList.remove('warning', 'danger');
    document.getElementById('categoryValue').textContent = data.category || 'Genel Kültür';
    document.getElementById('pointsValue').textContent = data.points;
    if (data.index) updateQuestionCounter(data.index, data.total);
    if (data.quote) showQuote(data.quote);
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
        card.innerHTML = `<div class="contestant-table">${c.table_no}</div><div class="contestant-name">${c.name}</div>`;
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
                <span>Masa ${a.table_no}</span>
                <span>${a.name}</span>
            </div>
            <div class="answer-card-content">
                ${isEmpty ? '(Boş)' : a.answer_text}
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
