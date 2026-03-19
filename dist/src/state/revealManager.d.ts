/**
 * Reveal Manager - Sonuc gosterim adim yonetimi
 *
 * GameState'ten ayrilmis bagimsiz moduldur.
 * Manuel modda admin'in adim adim sonuclari gostermesini yonetir.
 */
import type { Server } from 'socket.io';
export declare class RevealManager {
    currentStep: number;
    /**
     * Adim sayacini sifirla
     */
    reset(): void;
    /**
     * Sonraki adima gec ve broadcast yap
     */
    nextStep(io: Server): void;
    /**
     * Admin'e mevcut adim bilgisi gonder
     */
    notifyAdmin(io: Server, step: number): void;
}
//# sourceMappingURL=revealManager.d.ts.map