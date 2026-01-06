/**
 * Bilgi Yarışması - Ana Sunucu Dosyası
 * 
 * LAN tabanlı gerçek zamanlı bilgi yarışması platformu
 */

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const fs = require('fs');

// Multer konfigürasyonu - Resim yükleme
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadsDir = path.join(__dirname, 'public', 'uploads');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'question-' + uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // Max 10MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Sadece resim dosyaları (JPEG, PNG, GIF, WEBP) yüklenebilir'), false);
        }
    }
});

// Veritabanı ve State
const db = require('./database/postgres');
const gameState = require('./src/state/gameState');

// Event Handler'lar
const { registerAdminHandlers } = require('./src/handlers/adminHandler');
const { registerPlayerHandlers } = require('./src/handlers/playerHandler');
const { registerJuryHandlers } = require('./src/handlers/juryHandler');
const { registerScreenHandlers } = require('./src/handlers/screenHandler');

// Express Uygulaması
const app = express();
const httpServer = createServer(app);

// Socket.io Sunucusu
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

// Admin oturum deposu (basit in-memory)
const adminSessions = new Map();

// ==================== MIDDLEWARE ====================

// Statik dosyalar
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Admin oturum kontrolü middleware
function requireAdminAuth(req, res, next) {
    const token = req.headers['x-admin-token'];
    if (!token || !adminSessions.has(token)) {
        return res.status(401).json({ error: 'Yetkisiz erişim' });
    }
    req.admin = adminSessions.get(token);
    next();
}

// ==================== ROUTES ====================

// Ana sayfa - Yönlendirme
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Admin Login Sayfası
app.get('/admin-login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

// Admin Paneli
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Yarışmacı Arayüzü
app.get('/player', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

// Jüri Arayüzü
app.get('/jury', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'jury.html'));
});

// Seyirci Ekranı
app.get('/screen', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'screen.html'));
});

// ==================== AUTH API ROUTES ====================

// Admin Login
app.post('/api/auth/admin-login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });
        }

        const admin = await db.authenticateAdmin(username, password);

        if (!admin) {
            return res.status(401).json({ error: 'Geçersiz kullanıcı adı veya şifre' });
        }

        const token = uuidv4();
        adminSessions.set(token, { id: admin.id, username: admin.username });

        res.json({
            success: true,
            token,
            username: admin.username
        });
    } catch (error) {
        console.error('Admin login hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Admin Logout
app.post('/api/auth/admin-logout', (req, res) => {
    const token = req.headers['x-admin-token'];
    if (token) {
        adminSessions.delete(token);
    }
    res.json({ success: true });
});

// Admin oturum kontrolü
app.get('/api/auth/check-admin', (req, res) => {
    const token = req.headers['x-admin-token'];
    if (token && adminSessions.has(token)) {
        const admin = adminSessions.get(token);
        res.json({ authenticated: true, username: admin.username });
    } else {
        res.json({ authenticated: false });
    }
});

// Erişim kodu doğrulama (Yarışmacı/Jüri)
app.post('/api/auth/validate-code', async (req, res) => {
    try {
        const { code } = req.body;

        if (!code || code.length < 6) {
            return res.status(400).json({ error: 'Geçersiz kod formatı' });
        }

        const result = await db.validateAccessCode(code);

        if (!result.valid) {
            return res.status(401).json({ error: result.message });
        }

        // Session token oluştur
        const sessionToken = uuidv4();
        await db.markCodeAsUsed(result.accessCode.id, sessionToken);

        res.json({
            success: true,
            sessionToken,
            role: result.accessCode.role,
            name: result.accessCode.name,
            slotNumber: result.accessCode.slot_number,
            competitionName: result.accessCode.competition_name
        });
    } catch (error) {
        console.error('Kod doğrulama hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Session token kontrolü
app.post('/api/auth/validate-session', async (req, res) => {
    try {
        const { sessionToken } = req.body;

        if (!sessionToken) {
            return res.json({ valid: false });
        }

        const accessCode = await db.validateSessionToken(sessionToken);

        if (!accessCode) {
            return res.json({ valid: false });
        }

        res.json({
            valid: true,
            role: accessCode.role,
            name: accessCode.name,
            slotNumber: accessCode.slot_number,
            competitionName: accessCode.competition_name
        });
    } catch (error) {
        console.error('Session doğrulama hatası:', error);
        res.json({ valid: false });
    }
});

// ==================== COMPETITION API ROUTES ====================

// Yarışma oluştur
app.post('/api/competition', requireAdminAuth, async (req, res) => {
    try {
        const { name, contestantCount, juryCount } = req.body;

        if (!name || !contestantCount || !juryCount) {
            return res.status(400).json({ error: 'Tüm alanlar gerekli' });
        }

        // Mevcut aktif yarışmayı kapat
        const activeCompetition = await db.getActiveCompetition();
        if (activeCompetition) {
            console.log('[DEBUG] Mevcut aktif yarışma kapatılıyor:', activeCompetition.id);
            await db.updateCompetitionStatus(activeCompetition.id, 'COMPLETED');
        }

        // Yeni yarışma oluştur
        const competitionId = await db.createCompetition(name, contestantCount, juryCount);
        console.log('[DEBUG] Yeni yarışma ID:', competitionId);

        // Erişim kodlarını oluştur
        const codes = await db.generateAccessCodes(competitionId, contestantCount, juryCount);
        console.log('[DEBUG] Oluşturulan kodlar:', codes.length, 'adet');

        res.json({
            success: true,
            competitionId,
            codes
        });
    } catch (error) {
        console.error('Yarışma oluşturma hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Yarışmayı sonlandır
app.post('/api/competition/end', requireAdminAuth, async (req, res) => {
    try {
        const activeCompetition = await db.getActiveCompetition();
        if (activeCompetition) {
            await db.updateCompetitionStatus(activeCompetition.id, 'COMPLETED');
            await db.resetAllAccessCodes(activeCompetition.id); // Kodları da sıfırla ki tekrar kullanılabilsin (opsiyonel)
            await gameState.resetGame(); // Oyunu da resetle
            console.log('[COMPETITION] Yarışma sonlandırıldı:', activeCompetition.id);
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Yarışma sonlandırma hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Aktif yarışmayı getir
app.get('/api/competition/active', async (req, res) => {
    try {
        const competition = await db.getActiveCompetition();
        console.log('[DEBUG] Aktif yarışma:', competition);
        if (!competition) {
            return res.json({ active: false });
        }

        const codes = await db.getAccessCodesByCompetition(competition.id);
        console.log('[DEBUG] Yarışma kodları:', codes.length, 'adet, yarışma ID:', competition.id);
        res.json({
            active: true,
            competition,
            codes
        });
    } catch (error) {
        console.error('Yarışma getirme hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Erişim kodu ismini güncelle
app.put('/api/competition/code/:id', requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'İsim gerekli' });
        }

        await db.updateAccessCodeName(parseInt(id), name);
        res.json({ success: true });
    } catch (error) {
        console.error('Kod güncelleme hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Erişim kodunu sıfırla
app.post('/api/competition/code/:id/reset', requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        await db.resetAccessCode(parseInt(id));
        res.json({ success: true });
    } catch (error) {
        console.error('Kod sıfırlama hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// ==================== UPLOAD API ROUTES ====================

// Resim yükle
app.post('/api/upload', requireAdminAuth, upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Dosya yüklenmedi' });
        }

        const imageUrl = '/uploads/' + req.file.filename;
        console.log('[UPLOAD] Resim yüklendi:', imageUrl);

        res.json({
            success: true,
            url: imageUrl,
            filename: req.file.filename
        });
    } catch (error) {
        console.error('Resim yükleme hatası:', error);
        res.status(500).json({ error: 'Resim yüklenemedi' });
    }
});

// Resim sil
app.delete('/api/upload/:filename', requireAdminAuth, (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(__dirname, 'public', 'uploads', filename);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log('[UPLOAD] Resim silindi:', filename);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Dosya bulunamadı' });
        }
    } catch (error) {
        console.error('Resim silme hatası:', error);
        res.status(500).json({ error: 'Resim silinemedi' });
    }
});

// ==================== SETTINGS API ROUTES ====================

// Tüm ayarları getir
app.get('/api/settings', async (req, res) => {
    try {
        const settings = await db.getAllSettings();
        res.json(settings);
    } catch (error) {
        console.error('Ayarlar getirme hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Ayar güncelle
app.put('/api/settings/:key', requireAdminAuth, async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;

        await db.setSetting(key, value.toString());
        res.json({ success: true });
    } catch (error) {
        console.error('Ayar güncelleme hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// ==================== EXISTING API ROUTES ====================

// Sorular API
app.get('/api/questions', async (req, res) => {
    res.json(await db.getAllQuestions());
});

// Yarışmacılar API
app.get('/api/contestants', async (req, res) => {
    res.json(await db.getAllContestants());
});

// Liderlik Tablosu API
app.get('/api/leaderboard', async (req, res) => {
    res.json(await db.getLeaderboard());
});

// Oyun Durumu API
app.get('/api/state', (req, res) => {
    res.json(gameState.getState());
});

// ==================== SOCKET.IO ====================

io.on('connection', (socket) => {
    console.log(`[SOCKET] Yeni bağlantı: ${socket.id}`);

    // Rol belirleme
    socket.on('JOIN_ROOM', (data) => {
        const { role } = data;

        switch (role) {
            case 'admin':
                registerAdminHandlers(io, socket);
                break;
            case 'player':
                registerPlayerHandlers(io, socket);
                break;
            case 'jury':
                registerJuryHandlers(io, socket);
                break;
            case 'screen':
                registerScreenHandlers(io, socket);
                break;
            default:
                socket.emit('ERROR', { message: 'Geçersiz rol' });
        }
    });

    // Genel bağlantı kopması
    socket.on('disconnect', (reason) => {
        console.log(`[SOCKET] Bağlantı koptu: ${socket.id} - ${reason}`);
    });
});

// ==================== SUNUCU BAŞLAT ====================

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Tüm ağ arayüzlerinden erişim

async function startServer() {
    try {
        // Veritabanını başlat (PostgreSQL)
        await db.initialize();

        // Varsayılan admin kullanıcısını oluştur
        await db.ensureDefaultAdmin();

        // GameState'e io referansını ver
        gameState.setIO(io);

        // HTTP sunucusunu başlat
        httpServer.listen(PORT, HOST, () => {
            console.log('='.repeat(50));
            console.log('  BİLGİ YARIŞMASI SUNUCUSU');
            console.log('='.repeat(50));
            console.log(`  Sunucu çalışıyor: http://localhost:${PORT}`);
            console.log('');
            console.log('  Erişim Adresleri:');
            console.log(`    Admin:     http://192.168.1.100:${PORT}/admin`);
            console.log(`    Yarışmacı: http://192.168.1.100:${PORT}/player`);
            console.log(`    Jüri:      http://192.168.1.100:${PORT}/jury`);
            console.log(`    Seyirci:   http://192.168.1.100:${PORT}/screen`);
            console.log('='.repeat(50));
        });
    } catch (error) {
        console.error('Sunucu başlatma hatası:', error);
        process.exit(1);
    }
}

// Sunucuyu başlat
startServer();

// Graceful Shutdown
process.on('SIGINT', async () => {
    console.log('\nSunucu kapatılıyor...');
    await db.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nSunucu kapatılıyor...');
    await db.close();
    process.exit(0);
});
