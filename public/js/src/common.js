/**
 * Ortak JavaScript Yardımcıları (ES Module)
 */

// ==================== SOCKET BAĞLANTI YÖNETİMİ ====================

export class SocketManager {
    constructor(role) {
        this.role = role;
        this.socket = null;
        this.isConnected = false;
        this.connectionOverlay = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.onReconnectCallback = null;

        this.init();
    }

    init() {
        let token = null;
        if (this.role === 'admin') {
            token = localStorage.getItem('adminAccessToken');
        } else if (this.role === 'player') {
            token = localStorage.getItem('playerAccessToken');
        } else if (this.role === 'jury') {
            token = localStorage.getItem('juryAccessToken');
        }

        const socketConfig = {
            reconnection: true,
            reconnectionAttempts: this.maxReconnectAttempts,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000
        };

        if (token) {
            socketConfig.auth = { token };
        }

        this.socket = io(socketConfig);

        this.socket.on('connect', () => {
            const wasConnected = this.isConnected;
            this.isConnected = true;
            this.hideConnectionOverlay();

            if (wasConnected && this.onReconnectCallback) {
                this.onReconnectCallback();
            }
            this.reconnectAttempts = 0;
        });

        this.socket.on('disconnect', () => {
            this.isConnected = false;
            this.showConnectionOverlay();
        });

        this.socket.on('connect_error', () => {
            this.reconnectAttempts++;
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                this.showConnectionOverlay('Sunucuya bağlanılamadı. Lütfen sayfayı yenileyin.');
            }
        });

        this.socket.on('ERROR', (data) => {
            showToast(data.message, 'error');
        });
    }

    showConnectionOverlay(message = 'BAĞLANTI KOPTU - GÖREVLİ ÇAĞIRIN') {
        if (this.connectionOverlay) return;

        this.connectionOverlay = document.createElement('div');
        this.connectionOverlay.className = 'connection-overlay';
        const h1 = document.createElement('h1');
        h1.textContent = '⚠️ BAĞLANTI HATASI';
        const p = document.createElement('p');
        p.textContent = message;
        const spinner = document.createElement('div');
        spinner.className = 'spinner';
        spinner.style.marginTop = '2rem';
        this.connectionOverlay.append(h1, p, spinner);
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
        }
    }

    getSocket() {
        return this.socket;
    }

    onReconnect(callback) {
        this.onReconnectCallback = callback;
    }
}

// ==================== TOAST BİLDİRİMLERİ ====================

function getToastIcon(type) {
    switch (type) {
        case 'success': return '✅';
        case 'error': return '❌';
        case 'warning': return '⚠️';
        default: return 'ℹ️';
    }
}

export function showToast(message, type = 'info', duration = 3000) {
    let container = document.querySelector('.toast-container');

    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const wrapper = document.createElement('div');
    wrapper.className = 'flex items-center gap-2';
    const iconSpan = document.createElement('span');
    iconSpan.textContent = getToastIcon(type);
    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;
    wrapper.append(iconSpan, msgSpan);
    toast.appendChild(wrapper);

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ==================== ZAMANLAYICI ====================

export class Timer {
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

export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function formatNumber(num) {
    return new Intl.NumberFormat('tr-TR').format(num);
}

export function formatDate(date) {
    return new Date(date).toLocaleString('tr-TR');
}

export function truncate(text, length = 50) {
    if (text.length <= length) return text;
    return text.substring(0, length) + '...';
}

export function debounce(func, wait) {
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

export function animateValue(element, start, end, duration) {
    const range = end - start;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(start + range * easeOut);

        element.textContent = formatNumber(current);

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }

    requestAnimationFrame(update);
}

export const storage = {
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
        } catch {
            // localStorage write error - ignore
        }
    },

    remove(key) {
        localStorage.removeItem(key);
    }
};
