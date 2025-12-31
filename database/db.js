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

// ==================== ADMIN İŞLEMLERİ ====================

/**
 * Admin kullanıcı doğrulama
 */
async function authenticateAdmin(username, password) {
    const bcrypt = require('bcryptjs');
    const admin = queryOne('SELECT * FROM admin_users WHERE username = ?', [username]);

    if (!admin) {
        return null;
    }

    const isValid = await bcrypt.compare(password, admin.password_hash);
    return isValid ? admin : null;
}

/**
 * Admin kullanıcı oluştur
 */
async function createAdminUser(username, password) {
    const bcrypt = require('bcryptjs');
    const existing = queryOne('SELECT id FROM admin_users WHERE username = ?', [username]);

    if (existing) {
        return { success: false, message: 'Bu kullanıcı adı zaten mevcut' };
    }

    const hash = await bcrypt.hash(password, 10);
    const result = run('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', [username, hash]);

    return { success: true, id: result.lastInsertRowid };
}

/**
 * Varsayılan admin kullanıcısını oluştur (yoksa)
 */
async function ensureDefaultAdmin() {
    const bcrypt = require('bcryptjs');
    const admin = queryOne('SELECT id FROM admin_users WHERE username = ?', ['admin']);

    if (!admin) {
        const hash = await bcrypt.hash('admin123', 10);
        run('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', ['admin', hash]);
        console.log('Varsayılan admin kullanıcısı oluşturuldu: admin / admin123');
    }
}

// ==================== YARIŞMA İŞLEMLERİ ====================

/**
 * Yarışma oluştur
 */
function createCompetition(name, contestantCount, juryCount) {
    run(`
        INSERT INTO competitions (name, contestant_count, jury_count) 
        VALUES (?, ?, ?)
    `, [name, contestantCount, juryCount]);

    // sql.js'de lastInsertRowid güvenilir değil, doğrudan sorgula
    const competition = queryOne('SELECT id FROM competitions WHERE name = ? ORDER BY id DESC LIMIT 1', [name]);
    return competition ? competition.id : 0;
}

/**
 * Tüm yarışmaları getir
 */
function getAllCompetitions() {
    return query('SELECT * FROM competitions ORDER BY created_at DESC');
}

/**
 * Aktif yarışmayı getir
 */
function getActiveCompetition() {
    return queryOne('SELECT * FROM competitions WHERE status = "ACTIVE" ORDER BY created_at DESC LIMIT 1');
}

/**
 * Yarışma durumunu güncelle
 */
function updateCompetitionStatus(id, status) {
    return run('UPDATE competitions SET status = ? WHERE id = ?', [status, id]);
}

// ==================== ERİŞİM KODU İŞLEMLERİ ====================

/**
 * 6 haneli benzersiz kod üret
 */
function generateUniqueCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Karıştırılabilir karakterler çıkarıldı (0,O,1,I)
    let code;
    let attempts = 0;

    do {
        code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        attempts++;
    } while (queryOne('SELECT id FROM access_codes WHERE code = ?', [code]) && attempts < 100);

    return code;
}

/**
 * Yarışma için erişim kodları oluştur
 */
function generateAccessCodes(competitionId, contestantCount, juryCount) {
    const codes = [];

    // Yarışmacı kodları
    for (let i = 1; i <= contestantCount; i++) {
        const code = generateUniqueCode();
        run(`
            INSERT INTO access_codes (competition_id, code, role, name, slot_number) 
            VALUES (?, ?, 'CONTESTANT', ?, ?)
        `, [competitionId, code, `Yarışmacı ${i}`, i]);
        codes.push({ code, role: 'CONTESTANT', slot: i, name: `Yarışmacı ${i}` });
    }

    // Jüri kodları
    for (let i = 1; i <= juryCount; i++) {
        const code = generateUniqueCode();
        run(`
            INSERT INTO access_codes (competition_id, code, role, name, slot_number) 
            VALUES (?, ?, 'JURY', ?, ?)
        `, [competitionId, code, `Jüri ${i}`, i]);
        codes.push({ code, role: 'JURY', slot: i, name: `Jüri ${i}` });
    }

    return codes;
}

/**
 * Erişim kodunu doğrula
 */
function validateAccessCode(code) {
    const accessCode = queryOne(`
        SELECT ac.*, c.name as competition_name, c.status as competition_status
        FROM access_codes ac
        JOIN competitions c ON ac.competition_id = c.id
        WHERE ac.code = ? AND c.status = 'ACTIVE'
    `, [code.toUpperCase()]);

    if (!accessCode) {
        return { valid: false, message: 'Geçersiz veya kullanılmış kod' };
    }

    return { valid: true, accessCode };
}

/**
 * Erişim kodunu kullanıldı olarak işaretle
 */
function markCodeAsUsed(codeId, sessionToken) {
    return run(`
        UPDATE access_codes 
        SET is_used = 1, session_token = ?, used_at = CURRENT_TIMESTAMP 
        WHERE id = ?
    `, [sessionToken, codeId]);
}

/**
 * Session token ile erişim kodunu doğrula
 */
function validateSessionToken(token) {
    return queryOne(`
        SELECT ac.*, c.name as competition_name
        FROM access_codes ac
        JOIN competitions c ON ac.competition_id = c.id
        WHERE ac.session_token = ? AND c.status = 'ACTIVE'
    `, [token]);
}

/**
 * Yarışmaya ait kodları getir
 */
function getAccessCodesByCompetition(competitionId) {
    return query(`
        SELECT * FROM access_codes 
        WHERE competition_id = ? 
        ORDER BY role, slot_number
    `, [competitionId]);
}

/**
 * Erişim kodu ismini güncelle
 */
function updateAccessCodeName(codeId, name) {
    return run('UPDATE access_codes SET name = ? WHERE id = ?', [name, codeId]);
}

/**
 * Erişim kodunu sıfırla (yeni giriş için)
 */
function resetAccessCode(codeId) {
    return run(`
        UPDATE access_codes 
        SET is_used = 0, session_token = NULL, used_at = NULL 
        WHERE id = ?
    `, [codeId]);
}

// ==================== AYAR İŞLEMLERİ ====================

/**
 * Ayar değerini getir
 */
function getSetting(key) {
    const setting = queryOne('SELECT value FROM settings WHERE key = ?', [key]);
    return setting ? setting.value : null;
}

/**
 * Ayar değerini güncelle
 */
function setSetting(key, value) {
    const existing = queryOne('SELECT id FROM settings WHERE key = ?', [key]);

    if (existing) {
        return run('UPDATE settings SET value = ? WHERE key = ?', [value, key]);
    } else {
        return run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
    }
}

/**
 * Tüm ayarları getir
 */
function getAllSettings() {
    return query('SELECT * FROM settings ORDER BY key');
}

/**
 * Yeni tabloları oluştur (migration)
 */
function runMigrations() {
    // Admin tablosu
    db.run(`
        CREATE TABLE IF NOT EXISTS admin_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Yarışmalar tablosu
    db.run(`
        CREATE TABLE IF NOT EXISTS competitions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            contestant_count INTEGER NOT NULL DEFAULT 8,
            jury_count INTEGER NOT NULL DEFAULT 2,
            status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Erişim kodları tablosu
    db.run(`
        CREATE TABLE IF NOT EXISTS access_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            competition_id INTEGER NOT NULL,
            code TEXT NOT NULL UNIQUE,
            role TEXT NOT NULL CHECK(role IN ('CONTESTANT', 'JURY')),
            name TEXT NOT NULL DEFAULT 'İsimsiz',
            slot_number INTEGER NOT NULL,
            is_used INTEGER DEFAULT 0,
            session_token TEXT,
            used_at DATETIME,
            FOREIGN KEY (competition_id) REFERENCES competitions(id)
        )
    `);

    // Ayarlar tablosu
    db.run(`
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT NOT NULL UNIQUE,
            value TEXT NOT NULL,
            description TEXT
        )
    `);

    // Varsayılan ayarlar
    const defaultSettings = [
        ['idle_quote_interval', '8', 'Bekleme ekranında alıntı değişim süresi (saniye)'],
        ['question_warning_time', '10', 'Süre uyarısı başlangıcı (saniye kala)'],
        ['result_display_duration', '15', 'Sonuç ekranı gösterim süresi (saniye)'],
        ['sound_enabled', '1', 'Ses efektleri açık/kapalı'],
        ['tick_sound_start', '10', 'Tik sesi başlangıcı (saniye kala)']
    ];

    for (const [key, value, desc] of defaultSettings) {
        const existing = queryOne('SELECT id FROM settings WHERE key = ?', [key]);
        if (!existing) {
            run('INSERT INTO settings (key, value, description) VALUES (?, ?, ?)', [key, value, desc]);
        }
    }

    saveToFile();
    console.log('Veritabanı migrasyonları tamamlandı.');
}

module.exports = {
    initialize,
    getDb,
    close,
    runMigrations,
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
    updateSessionState,
    // Admin
    authenticateAdmin,
    createAdminUser,
    ensureDefaultAdmin,
    // Yarışmalar
    createCompetition,
    getAllCompetitions,
    getActiveCompetition,
    updateCompetitionStatus,
    // Erişim Kodları
    generateAccessCodes,
    validateAccessCode,
    markCodeAsUsed,
    validateSessionToken,
    getAccessCodesByCompetition,
    updateAccessCodeName,
    resetAccessCode,
    // Ayarlar
    getSetting,
    setSetting,
    getAllSettings
};
