/**
 * Structured Logger (pino)
 *
 * Log seviyeleri:
 *   - fatal, error, warn, info, debug, trace
 *
 * NODE_ENV=production  -> info (debug/trace kapatilir)
 * NODE_ENV=development -> debug
 * NODE_ENV=test        -> silent (testlerde log bastirilir)
 *
 * Kullanim:
 *   const log = require('./utils/logger');
 *   log.info({ socketId: 'abc' }, 'Yeni baglanti');
 *   log.error({ err }, 'DB hatasi');
 */

const pino = require('pino');

const level = (() => {
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
        level(label) {
            return { level: label };
        }
    },
    timestamp: pino.stdTimeFunctions.isoTime
});

module.exports = logger;
