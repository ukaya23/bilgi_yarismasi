/**
 * SQLite Veritabanı Bağlantı Modülü (sql.js ile)
 * Native build gerektirmez, pure JavaScript
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'quiz.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db = null;
let SQL = null;

/**
 * Veritabanını diske kaydet
 */
function saveToFile() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    }
}

/**
 * Veritabanı bağlantısını başlat
 */
async function initialize() {
    SQL = await initSqlJs();

    const isNewDb = !fs.existsSync(DB_PATH);

    if (isNewDb) {
        console.log('Yeni veritabanı oluşturuluyor...');
        db = new SQL.Database();
        const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
        db.run(schema);
        saveToFile();
        console.log('Veritabanı şeması uygulandı.');
    } else {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
        console.log('Mevcut veritabanı yüklendi.');
    }

    // Periyodik kaydetme (her 10 saniyede)
    setInterval(saveToFile, 10000);

    return db;
}

/**
 * Veritabanı bağlantısını al
 */
function getDb() {
    if (!db) {
        throw new Error('Veritabanı henüz başlatılmadı. initialize() çağırın.');
    }
    return db;
}

/**
 * SQL sorgusu çalıştır ve sonuçları nesne dizisi olarak al
 */
function query(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);

    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();

    return results;
}

/**
 * Tek satır dönecek sorgu
 */
function queryOne(sql, params = []) {
    const results = query(sql, params);
    return results.length > 0 ? results[0] : null;
}

/**
 * Insert/Update/Delete çalıştır
 */
function run(sql, params = []) {
    db.run(sql, params);
    saveToFile();
    return {
        lastInsertRowid: db.exec("SELECT last_insert_rowid()")[0]?.values[0][0] || 0,
        changes: db.getRowsModified()
    };
}

// ==================== SORU İŞLEMLERİ ====================

/**
 * Tüm aktif soruları getir
 */
function getAllQuestions() {
    return query(`
        SELECT id, content, media_url, type, options, correct_keys, points, duration, category 
        FROM questions 
        WHERE is_active = 1 
        ORDER BY id
    `);
}

/**
 * Tek soru getir
 */
function getQuestionById(id) {
    return queryOne(`
        SELECT id, content, media_url, type, options, correct_keys, points, duration, category 
        FROM questions 
        WHERE id = ?
    `, [id]);
}

/**
 * Yeni soru ekle
 */
function addQuestion(question) {
    const result = run(`
        INSERT INTO questions (content, media_url, type, options, correct_keys, points, duration, category)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        question.content,
        question.media_url || null,
        question.type,
        JSON.stringify(question.options || []),
        JSON.stringify(question.correct_keys || []),
        question.points || 10,
        question.duration || 30,
        question.category || null
    ]);
    return result.lastInsertRowid;
}

/**
 * Soru güncelle
 */
function updateQuestion(id, question) {
    return run(`
        UPDATE questions 
        SET content = ?, media_url = ?, type = ?, options = ?, correct_keys = ?, 
            points = ?, duration = ?, category = ?
        WHERE id = ?
    `, [
        question.content,
        question.media_url || null,
        question.type,
        JSON.stringify(question.options || []),
        JSON.stringify(question.correct_keys || []),
        question.points || 10,
        question.duration || 30,
        question.category || null,
        id
    ]);
}

/**
 * Soru sil (soft delete)
 */
function deleteQuestion(id) {
    return run('UPDATE questions SET is_active = 0 WHERE id = ?', [id]);
}

// ==================== YARIŞMACI İŞLEMLERİ ====================

/**
 * Tüm yarışmacıları getir
 */
function getAllContestants() {
    return query(`
        SELECT id, name, table_no, total_score, status, socket_id 
        FROM contestants 
        ORDER BY table_no
    `);
}

/**
 * Yarışmacı ekle veya güncelle (masa numarasına göre)
 */
function upsertContestant(name, tableNo) {
    const existing = queryOne('SELECT id FROM contestants WHERE table_no = ?', [tableNo]);

    if (existing) {
        run(`UPDATE contestants SET name = ?, status = 'ONLINE' WHERE table_no = ?`, [name, tableNo]);
        return existing.id;
    } else {
        run(`
            INSERT INTO contestants (name, table_no, status) VALUES (?, ?, 'ONLINE')
        `, [name, tableNo]);
        // sql.js'de last_insert_rowid güvenilir değil, tekrar sorgula
        const newContestant = queryOne('SELECT id FROM contestants WHERE table_no = ?', [tableNo]);
        return newContestant ? newContestant.id : null;
    }
}

/**
 * Yarışmacı socket ID güncelle
 */
function updateContestantSocket(id, socketId) {
    return run(`UPDATE contestants SET socket_id = ?, status = 'ONLINE' WHERE id = ?`, [socketId, id]);
}

/**
 * Yarışmacı durumunu güncelle
 */
function updateContestantStatus(id, status) {
    return run('UPDATE contestants SET status = ? WHERE id = ?', [status, id]);
}

/**
 * Yarışmacı puanını güncelle
 */
function updateContestantScore(id, pointsToAdd) {
    return run(`UPDATE contestants SET total_score = total_score + ? WHERE id = ?`, [pointsToAdd, id]);
}

/**
 * Socket ID ile yarışmacı bul
 */
function getContestantBySocketId(socketId) {
    return queryOne('SELECT * FROM contestants WHERE socket_id = ?', [socketId]);
}

/**
 * Liderlik tablosunu getir
 */
function getLeaderboard() {
    return query(`
        SELECT id, name, table_no, total_score 
        FROM contestants 
        WHERE status != 'DISQUALIFIED'
        ORDER BY total_score DESC, name ASC
    `);
}

/**
 * Tüm yarışmacıları sil (reset için)
 */
function resetAllContestants() {
    // Önce cevapları sil
    run('DELETE FROM answers');
    // Sonra yarışmacıları sil
    return run('DELETE FROM contestants');
}

// ==================== CEVAP İŞLEMLERİ ====================

/**
 * Cevap kaydet
 */
function saveAnswer(questionId, contestantId, answerText, timeRemaining) {
    // Aynı soru için varolan cevabı kontrol et
    const existing = queryOne(`
        SELECT id FROM answers WHERE question_id = ? AND contestant_id = ?
    `, [questionId, contestantId]);

    if (existing) {
        return { success: false, message: 'Bu soru için zaten cevap verilmiş' };
    }

    const result = run(`
        INSERT INTO answers (question_id, contestant_id, answer_text, time_remaining)
        VALUES (?, ?, ?, ?)
    `, [questionId, contestantId, answerText, timeRemaining]);

    return { success: true, id: result.lastInsertRowid };
}

/**
 * Bir soruya verilen tüm cevapları getir
 */
function getAnswersForQuestion(questionId) {
    return query(`
        SELECT a.id, a.answer_text, a.is_correct, a.points_awarded, a.time_remaining,
               c.id as contestant_id, c.name, c.table_no
        FROM answers a
        JOIN contestants c ON a.contestant_id = c.id
        WHERE a.question_id = ?
        ORDER BY a.submit_time ASC
    `, [questionId]);
}

/**
 * Cevabı puanla
 */
function gradeAnswer(answerId, isCorrect, points) {
    run(`UPDATE answers SET is_correct = ?, points_awarded = ? WHERE id = ?`,
        [isCorrect ? 1 : 0, points, answerId]);

    // Yarışmacı puanını güncelle
    const answer = queryOne('SELECT contestant_id FROM answers WHERE id = ?', [answerId]);
    if (answer && points > 0) {
        updateContestantScore(answer.contestant_id, points);
    }
}

/**
 * Toplu cevap puanla
 */
function gradeAnswersBulk(answerIds, isCorrect, points) {
    for (const id of answerIds) {
        run(`UPDATE answers SET is_correct = ?, points_awarded = ? WHERE id = ?`,
            [isCorrect ? 1 : 0, points, id]);

        if (points > 0) {
            const answer = queryOne('SELECT contestant_id FROM answers WHERE id = ?', [id]);
            if (answer) {
                updateContestantScore(answer.contestant_id, points);
            }
        }
    }
}

// ==================== ÖZLÜ SÖZ İŞLEMLERİ ====================

/**
 * Rastgele özlü söz getir
 */
function getRandomQuote() {
    return queryOne('SELECT * FROM quotes ORDER BY RANDOM() LIMIT 1');
}

/**
 * Tüm özlü sözleri getir
 */
function getAllQuotes() {
    return query('SELECT * FROM quotes ORDER BY id');
}

// ==================== OYUN OTURUMU İŞLEMLERİ ====================

/**
 * Aktif oturumu getir veya oluştur
 */
function getOrCreateSession() {
    let session = queryOne('SELECT * FROM game_sessions ORDER BY id DESC LIMIT 1');

    if (!session) {
        const result = run('INSERT INTO game_sessions (state) VALUES ("IDLE")');
        session = queryOne('SELECT * FROM game_sessions WHERE id = ?', [result.lastInsertRowid]);
    }

    return session;
}

/**
 * Oturum durumunu güncelle
 */
function updateSessionState(state, questionId = null) {
    const session = getOrCreateSession();

    if (questionId !== null) {
        run(`
            UPDATE game_sessions 
            SET state = ?, current_question_id = ?, question_start_time = CURRENT_TIMESTAMP 
            WHERE id = ?
        `, [state, questionId, session.id]);
    } else {
        run('UPDATE game_sessions SET state = ? WHERE id = ?', [state, session.id]);
    }
}

/**
 * Veritabanı bağlantısını kapat
 */
function close() {
    if (db) {
        saveToFile();
        db.close();
        db = null;
    }
}

module.exports = {
    initialize,
    getDb,
    close,
    // Sorular
    getAllQuestions,
    getQuestionById,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    // Yarışmacılar
    getAllContestants,
    upsertContestant,
    updateContestantSocket,
    updateContestantStatus,
    updateContestantScore,
    getContestantBySocketId,
    getLeaderboard,
    resetAllContestants,
    // Cevaplar
    saveAnswer,
    getAnswersForQuestion,
    gradeAnswer,
    gradeAnswersBulk,
    // Özlü Sözler
    getRandomQuote,
    getAllQuotes,
    // Oturum
    getOrCreateSession,
    updateSessionState
};
