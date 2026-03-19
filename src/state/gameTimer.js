/**
 * Game Timer - Zamanlayici yonetimi
 *
 * Soru suresi icin countdown timer.
 * GameState'ten ayrilmis bagimsiz moduldur.
 */

class GameTimer {
    constructor() {
        this.timer = null;
        this.timeRemaining = 0;
    }

    /**
     * Zamanlayiciyi baslat
     * @param {number} duration - Sure (saniye)
     * @param {Function} onTick - Her saniye cagrilir (timeRemaining)
     * @param {Function} onExpired - Sure dolunca cagrilir
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
     * (lockQuestion icin - sure doldugunda timeRemaining zaten 0)
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

module.exports = { GameTimer };
