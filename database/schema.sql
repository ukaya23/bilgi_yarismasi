-- Bilgi Yarışması Veritabanı Şeması
-- SQLite

-- Sorular Tablosu
CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    media_url TEXT,
    type TEXT NOT NULL CHECK(type IN ('MULTIPLE_CHOICE', 'OPEN_ENDED')),
    options TEXT, -- JSON array for multiple choice options
    correct_keys TEXT, -- JSON array of correct answers for auto-grouping
    points INTEGER NOT NULL DEFAULT 10,
    duration INTEGER NOT NULL DEFAULT 30,
    category TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Yarışmacılar Tablosu
CREATE TABLE IF NOT EXISTS contestants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    table_no INTEGER NOT NULL,
    total_score INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'OFFLINE' CHECK(status IN ('ONLINE', 'OFFLINE', 'DISQUALIFIED')),
    socket_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Cevaplar Tablosu
CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL,
    contestant_id INTEGER NOT NULL,
    answer_text TEXT,
    is_correct INTEGER, -- NULL: beklemede, 0: yanlış, 1: doğru
    points_awarded INTEGER DEFAULT 0,
    submit_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    time_remaining INTEGER, -- Kalan süre (saniye)
    FOREIGN KEY (question_id) REFERENCES questions(id),
    FOREIGN KEY (contestant_id) REFERENCES contestants(id)
);

-- Özlü Sözler Tablosu (Seyirci Ekranı İçin)
CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    author TEXT NOT NULL
);

-- Oyun Oturumları Tablosu
CREATE TABLE IF NOT EXISTS game_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    current_question_id INTEGER,
    state TEXT NOT NULL DEFAULT 'IDLE' CHECK(state IN ('IDLE', 'QUESTION_ACTIVE', 'LOCKED', 'GRADING', 'REVEAL')),
    question_start_time DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (current_question_id) REFERENCES questions(id)
);

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id);
CREATE INDEX IF NOT EXISTS idx_answers_contestant ON answers(contestant_id);
CREATE INDEX IF NOT EXISTS idx_contestants_status ON contestants(status);

-- Örnek Veriler
INSERT INTO quotes (text, author) VALUES 
    ('Bilgi güçtür.', 'Francis Bacon'),
    ('Öğrenmenin sınırı yoktur.', 'Konfüçyüs'),
    ('Başarı, hazırlık ile fırsatın buluşmasıdır.', 'Seneca'),
    ('Bilgelik, deneyimin kızıdır.', 'Leonardo da Vinci'),
    ('Bir kitap, bin öğretmene bedeldir.', 'Anonim');

-- Örnek Sorular
INSERT INTO questions (content, type, options, correct_keys, points, duration, category) VALUES 
    ('İstanbul''un fethi hangi yılda gerçekleşmiştir?', 'MULTIPLE_CHOICE', 
     '["1453", "1461", "1299", "1071"]', '["1453"]', 10, 30, 'Tarih'),
    ('Türkiye''nin başkenti neresidir?', 'OPEN_ENDED', 
     NULL, '["Ankara", "ankara", "ANKARA"]', 10, 20, 'Coğrafya'),
    ('Hangisi bir programlama dilidir?', 'MULTIPLE_CHOICE', 
     '["Python", "HTML", "CSS", "SQL"]', '["Python"]', 15, 25, 'Teknoloji'),
    ('Dünyanın en uzun nehri hangisidir?', 'OPEN_ENDED', 
     NULL, '["Nil", "nil", "NİL", "Nil Nehri"]', 10, 30, 'Coğrafya'),
    ('E=mc² formülü kime aittir?', 'MULTIPLE_CHOICE', 
     '["Albert Einstein", "Isaac Newton", "Nikola Tesla", "Marie Curie"]', '["Albert Einstein"]', 10, 20, 'Bilim');

-- ============================================================
-- GÜVENLİK VE YÖNETİM TABLOLARI
-- ============================================================

-- Admin Kullanıcıları Tablosu
CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Yarışmalar Tablosu
CREATE TABLE IF NOT EXISTS competitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contestant_count INTEGER NOT NULL DEFAULT 8,
    jury_count INTEGER NOT NULL DEFAULT 2,
    status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Erişim Kodları Tablosu (6 haneli)
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
);

-- Uygulama Ayarları Tablosu
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT
);

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_access_codes_code ON access_codes(code);
CREATE INDEX IF NOT EXISTS idx_access_codes_competition ON access_codes(competition_id);

-- Varsayılan Ayarlar
INSERT OR IGNORE INTO settings (key, value, description) VALUES 
    ('idle_quote_interval', '8', 'Bekleme ekranında alıntı değişim süresi (saniye)'),
    ('question_warning_time', '10', 'Süre uyarısı başlangıcı (saniye kala)'),
    ('result_display_duration', '15', 'Sonuç ekranı gösterim süresi (saniye)'),
    ('sound_enabled', '1', 'Ses efektleri açık/kapalı'),
    ('tick_sound_start', '10', 'Tik sesi başlangıcı (saniye kala)');
