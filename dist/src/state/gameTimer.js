"use strict";
/**
 * Game Timer - Zamanlayici yonetimi
 *
 * Soru suresi icin countdown timer.
 * GameState'ten ayrilmis bagimsiz moduldur.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameTimer = void 0;
class GameTimer {
    constructor() {
        this.timer = null;
        this.timeRemaining = 0;
    }
    /**
     * Zamanlayiciyi baslat
     */
    start(duration, onTick, onExpired) {
        this.stop();
        this.timeRemaining = duration;
        this.timer = setInterval(async () => {
            this.timeRemaining--;
            onTick(this.timeRemaining);
            if (this.timeRemaining <= 0) {
                this.stop();
                await onExpired();
            }
        }, 1000);
    }
    /**
     * Zamanlayiciyi durdur
     */
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.timeRemaining = 0;
    }
    /**
     * Timer calisiyorsa durdur ama timeRemaining'i sifirlamadan
     */
    clear() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    /**
     * Timer calisiyor mu?
     */
    get isRunning() {
        return this.timer !== null;
    }
}
exports.GameTimer = GameTimer;
//# sourceMappingURL=gameTimer.js.map