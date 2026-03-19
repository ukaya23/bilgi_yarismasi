/**
 * Reveal Manager - Sonuc gosterim adim yonetimi
 *
 * GameState'ten ayrilmis bagimsiz moduldur.
 * Manuel modda admin'in adim adim sonuclari gostermesini yonetir.
 */

const log = require('../utils/logger');

const REVEAL_STEPS = [
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

class RevealManager {
    constructor() {
        this.currentStep = 0;
    }

    /**
     * Adim sayacini sifirla
     */
    reset() {
        this.currentStep = 0;
    }

    /**
     * Sonraki adima gec ve broadcast yap
     * @param {object} io - Socket.io instance
     */
    nextStep(io) {
        this.currentStep++;
        log.debug({ step: this.currentStep, stepName: REVEAL_STEPS[this.currentStep] || 'Bilinmiyor' }, 'Reveal adimi');

        io.to('screen').emit('SCREEN_STEP_UPDATE', {
            step: this.currentStep
        });

        this.notifyAdmin(io, this.currentStep);
    }

    /**
     * Admin'e mevcut adim bilgisi gonder
     * @param {object} io - Socket.io instance
     * @param {number} step - Adim numarasi
     */
    notifyAdmin(io, step) {
        const stepName = REVEAL_STEPS[step] || 'Bilinmiyor';
        const isFinished = step >= LAST_STEP;

        io.to('admin').emit('ADMIN_REVEAL_STATE', {
            step,
            stepName,
            isFinished
        });
    }
}

module.exports = { RevealManager };
