/**
 * Game Timer - Zamanlayici yonetimi
 *
 * Soru suresi icin countdown timer.
 * GameState'ten ayrilmis bagimsiz moduldur.
 */
export declare class GameTimer {
    private timer;
    timeRemaining: number;
    /**
     * Zamanlayiciyi baslat
     */
    start(duration: number, onTick: (timeRemaining: number) => void, onExpired: () => Promise<void>): void;
    /**
     * Zamanlayiciyi durdur
     */
    stop(): void;
    /**
     * Timer calisiyorsa durdur ama timeRemaining'i sifirlamadan
     */
    clear(): void;
    /**
     * Timer calisiyor mu?
     */
    get isRunning(): boolean;
}
//# sourceMappingURL=gameTimer.d.ts.map