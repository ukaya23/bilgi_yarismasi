/**
 * Structured Logger (pino)
 *
 * Log seviyeleri:
 *   - fatal, error, warn, info, debug, trace
 *
 * NODE_ENV=production  -> info (debug/trace kapatilir)
 * NODE_ENV=development -> debug
 * NODE_ENV=test        -> silent (testlerde log bastirilir)
 */

import pino from 'pino';

const level = ((): string => {
    switch (process.env.NODE_ENV) {
        case 'production': return 'info';
        case 'test': return 'silent';
        default: return 'debug';
    }
})();

const logger = pino({
    level,
    transport: process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test'
        ? { target: 'pino/file', options: { destination: 1 } }
        : undefined,
    formatters: {
        level(label: string) {
            return { level: label };
        }
    },
    timestamp: pino.stdTimeFunctions.isoTime
});

export default logger;
