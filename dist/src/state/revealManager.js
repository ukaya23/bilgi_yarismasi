"use strict";
/**
 * Reveal Manager - Sonuc gosterim adim yonetimi
 *
 * GameState'ten ayrilmis bagimsiz moduldur.
 * Manuel modda admin'in adim adim sonuclari gostermesini yonetir.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RevealManager = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
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
     */
    nextStep(io) {
        this.currentStep++;
        logger_1.default.debug({ step: this.currentStep, stepName: REVEAL_STEPS[this.currentStep] || 'Bilinmiyor' }, 'Reveal adimi');
        io.to('screen').emit('SCREEN_STEP_UPDATE', {
            step: this.currentStep
        });
        this.notifyAdmin(io, this.currentStep);
    }
    /**
     * Admin'e mevcut adim bilgisi gonder
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
exports.RevealManager = RevealManager;
//# sourceMappingURL=revealManager.js.map