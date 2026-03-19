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
declare const logger: pino.Logger<never, boolean>;
export default logger;
//# sourceMappingURL=logger.d.ts.map