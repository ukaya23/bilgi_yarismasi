/**
 * Reveal Manager - Sonuc gosterim adim yonetimi
 *
 * GameState'ten ayrilmis bagimsiz moduldur.
 * Manuel modda admin'in adim adim sonuclari gostermesini yonetir.
 */

import type { Server } from 'socket.io';
import log from '../utils/logger';

const REVEAL_STEPS: string[] = [
    'Baslangic',
    'Resim Gosterimi',
    'Soru Gosterimi',
    'Cevaplar',
    'Dogru Cevap',
    'Siralama',
    'Tam Ekran Siralama',
    'Tamamlandi'
];

const LAST_STEP = 6;

export class RevealManager {
    currentStep: number = 0;

    /**
     * Adim sayacini sifirla
     */
    reset(): void {
        this.currentStep = 0;
    }

    /**
     * Sonraki adima gec ve broadcast yap
     */
    nextStep(io: Server): void {
        this.currentStep++;
        log.debug({ step: this.currentStep, stepName: REVEAL_STEPS[this.currentStep] || 'Bilinmiyor' }, 'Reveal adimi');

        io.to('screen').emit('SCREEN_STEP_UPDATE', {
            step: this.currentStep
        });

        this.notifyAdmin(io, this.currentStep);
    }

    /**
     * Admin'e mevcut adim bilgisi gonder
     */
    notifyAdmin(io: Server, step: number): void {
        const stepName = REVEAL_STEPS[step] || 'Bilinmiyor';
        const isFinished = step >= LAST_STEP;

        io.to('admin').emit('ADMIN_REVEAL_STATE', {
            step,
            stepName,
            isFinished
        });
    }
}
