/**
 * Oyun Durumu Yönetimi (State Machine)
 * 
 * Durumlar:
 * - IDLE: Bekleme modu
 * - QUESTION_ACTIVE: Soru yayında, cevaplar kabul ediliyor
 * - LOCKED: Süre doldu, cevaplar kilitli
 * - GRADING: Jüri değerlendirmesi (açık uçlu sorular için)
 * - REVEAL: Sonuç gösterimi
 */

const db = require('../../database/postgres');

class GameState {
    constructor(competitionId = 1) {
        this.competitionId = competitionId;
        this.state = 'IDLE';
        this.currentQuestion = null;
        this.questionStartTime = null;
        this.timer = null;
        this.timeRemaining = 0;
        this.questions = [];
        this.answeredPlayers = new Set();
        this.currentRevealStep = 0; // Reveal adımı
        this.io = null;

        // Singleton instance'ı sakla (backward compatibility için)
        GameState.instance = this;
    }

    /**
     * Socket.io referansını ayarla
     */
    setIO(io) {
        this.io = io;
    }

    /**
     * Mevcut durumu getir
     */
    getState() {
        return {
            competitionId: this.competitionId,
            state: this.state,
            currentQuestion: this.currentQuestion,
            timeRemaining: this.timeRemaining,
            answeredPlayers: Array.from(this.answeredPlayers)
        };
    }

    /**
     * Durumu değiştir ve tüm istemcilere bildir
     */
    async setState(newState) {
        // Geçerli durum geçişlerini kontrol et
        const validTransitions = {
            'IDLE': ['QUESTION_ACTIVE'],
            'QUESTION_ACTIVE': ['LOCKED'],
            'LOCKED': ['GRADING', 'REVEAL'],
            'GRADING': ['REVEAL'],
            'REVEAL': ['IDLE', 'QUESTION_ACTIVE']
        };

        const allowed = validTransitions[this.state];
        if (allowed && !allowed.includes(newState)) {
            console.warn(`[STATE] Geçersiz geçiş: ${this.state} -> ${newState}`);
            // Uyarı ver ama izin ver (eski davranış korunsun)
        }

        this.state = newState;
        await db.updateSessionState(newState, this.currentQuestion?.id || null);

        if (this.io) {
            this.io.emit('GAME_STATE', this.getState());
        }

        console.log(`[STATE] Durum değişti: ${newState}`);
    }

    /**
     * Yeni soru başlat
     */
    async startQuestion(questionId) {
        const question = await db.getQuestionById(questionId);
        if (!question) {
            throw new Error('Soru bulunamadı');
        }

        // Önceki timer'ı temizle
        if (this.timer) {
            clearInterval(this.timer);
        }

        // Sorunun sırasını ve toplam soru sayısını bul
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
        this.timeRemaining = question.duration;
        this.answeredPlayers.clear();

        await this.setState('QUESTION_ACTIVE');

        // Yarışmacılara ve jüriye soruyu gönder
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

            // Seyirciye maskelenmiş soru gönder
            const quote = await db.getRandomQuote();
            this.io.to('screen').emit('MASKED_QUESTION', {
                category: this.currentQuestion.category || 'Genel Kültür',
                points: this.currentQuestion.points,
                duration: this.currentQuestion.duration,
                quote: quote,
                index: questionIndex,
                total: totalQuestions,
                media_url: this.currentQuestion.media_url // Resim URL'ini ekle
            });
        }

        // Zamanlayıcıyı başlat
        this.startTimer();
    }

    /**
     * Zamanlayıcıyı başlat
     */
    startTimer() {
        this.timer = setInterval(async () => {
            this.timeRemaining--;

            if (this.io) {
                this.io.emit('TIME_SYNC', {
                    timeRemaining: this.timeRemaining,
                    serverTime: Date.now()
                });
            }

            if (this.timeRemaining <= 0) {
                await this.lockQuestion();
            }
        }, 1000);
    }

    /**
     * Soruyu kilitle (süre doldu)
     */
    async lockQuestion() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        await this.setState('LOCKED');

        // Açık uçlu soruysa jüri değerlendirmesine geç
        if (this.currentQuestion && this.currentQuestion.type === 'OPEN_ENDED') {
            setTimeout(async () => {
                await this.startGrading();
            }, 1000);
        } else {
            // Çoktan seçmeli ise otomatik puanla ve sonuçları göster
            await this.autoGradeMultipleChoice();
        }
    }

    /**
     * Çoktan seçmeli soruyu otomatik puanla
     */
    async autoGradeMultipleChoice() {
        if (!this.currentQuestion) return;

        // 1. Önce cevap vermeyenler için boş cevap oluştur
        const existingAnswers = await db.getAnswersForQuestion(this.currentQuestion.id);
        const allContestants = await db.getAllContestants();
        const answeredContestantIds = new Set(existingAnswers.map(a => a.contestant_id));

        for (const contestant of allContestants) {
            if (!answeredContestantIds.has(contestant.id) && contestant.status !== 'OFFLINE') {
                await db.saveAnswer(
                    this.currentQuestion.id,
                    contestant.id,
                    '', // Boş cevap
                    0   // Süre bitti
                );
            }
        }

        // 2. Güncel cevap listesini al ve puanla
        const answers = await db.getAnswersForQuestion(this.currentQuestion.id);
        const correctKeys = this.currentQuestion.correct_keys;

        for (const answer of answers) {
            // Boş cevaplar zaten yanlış sayılacak
            if (!answer.answer_text) {
                await db.gradeAnswer(answer.id, false, 0);
                continue;
            }

            const isCorrect = correctKeys.includes(answer.answer_text);
            const points = isCorrect ? this.currentQuestion.points : 0;
            await db.gradeAnswer(answer.id, isCorrect, points);
        }

        setTimeout(async () => {
            await this.showResults();
        }, 500);
    }

    /**
     * Jüri değerlendirmesini başlat
     */
    async startGrading() {
        await this.setState('GRADING');

        if (!this.currentQuestion || !this.io) return;

        // Cevapları ve tüm yarışmacıları al
        let answers = await db.getAnswersForQuestion(this.currentQuestion.id);
        const allContestants = await db.getAllContestants();

        // Cevap vermeyenleri bul ve boş cevap olarak ekle
        const answeredContestantIds = new Set(answers.map(a => a.contestant_id));

        // Cevap vermeyenler için boş cevap kaydı oluştur
        for (const contestant of allContestants) {
            if (!answeredContestantIds.has(contestant.id) && contestant.status !== 'OFFLINE') {
                await db.saveAnswer(
                    this.currentQuestion.id,
                    contestant.id,
                    '', // Boş cevap metni
                    0   // Süre bitti
                );
            }
        }

        // 4. Cevapları tekrar çek (yeni eklenenler dahil)
        answers = await db.getAnswersForQuestion(this.currentQuestion.id);

        const groupedAnswers = this.groupAnswers(answers);

        this.io.to('jury').emit('JURY_REVIEW_DATA', {
            questionId: this.currentQuestion.id,
            questionContent: this.currentQuestion.content,
            correctKeys: this.currentQuestion.correct_keys,
            points: this.currentQuestion.points,
            groups: groupedAnswers
        });

        // Seyirciye bilgi ver
        this.io.to('screen').emit('GRADING_STATUS', {
            message: 'Jüri Değerlendirmesi Sürüyor...'
        });
    }

    /**
     * Cevapları grupla (benzerlik algoritması)
     */
    groupAnswers(answers) {
        const groups = {
            correct: [],    // Doğru eşleşenler
            incorrect: [],  // Yanlış/Belirsiz
            empty: []       // Boş cevaplar
        };

        const correctKeys = this.currentQuestion?.correct_keys || [];

        for (const answer of answers) {
            if (!answer.answer_text || answer.answer_text.trim() === '') {
                groups.empty.push(answer);
                continue;
            }

            const normalizedAnswer = answer.answer_text.toLowerCase().trim();
            const isMatch = correctKeys.some(key =>
                key.toLowerCase().trim() === normalizedAnswer ||
                this.isSimilar(normalizedAnswer, key.toLowerCase().trim())
            );

            if (isMatch) {
                groups.correct.push(answer);
            } else {
                groups.incorrect.push(answer);
            }
        }

        return groups;
    }

    /**
     * Basit benzerlik kontrolü (Levenshtein mesafesi)
     */
    isSimilar(str1, str2, threshold = 0.8) {
        if (str1 === str2) return true;

        const len1 = str1.length;
        const len2 = str2.length;
        const matrix = [];

        for (let i = 0; i <= len1; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= len2; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );
            }
        }

        const distance = matrix[len1][len2];
        const maxLen = Math.max(len1, len2);
        const similarity = 1 - distance / maxLen;

        return similarity >= threshold;
    }

    /**
     * Cevap gönderimini işle
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
            timeRemaining || this.timeRemaining
        );

        if (result.success) {
            this.answeredPlayers.add(contestantId);

            // Diğer ekranlara bildir
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
     * Jüri puanlamasını uygula
     */
    async applyJuryGrades(grades) {
        // grades: [{ answerId, isCorrect, points }, ...]
        for (const grade of grades) {
            await db.gradeAnswer(grade.answerId, grade.isCorrect, grade.points);
        }
    }

    /**
     * Sonuçları göster
     */
    async showResults() {
        await this.setState('REVEAL');
        this.currentRevealStep = 0; // Adım sayacını sıfırla

        if (!this.currentQuestion || !this.io) return;

        const answers = await db.getAnswersForQuestion(this.currentQuestion.id);
        const leaderboard = await db.getLeaderboard();
        const controlMode = await db.getSetting('screen_control_mode') || 'AUTO';

        // Tüm ekranlara sonuçları gönder (Başlangıç verisi)
        this.io.emit('SHOW_RESULTS', {
            question: {
                content: this.currentQuestion.content,
                correctAnswer: this.currentQuestion.correct_keys[0] || '',
                points: this.currentQuestion.points,
                media_url: this.currentQuestion.media_url
            },
            answers: answers,
            leaderboard: leaderboard,
            mode: controlMode // Mod bilgisini de gönder
        });

        // Eğer mod MANUAL ise, admin'e de güncel adımı bildir
        if (controlMode === 'MANUAL') {
            this.notifyAdminStepUpdate(0);
        }
    }

    /**
     * Manuel modda bir sonraki adıma geç
     */
    nextRevealStep() {
        if (this.state !== 'REVEAL') return;

        this.currentRevealStep++;

        // Ekrana bildir
        this.io.to('screen').emit('SCREEN_STEP_UPDATE', {
            step: this.currentRevealStep
        });

        // Admin'e bildir
        this.notifyAdminStepUpdate(this.currentRevealStep);
    }

    notifyAdminStepUpdate(step) {
        const steps = [
            'Başlangıç',
            'Resim Gösterimi',
            'Soru Gösterimi',
            'Cevaplar',
            'Doğru Cevap',
            'Sıralama',
            'Tam Ekran Sıralama',
            'Tamamlandı'
        ];

        const stepName = steps[step] || 'Bilinmiyor';
        const isFinished = step >= 6; // 6. adım son adım

        this.io.to('admin').emit('ADMIN_REVEAL_STATE', {
            step: step,
            stepName: stepName,
            isFinished: isFinished
        });
    }

    /**
     * Bekleme moduna dön
     */
    async goToIdle() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        this.currentQuestion = null;
        this.questionStartTime = null;
        this.timeRemaining = 0;
        this.answeredPlayers.clear();

        await this.setState('IDLE');
    }

    /**
     * Oyunu sıfırla
     */
    async resetGame() {
        await this.goToIdle();
        await db.resetAllContestants();

        if (this.io) {
            this.io.emit('GAME_RESET');
            // Sıfırlama sonrası güncel yarışmacı listesi ve liderlik tablosunu gönder
            const updatedContestants = await db.getAllContestants();
            const updatedLeaderboard = await db.getLeaderboard();
            this.io.emit('CONTESTANTS_UPDATED', updatedContestants);
            this.io.emit('LEADERBOARD_UPDATED', updatedLeaderboard);
        }

        console.log('[STATE] Oyun sıfırlandı');
    }
}

// Singleton instance for backward compatibility
const gameStateInstance = new GameState();

// Export both the class and singleton instance
module.exports = gameStateInstance;
module.exports.GameState = GameState;
