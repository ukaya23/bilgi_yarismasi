"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pino_1 = __importDefault(require("pino"));
const level = (() => {
    switch (process.env.NODE_ENV) {
        case 'production': return 'info';
        case 'test': return 'silent';
        default: return 'debug';
    }
})();
const logger = (0, pino_1.default)({
    level,
    transport: process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test'
        ? { target: 'pino/file', options: { destination: 1 } }
        : undefined,
    formatters: {
        level(label) {
            return { level: label };
        }
    },
    timestamp: pino_1.default.stdTimeFunctions.isoTime
});
exports.default = logger;
//# sourceMappingURL=logger.js.map