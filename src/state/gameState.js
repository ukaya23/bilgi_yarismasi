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

const db = require('../../database/db');

class GameState {
    constructor() {
        this.state = 'IDLE';
        this.currentQuestion = null;
        this.questionStartTime = null;
        this.timer = null;
        this.timeRemaining = 0;
        this.answeredPlayers = new Set();
        this.io = null;
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
            state: this.state,
            currentQuestion: this.currentQuestion,
            timeRemaining: this.timeRemaining,
            answeredPlayers: Array.from(this.answeredPlayers)
        };
    }

    /**
     * Durumu değiştir ve tüm istemcilere bildir
     */
    setState(newState) {
        this.state = newState;
        db.updateSessionState(newState, this.currentQuestion?.id || null);

        if (this.io) {
            this.io.emit('GAME_STATE', this.getState());
        }

        console.log(`[STATE] Durum değişti: ${newState}`);
    }

    /**
     * Yeni soru başlat
     */
    startQuestion(questionId) {
        const question = db.getQuestionById(questionId);
        if (!question) {
            throw new Error('Soru bulunamadı');
        }

        // Önceki timer'ı temizle
        if (this.timer) {
            clearInterval(this.timer);
        }

        // Sorunun sırasını ve toplam soru sayısını bul
        const allQuestions = db.getAllQuestions();
        const questionIndex = allQuestions.findIndex(q => q.id === question.id) + 1;
        const totalQuestions = allQuestions.length;

        this.currentQuestion = {
            ...question,
            options: question.options ? JSON.parse(question.options) : null,
            correct_keys: question.correct_keys ? JSON.parse(question.correct_keys) : [],
            index: questionIndex,
            total: totalQuestions
        };
        this.questionStartTime = Date.now();
        this.timeRemaining = question.duration;
        this.answeredPlayers.clear();

        this.setState('QUESTION_ACTIVE');

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
            const quote = db.getRandomQuote();
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
        this.timer = setInterval(() => {
            this.timeRemaining--;

            if (this.io) {
                this.io.emit('TIME_SYNC', {
                    timeRemaining: this.timeRemaining,
                    serverTime: Date.now()
                });
            }

            if (this.timeRemaining <= 0) {
                this.lockQuestion();
            }
        }, 1000);
    }

    /**
     * Soruyu kilitle (süre doldu)
     */
    lockQuestion() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        this.setState('LOCKED');

        // Açık uçlu soruysa jüri değerlendirmesine geç
        if (this.currentQuestion && this.currentQuestion.type === 'OPEN_ENDED') {
            setTimeout(() => {
                this.startGrading();
            }, 1000);
        } else {
            // Çoktan seçmeli ise otomatik puanla ve sonuçları göster
            this.autoGradeMultipleChoice();
        }
    }

    /**
     * Çoktan seçmeli soruyu otomatik puanla
     */
    autoGradeMultipleChoice() {
        if (!this.currentQuestion) return;

        // 1. Önce cevap vermeyenler için boş cevap oluştur
        const existingAnswers = db.getAnswersForQuestion(this.currentQuestion.id);
        const allContestants = db.getAllContestants();
        const answeredContestantIds = new Set(existingAnswers.map(a => a.contestant_id));

        for (const contestant of allContestants) {
            if (!answeredContestantIds.has(contestant.id) && contestant.status !== 'OFFLINE') {
                db.saveAnswer(
                    this.currentQuestion.id,
                    contestant.id,
                    '', // Boş cevap
                    0   // Süre bitti
                );
            }
        }

        // 2. Güncel cevap listesini al ve puanla
        const answers = db.getAnswersForQuestion(this.currentQuestion.id);
        const correctKeys = this.currentQuestion.correct_keys;

        for (const answer of answers) {
            // Boş cevaplar zaten yanlış sayılacak
            if (!answer.answer_text) {
                db.gradeAnswer(answer.id, false, 0);
                continue;
            }

            const isCorrect = correctKeys.includes(answer.answer_text);
            const points = isCorrect ? this.currentQuestion.points : 0;
            db.gradeAnswer(answer.id, isCorrect, points);
        }

        setTimeout(() => {
            this.showResults();
        }, 500);
    }

    /**
     * Jüri değerlendirmesini başlat
     */
    startGrading() {
        this.setState('GRADING');

        if (!this.currentQuestion || !this.io) return;

        // Cevapları ve tüm yarışmacıları al
        let answers = db.getAnswersForQuestion(this.currentQuestion.id);
        const allContestants = db.getAllContestants();

        // Cevap vermeyenleri bul ve boş cevap olarak ekle
        const answeredContestantIds = new Set(answers.map(a => a.contestant_id));

        // Cevap vermeyenler için boş cevap kaydı oluştur
        for (const contestant of allContestants) {
            if (!answeredContestantIds.has(contestant.id) && contestant.status !== 'OFFLINE') {
                db.saveAnswer(
                    this.currentQuestion.id,
                    contestant.id,
                    '', // Boş cevap metni
                    0   // Süre bitti
                );
            }
        }

        // 4. Cevapları tekrar çek (yeni eklenenler dahil)
        answers = db.getAnswersForQuestion(this.currentQuestion.id);

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
    submitAnswer(contestantId, answerText, timeRemaining) {
        if (this.state !== 'QUESTION_ACTIVE') {
            return { success: false, message: 'Cevap kabul edilmiyor' };
        }

        if (!this.currentQuestion) {
            return { success: false, message: 'Aktif soru yok' };
        }

        if (this.answeredPlayers.has(contestantId)) {
            return { success: false, message: 'Zaten cevap verildi' };
        }

        const result = db.saveAnswer(
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
    applyJuryGrades(grades) {
        // grades: [{ answerId, isCorrect, points }, ...]
        for (const grade of grades) {
            db.gradeAnswer(grade.answerId, grade.isCorrect, grade.points);
        }
    }

    /**
     * Sonuçları göster
     */
    showResults() {
        this.setState('REVEAL');

        if (!this.currentQuestion || !this.io) return;

        const answers = db.getAnswersForQuestion(this.currentQuestion.id);
        const leaderboard = db.getLeaderboard();

        // Tüm ekranlara sonuçları gönder
        this.io.emit('SHOW_RESULTS', {
            question: {
                content: this.currentQuestion.content,
                correctAnswer: this.currentQuestion.correct_keys[0] || '',
                points: this.currentQuestion.points,
                media_url: this.currentQuestion.media_url // Resim URL'ini ekle
            },
            answers: answers,
            leaderboard: leaderboard
        });
    }

    /**
     * Bekleme moduna dön
     */
    goToIdle() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        this.currentQuestion = null;
        this.questionStartTime = null;
        this.timeRemaining = 0;
        this.answeredPlayers.clear();

        this.setState('IDLE');
    }

    /**
     * Oyunu sıfırla
     */
    resetGame() {
        this.goToIdle();
        db.resetAllContestants();

        if (this.io) {
            this.io.emit('GAME_RESET');
            // Sıfırlama sonrası güncel yarışmacı listesi ve liderlik tablosunu gönder
            const updatedContestants = db.getAllContestants();
            const updatedLeaderboard = db.getLeaderboard();
            this.io.emit('CONTESTANTS_UPDATED', updatedContestants);
            this.io.emit('LEADERBOARD_UPDATED', updatedLeaderboard);
        }

        console.log('[STATE] Oyun sıfırlandı');
    }
}

// Singleton instance
const gameState = new GameState();

module.exports = gameState;
