/**
 * Game Timer - Zamanlayici yonetimi
 *
 * Soru suresi icin countdown timer.
 * GameState'ten ayrilmis bagimsiz moduldur.
 */

export class GameTimer {
    private timer: ReturnType<typeof setInterval> | null = null;
    timeRemaining: number = 0;

    /**
     * Zamanlayiciyi baslat
     */
    start(duration: number, onTick: (timeRemaining: number) => void, onExpired: () => Promise<void>): void {
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
    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.timeRemaining = 0;
    }

    /**
     * Timer calisiyorsa durdur ama timeRemaining'i sifirlamadan
     */
    clear(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /**
     * Timer calisiyor mu?
     */
    get isRunning(): boolean {
        return this.timer !== null;
    }
}
