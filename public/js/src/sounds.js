/**
 * Sound Effects Manager (ES Module)
 */

export class SoundManager {
    constructor() {
        this.enabled = true;
        this.sounds = {};
        this.initialized = false;
        this.audioContext = null;

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
            const response = await fetch('/api/settings');
            const settings = await response.json();

            const soundSetting = settings.find(s => s.key === 'sound_enabled');
            this.enabled = soundSetting?.value === '1';
            this.initialized = true;
        } catch {
            this.enabled = true;
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
        if (!config) return;

        try {
            const ctx = this.createAudioContext();
            if (ctx.state === 'suspended') {
                await ctx.resume();
            }

            if (config.type === 'synth') {
                this.playSynth(ctx, config);
            }
        } catch {
            // audio play error - ignore
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

export const soundManager = new SoundManager();

// Initialize on user interaction (required by browsers)
document.addEventListener('click', () => {
    soundManager.init();
}, { once: true });
