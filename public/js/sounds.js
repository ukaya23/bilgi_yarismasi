/**
 * Sound Effects Manager
 * Manages audio playback for the quiz application
 */

class SoundManager {
    constructor() {
        this.enabled = true;
        this.sounds = {};
        this.initialized = false;

        // Sound file definitions with base64 encoded simple beeps
        // These are fallback sounds - you can replace with actual mp3 files
        this.soundConfigs = {
            questionStart: { type: 'synth', frequency: 880, duration: 0.3, wave: 'sine' },
            tick: { type: 'synth', frequency: 1000, duration: 0.05, wave: 'square' },
            timeWarning: { type: 'synth', frequency: 600, duration: 0.2, wave: 'sawtooth' },
            correct: { type: 'synth', frequency: [523, 659, 784], duration: 0.15, wave: 'sine' },
            wrong: { type: 'synth', frequency: [200, 150], duration: 0.3, wave: 'square' },
            results: { type: 'synth', frequency: [440, 550, 660, 880], duration: 0.2, wave: 'sine' }
        };
    }

    async init() {
        if (this.initialized) return;

        try {
            // Check settings
            const response = await fetch('/api/settings');
            const settings = await response.json();

            const soundSetting = settings.find(s => s.key === 'sound_enabled');
            this.enabled = soundSetting?.value === '1';

            this.initialized = true;
            console.log('[SOUND] Sound manager initialized, enabled:', this.enabled);
        } catch (error) {
            console.error('[SOUND] Init error:', error);
            this.enabled = true; // Default to enabled
        }
    }

    createAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        return this.audioContext;
    }

    async play(soundName) {
        if (!this.enabled) return;

        const config = this.soundConfigs[soundName];
        if (!config) {
            console.warn('[SOUND] Unknown sound:', soundName);
            return;
        }

        try {
            const ctx = this.createAudioContext();

            // Resume audio context if suspended (for browser autoplay policy)
            if (ctx.state === 'suspended') {
                await ctx.resume();
            }

            if (config.type === 'synth') {
                this.playSynth(ctx, config);
            }
        } catch (error) {
            console.error('[SOUND] Play error:', error);
        }
    }

    playSynth(ctx, config) {
        const frequencies = Array.isArray(config.frequency) ? config.frequency : [config.frequency];

        frequencies.forEach((freq, index) => {
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();

            oscillator.type = config.wave || 'sine';
            oscillator.frequency.value = freq;
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);

            const startTime = ctx.currentTime + (index * config.duration);
            const endTime = startTime + config.duration;

            gainNode.gain.setValueAtTime(0.3, startTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, endTime);

            oscillator.start(startTime);
            oscillator.stop(endTime + 0.1);
        });
    }

    // Convenience methods
    playQuestionStart() { this.play('questionStart'); }
    playTick() { this.play('tick'); }
    playTimeWarning() { this.play('timeWarning'); }
    playCorrect() { this.play('correct'); }
    playWrong() { this.play('wrong'); }
    playResults() { this.play('results'); }

    setEnabled(enabled) {
        this.enabled = enabled;
    }
}

// Global instance
const soundManager = new SoundManager();

// Initialize on user interaction (required by browsers)
document.addEventListener('click', () => {
    soundManager.init();
}, { once: true });

// Export for use
if (typeof window !== 'undefined') {
    window.soundManager = soundManager;
}
