/**
 * Oyun Durumu Yonetimi (State Machine)
 *
 * Durumlar:
 * - IDLE: Bekleme modu
 * - QUESTION_ACTIVE: Soru yayinda, cevaplar kabul ediliyor
 * - LOCKED: Sure doldu, cevaplar kilitli
 * - GRADING: Juri degerlendirmesi (acik uclu sorular icin)
 * - REVEAL: Sonuc gosterimi
 *
 * Sorumluluklar dagitimi:
 * - GameTimer: Zamanlayici yonetimi (gameTimer.js)
 * - GradingService: Puanlama ve cevap gruplama (gradingService.js)
 * - RevealManager: Sonuc gosterim adimlari (revealManager.js)
 * - GameState: State machine, orkestrasyon, cevap gonderimi
 */

const db = require('../../database/postgres');
const log = require('../utils/logger');
const { GameTimer } = require('./gameTimer');
const gradingService = require('./gradingService');
const { RevealManager } = require('./revealManager');

class GameState {
    constructor(competitionId = 1) {
        this.competitionId = competitionId;
        this.state = 'IDLE';
        this.currentQuestion = null;
        this.questionStartTime = null;
        this.questions = [];
        this.answeredPlayers = new Set();
        this.io = null;

        // Composition
        this.gameTimer = new GameTimer();
        this.revealManager = new RevealManager();
    }

    /**
     * Socket.io referansini ayarla
     */
    setIO(io) {
        this.io = io;
    }

    /**
     * timeRemaining getter - GameTimer'a delege eder
     */
    get timeRemaining() {
        return this.gameTimer.timeRemaining;
    }

    /**
     * Mevcut durumu getir
     */
    getState() {
        return {
            competitionId: this.competitionId,
            state: this.state,
            currentQuestion: this.currentQuestion,
            timeRemaining: this.gameTimer.timeRemaining,
            answeredPlayers: Array.from(this.answeredPlayers)
        };
    }

    /**
     * Durumu degistir ve tum istemcilere bildir
     */
    async setState(newState) {
        const validTransitions = {
            'IDLE': ['QUESTION_ACTIVE'],
            'QUESTION_ACTIVE': ['LOCKED'],
            'LOCKED': ['GRADING', 'REVEAL'],
            'GRADING': ['REVEAL'],
            'REVEAL': ['IDLE', 'QUESTION_ACTIVE']
        };

        const allowed = validTransitions[this.state];
        if (allowed && !allowed.includes(newState)) {
            log.warn({ from: this.state, to: newState }, 'Gecersiz state gecisi');
        }

        this.state = newState;
        await db.updateSessionState(newState, this.currentQuestion?.id || null);

        if (this.io) {
            this.io.emit('GAME_STATE', this.getState());
        }

        log.info({ state: newState }, 'Durum degisti');
    }

    /**
     * Yeni soru baslat
     */
    async startQuestion(questionId) {
        const question = await db.getQuestionById(questionId);
        if (!question) {
            throw new Error('Soru bulunamadi');
        }

        // Onceki timer'i temizle
        this.gameTimer.stop();

        // Sorunun sirasini ve toplam soru sayisini bul
        const allQuestions = await db.getAllQuestions();
        const questionIndex = allQuestions.findIndex(q => q.id === question.id) + 1;
        const totalQuestions = allQuestions.length;

        this.currentQuestion = {
            ...question,
            options: question.options || null,
            correct_keys: question.correct_keys || [],
            index: questionIndex,
            total: totalQuestions
        };
        this.questionStartTime = Date.now();
        this.answeredPlayers.clear();

        await this.setState('QUESTION_ACTIVE');

        // Yarismacilara ve juriye soruyu gonder
        if (this.io) {
            this.io.to('player').emit('NEW_QUESTION', {
                id: this.currentQuestion.id,
                content: this.currentQuestion.content,
                type: this.currentQuestion.type,
                options: this.currentQuestion.options,
                points: this.currentQuestion.points,
                duration: this.currentQuestion.duration,
                media_url: this.currentQuestion.media_url,
                index: questionIndex,
                total: totalQuestions
            });

            this.io.to('jury').emit('NEW_QUESTION', {
                id: this.currentQuestion.id,
                content: this.currentQuestion.content,
                type: this.currentQuestion.type,
                options: this.currentQuestion.options,
                correct_keys: this.currentQuestion.correct_keys,
                points: this.currentQuestion.points,
                duration: this.currentQuestion.duration,
                index: questionIndex,
                total: totalQuestions
            });

            // Seyirciye maskelenmis soru gonder
            const quote = await db.getRandomQuote();
            this.io.to('screen').emit('MASKED_QUESTION', {
                category: this.currentQuestion.category || 'Genel Kultur',
                points: this.currentQuestion.points,
                duration: this.currentQuestion.duration,
                quote: quote,
                index: questionIndex,
                total: totalQuestions,
                media_url: this.currentQuestion.media_url
            });
        }

        // Zamanlayiciyi baslat
        this.gameTimer.start(
            question.duration,
            (timeRemaining) => {
                if (this.io) {
                    this.io.emit('TIME_SYNC', {
                        timeRemaining,
                        serverTime: Date.now()
                    });
                }
            },
            () => this.lockQuestion()
        );
    }

    /**
     * Soruyu kilitle (sure doldu)
     */
    async lockQuestion() {
        this.gameTimer.clear();

        await this.setState('LOCKED');

        // Acik uclu soruysa juri degerlendirmesine gec
        if (this.currentQuestion && this.currentQuestion.type === 'OPEN_ENDED') {
            setTimeout(async () => {
                await this.startGrading();
            }, 1000);
        } else {
            // Coktan secmeli ise otomatik puanla
            await gradingService.autoGradeMultipleChoice(
                this.currentQuestion.id,
                this.competitionId,
                this.currentQuestion.correct_keys,
                this.currentQuestion.points
            );

            setTimeout(async () => {
                await this.showResults();
            }, 500);
        }
    }

    /**
     * Juri degerlendirmesini baslat
     */
    async startGrading() {
        await this.setState('GRADING');

        if (!this.currentQuestion || !this.io) return;

        const reviewData = await gradingService.prepareJuryReview(
            this.currentQuestion.id,
            this.competitionId,
            this.currentQuestion.content,
            this.currentQuestion.correct_keys,
            this.currentQuestion.points
        );

        this.io.to('jury').emit('JURY_REVIEW_DATA', reviewData);

        this.io.to('screen').emit('GRADING_STATUS', {
            message: 'Juri Degerlendirmesi Suruyor...'
        });
    }

    /**
     * Cevap gonderimini isle
     */
    async submitAnswer(contestantId, answerText, timeRemaining) {
        if (this.state !== 'QUESTION_ACTIVE') {
            return { success: false, message: 'Cevap kabul edilmiyor' };
        }

        if (!this.currentQuestion) {
            return { success: false, message: 'Aktif soru yok' };
        }

        if (this.answeredPlayers.has(contestantId)) {
            return { success: false, message: 'Zaten cevap verildi' };
        }

        const result = await db.saveAnswer(
            this.currentQuestion.id,
            contestantId,
            answerText,
            timeRemaining || this.gameTimer.timeRemaining
        );

        if (result.success) {
            this.answeredPlayers.add(contestantId);

            if (this.io) {
                this.io.emit('PLAYER_STATUS_UPDATE', {
                    contestantId,
                    status: 'answered'
                });
            }
        }

        return result;
    }

    /**
     * Juri puanlamasini uygula
     */
    async applyJuryGrades(grades) {
        for (const grade of grades) {
            await db.gradeAnswer(grade.answerId, grade.isCorrect, grade.points);
        }
    }

    /**
     * Sonuclari goster
     */
    async showResults() {
        await this.setState('REVEAL');
        this.revealManager.reset();

        if (!this.currentQuestion || !this.io) return;

        const answers = await db.getAnswersForQuestion(this.currentQuestion.id, this.competitionId);
        const leaderboard = await db.getLeaderboard(this.competitionId);
        const controlMode = await db.getSetting('screen_control_mode') || 'AUTO';

        this.io.emit('SHOW_RESULTS', {
            question: {
                content: this.currentQuestion.content,
                correctAnswer: this.currentQuestion.correct_keys[0] || '',
                points: this.currentQuestion.points,
                media_url: this.currentQuestion.media_url
            },
            answers: answers,
            leaderboard: leaderboard,
            mode: controlMode
        });

        if (controlMode === 'MANUAL') {
            this.revealManager.notifyAdmin(this.io, 0);
        }
    }

    /**
     * Manuel modda bir sonraki adima gec
     */
    nextRevealStep() {
        if (this.state !== 'REVEAL') return;
        this.revealManager.nextStep(this.io);
    }

    /**
     * Bekleme moduna don
     */
    async goToIdle() {
        this.gameTimer.stop();

        this.currentQuestion = null;
        this.questionStartTime = null;
        this.answeredPlayers.clear();

        await this.setState('IDLE');
    }

    /**
     * Zamanlayiciyi durdur (CompetitionManager cleanup icin)
     */
    stopTimer() {
        this.gameTimer.stop();
    }

    /**
     * Oyunu sifirla
     */
    async resetGame() {
        await this.goToIdle();
        await db.resetAllContestants(this.competitionId);

        if (this.io) {
            this.io.emit('GAME_RESET');
            const updatedContestants = await db.getAllContestants(this.competitionId);
            const updatedLeaderboard = await db.getLeaderboard(this.competitionId);
            this.io.emit('CONTESTANTS_UPDATED', updatedContestants);
            this.io.emit('LEADERBOARD_UPDATED', updatedLeaderboard);
        }

        log.info({ competitionId: this.competitionId }, 'Oyun sifirlandi');
    }
}

module.exports = { GameState };
