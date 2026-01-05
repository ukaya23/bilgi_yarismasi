-- Bilgi Yarışması PostgreSQL Schema
-- Migration 001: Initial Schema

-- Sorular Tablosu
CREATE TABLE IF NOT EXISTS questions (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    media_url TEXT,
    type VARCHAR(20) NOT NULL CHECK(type IN ('MULTIPLE_CHOICE', 'OPEN_ENDED')),
    options JSONB,
    correct_keys JSONB,
    points INTEGER NOT NULL DEFAULT 10,
    duration INTEGER NOT NULL DEFAULT 30,
    category VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Yarışmacılar Tablosu
CREATE TABLE IF NOT EXISTS contestants (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    table_no INTEGER NOT NULL,
    total_score INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'OFFLINE' CHECK(status IN ('ONLINE', 'OFFLINE', 'DISQUALIFIED')),
    socket_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cevaplar Tablosu
CREATE TABLE IF NOT EXISTS answers (
    id SERIAL PRIMARY KEY,
    question_id INTEGER NOT NULL,
    contestant_id INTEGER NOT NULL,
    answer_text TEXT,
    is_correct BOOLEAN,
    points_awarded INTEGER DEFAULT 0,
    submit_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    time_remaining INTEGER,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (contestant_id) REFERENCES contestants(id) ON DELETE CASCADE
);

-- Özlü Sözler Tablosu
CREATE TABLE IF NOT EXISTS quotes (
    id SERIAL PRIMARY KEY,
    text TEXT NOT NULL,
    author TEXT NOT NULL
);

-- Oyun Oturumları Tablosu
CREATE TABLE IF NOT EXISTS game_sessions (
    id SERIAL PRIMARY KEY,
    current_question_id INTEGER,
    state VARCHAR(20) NOT NULL DEFAULT 'IDLE' CHECK(state IN ('IDLE', 'QUESTION_ACTIVE', 'LOCKED', 'GRADING', 'REVEAL')),
    question_start_time TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (current_question_id) REFERENCES questions(id) ON DELETE SET NULL
);

-- Admin Kullanıcıları Tablosu
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Yarışmalar Tablosu
CREATE TABLE IF NOT EXISTS competitions (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    contestant_count INTEGER NOT NULL DEFAULT 8,
    jury_count INTEGER NOT NULL DEFAULT 2,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Erişim Kodları Tablosu
CREATE TABLE IF NOT EXISTS access_codes (
    id SERIAL PRIMARY KEY,
    competition_id INTEGER NOT NULL,
    code TEXT NOT NULL UNIQUE,
    role VARCHAR(20) NOT NULL CHECK(role IN ('CONTESTANT', 'JURY')),
    name TEXT NOT NULL DEFAULT 'İsimsiz',
    slot_number INTEGER NOT NULL,
    is_used BOOLEAN DEFAULT false,
    session_token TEXT,
    used_at TIMESTAMP,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
);

-- Uygulama Ayarları Tablosu
CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT
);

-- ============================================================
-- İNDEKSLER
-- ============================================================

-- Questions indexes
CREATE INDEX IF NOT EXISTS idx_questions_active ON questions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category);
CREATE INDEX IF NOT EXISTS idx_questions_type ON questions(type);

-- Answers indexes
CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id);
CREATE INDEX IF NOT EXISTS idx_answers_contestant ON answers(contestant_id);
CREATE INDEX IF NOT EXISTS idx_answers_submit_time ON answers(submit_time);

-- Contestants indexes
CREATE INDEX IF NOT EXISTS idx_contestants_status ON contestants(status);
CREATE INDEX IF NOT EXISTS idx_contestants_score ON contestants(total_score DESC);

-- Access codes indexes
CREATE INDEX IF NOT EXISTS idx_access_codes_code ON access_codes(code);
CREATE INDEX IF NOT EXISTS idx_access_codes_competition ON access_codes(competition_id);

-- ============================================================
-- SEED DATA
-- ============================================================

-- Örnek Özlü Sözler
INSERT INTO quotes (text, author) VALUES
    ('Bilgi güçtür.', 'Francis Bacon'),
    ('Öğrenmenin sınırı yoktur.', 'Konfüçyüs'),
    ('Başarı, hazırlık ile fırsatın buluşmasıdır.', 'Seneca'),
    ('Bilgelik, deneyimin kızıdır.', 'Leonardo da Vinci'),
    ('Bir kitap, bin öğretmene bedeldir.', 'Anonim'),
    ('Eğitim, en güçlü silahtır.', 'Nelson Mandela'),
    ('Hayal kurmayan bir ulus, geleceğini inşa edemez.', 'Mustafa Kemal Atatürk')
ON CONFLICT DO NOTHING;

-- Örnek Sorular
INSERT INTO questions (content, type, options, correct_keys, points, duration, category) VALUES
    ('İstanbul''un fethi hangi yılda gerçekleşmiştir?', 'MULTIPLE_CHOICE',
     '["1453", "1461", "1299", "1071"]'::jsonb, '["1453"]'::jsonb, 10, 30, 'Tarih'),
    ('Türkiye''nin başkenti neresidir?', 'OPEN_ENDED',
     NULL, '["Ankara", "ankara", "ANKARA"]'::jsonb, 10, 20, 'Coğrafya'),
    ('Hangisi bir programlama dilidir?', 'MULTIPLE_CHOICE',
     '["Python", "HTML", "CSS", "SQL"]'::jsonb, '["Python"]'::jsonb, 15, 25, 'Teknoloji'),
    ('Dünyanın en uzun nehri hangisidir?', 'OPEN_ENDED',
     NULL, '["Nil", "nil", "NİL", "Nil Nehri"]'::jsonb, 10, 30, 'Coğrafya'),
    ('E=mc² formülü kime aittir?', 'MULTIPLE_CHOICE',
     '["Albert Einstein", "Isaac Newton", "Nikola Tesla", "Marie Curie"]'::jsonb, '["Albert Einstein"]'::jsonb, 10, 20, 'Bilim')
ON CONFLICT DO NOTHING;

-- Varsayılan Ayarlar
INSERT INTO settings (key, value, description) VALUES
    ('idle_quote_interval', '8', 'Bekleme ekranında alıntı değişim süresi (saniye)'),
    ('question_warning_time', '10', 'Süre uyarısı başlangıcı (saniye kala)'),
    ('result_display_duration', '15', 'Sonuç ekranı gösterim süresi (saniye)'),
    ('sound_enabled', 'true', 'Ses efektleri açık/kapalı'),
    ('tick_sound_start', '10', 'Tik sesi başlangıcı (saniye kala)')
ON CONFLICT (key) DO NOTHING;

-- Varsayılan oyun oturumu
INSERT INTO game_sessions (state) VALUES ('IDLE')
ON CONFLICT DO NOTHING;
