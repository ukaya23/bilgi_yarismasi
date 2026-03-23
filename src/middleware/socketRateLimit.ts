/**
 * Socket.io Event Rate Limiter
 *
 * Her socket bağlantısı için event gönderim hızını sınırlar.
 * Spam/flood saldırılarına karşı koruma sağlar.
 */

import type { Socket } from 'socket.io';
import log from '../utils/logger';

interface RateLimitConfig {
    maxEvents: number;    // Pencere içinde max event sayısı
    windowMs: number;     // Pencere süresi (ms)
}

const DEFAULT_CONFIG: RateLimitConfig = {
    maxEvents: 30,
    windowMs: 5_000
};

const socketCounters = new Map<string, { count: number; resetTime: number }>();

export function applySocketRateLimit(socket: Socket, config: RateLimitConfig = DEFAULT_CONFIG): void {
    const originalOn = socket.on.bind(socket);

    socket.on = function (event: string, listener: (...args: any[]) => void) {
        // Dahili socket.io olaylarını sınırlama
        if (event === 'disconnect' || event === 'error' || event === 'connect') {
            return originalOn(event, listener);
        }

        return originalOn(event, (...args: any[]) => {
            const now = Date.now();
            let counter = socketCounters.get(socket.id);

            if (!counter || now > counter.resetTime) {
                counter = { count: 0, resetTime: now + config.windowMs };
                socketCounters.set(socket.id, counter);
            }

            counter.count++;

            if (counter.count > config.maxEvents) {
                log.warn({ socketId: socket.id, event, count: counter.count }, 'Socket rate limit asildi');
                socket.emit('RATE_LIMITED', { message: 'Çok fazla istek gönderiyorsunuz.' });
                return;
            }

            listener(...args);
        });
    } as any;

    socket.on('disconnect', () => {
        socketCounters.delete(socket.id);
    });
}
