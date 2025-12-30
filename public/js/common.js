/**
 * Ortak JavaScript Yardımcıları
 */

// ==================== SOCKET BAĞLANTI YÖNETİMİ ====================

class SocketManager {
    constructor(role) {
        this.role = role;
        this.socket = null;
        this.isConnected = false;
        this.connectionOverlay = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;

        this.init();
    }

    init() {
        // Socket.io bağlantısı
        this.socket = io({
            reconnection: true,
            reconnectionAttempts: this.maxReconnectAttempts,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000
        });

        // Bağlantı olayları
        this.socket.on('connect', () => {
            console.log('[SOCKET] Bağlandı:', this.socket.id);
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.hideConnectionOverlay();

            // Role katıl
            this.socket.emit('JOIN_ROOM', { role: this.role });
        });

        this.socket.on('disconnect', (reason) => {
            console.log('[SOCKET] Bağlantı koptu:', reason);
            this.isConnected = false;
            this.showConnectionOverlay();
        });

        this.socket.on('connect_error', (error) => {
            console.error('[SOCKET] Bağlantı hatası:', error);
            this.reconnectAttempts++;

            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                this.showConnectionOverlay('Sunucuya bağlanılamadı. Lütfen sayfayı yenileyin.');
            }
        });

        // Genel eventler
        this.socket.on('ERROR', (data) => {
            console.error('[SOCKET] Hata:', data.message);
            showToast(data.message, 'error');
        });
    }

    showConnectionOverlay(message = 'BAĞLANTI KOPTU - GÖREVLİ ÇAĞIRIN') {
        if (this.connectionOverlay) return;

        this.connectionOverlay = document.createElement('div');
        this.connectionOverlay.className = 'connection-overlay';
        this.connectionOverlay.innerHTML = `
            <h1>⚠️ BAĞLANTI HATASI</h1>
            <p>${message}</p>
            <div class="spinner" style="margin-top: 2rem;"></div>
        `;
        document.body.appendChild(this.connectionOverlay);
    }

    hideConnectionOverlay() {
        if (this.connectionOverlay) {
            this.connectionOverlay.remove();
            this.connectionOverlay = null;
        }
    }

    on(event, callback) {
        this.socket.on(event, callback);
    }

    emit(event, data) {
        if (this.isConnected) {
            this.socket.emit(event, data);
        } else {
            console.warn('[SOCKET] Bağlantı yok, emit yapılamıyor:', event);
        }
    }

    getSocket() {
        return this.socket;
    }
}

// ==================== TOAST BİLDİRİMLERİ ====================

function showToast(message, type = 'info', duration = 3000) {
    let container = document.querySelector('.toast-container');

    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="flex items-center gap-2">
            <span>${getToastIcon(type)}</span>
            <span>${message}</span>
        </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function getToastIcon(type) {
    switch (type) {
        case 'success': return '✅';
        case 'error': return '❌';
        case 'warning': return '⚠️';
        default: return 'ℹ️';
    }
}

// ==================== ZAMANLAYICI ====================

class Timer {
    constructor(displayElement, onTick, onComplete) {
        this.displayElement = displayElement;
        this.onTick = onTick;
        this.onComplete = onComplete;
        this.timeRemaining = 0;
        this.interval = null;
    }

    start(duration) {
        this.stop();
        this.timeRemaining = duration;
        this.update();

        this.interval = setInterval(() => {
            this.timeRemaining--;
            this.update();

            if (this.onTick) {
                this.onTick(this.timeRemaining);
            }

            if (this.timeRemaining <= 0) {
                this.stop();
                if (this.onComplete) {
                    this.onComplete();
                }
            }
        }, 1000);
    }

    sync(serverTime) {
        this.timeRemaining = serverTime;
        this.update();
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    update() {
        if (this.displayElement) {
            this.displayElement.textContent = this.timeRemaining;

            // Renk sınıflarını güncelle
            this.displayElement.classList.remove('warning', 'danger');

            if (this.timeRemaining <= 5) {
                this.displayElement.classList.add('danger');
            } else if (this.timeRemaining <= 10) {
                this.displayElement.classList.add('warning');
            }
        }
    }

    getTime() {
        return this.timeRemaining;
    }
}

// ==================== YARDIMCI FONKSİYONLAR ====================

/**
 * DOM elementi seç
 */
function $(selector) {
    return document.querySelector(selector);
}

/**
 * Tüm DOM elementlerini seç
 */
function $$(selector) {
    return document.querySelectorAll(selector);
}

/**
 * Element oluştur
 */
function createElement(tag, className, innerHTML) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (innerHTML) el.innerHTML = innerHTML;
    return el;
}

/**
 * Tarihi formatla
 */
function formatDate(date) {
    return new Date(date).toLocaleString('tr-TR');
}

/**
 * Sayıyı formatla
 */
function formatNumber(num) {
    return new Intl.NumberFormat('tr-TR').format(num);
}

/**
 * Metin kısalt
 */
function truncate(text, length = 50) {
    if (text.length <= length) return text;
    return text.substring(0, length) + '...';
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Debounce
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Animasyonlu sayaç
 */
function animateValue(element, start, end, duration) {
    const range = end - start;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Easing function (ease-out)
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(start + range * easeOut);

        element.textContent = formatNumber(current);

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }

    requestAnimationFrame(update);
}

/**
 * Local Storage yardımcıları
 */
const storage = {
    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch {
            return defaultValue;
        }
    },

    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.error('LocalStorage yazma hatası:', e);
        }
    },

    remove(key) {
        localStorage.removeItem(key);
    }
};

/**
 * Ses efektleri (opsiyonel)
 */
const sounds = {
    enabled: true,

    play(name) {
        if (!this.enabled) return;

        try {
            const audio = new Audio(`/sounds/${name}.mp3`);
            audio.volume = 0.5;
            audio.play().catch(() => { });
        } catch (e) {
            console.warn('Ses çalınamadı:', e);
        }
    },

    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }
};

// ==================== HEARTBEAT ====================

function startHeartbeat(socket, interval = 5000) {
    setInterval(() => {
        if (socket.isConnected) {
            socket.emit('PLAYER_HEARTBEAT');
        }
    }, interval);
}

// Export for non-module usage
window.SocketManager = SocketManager;
window.Timer = Timer;
window.showToast = showToast;
window.$ = $;
window.$$ = $$;
window.createElement = createElement;
window.formatDate = formatDate;
window.formatNumber = formatNumber;
window.truncate = truncate;
window.escapeHtml = escapeHtml;
window.debounce = debounce;
window.animateValue = animateValue;
window.storage = storage;
window.sounds = sounds;
window.startHeartbeat = startHeartbeat;
