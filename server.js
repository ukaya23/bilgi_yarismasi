/**
 * Bilgi Yarışması - Ana Sunucu Dosyası
 * 
 * LAN tabanlı gerçek zamanlı bilgi yarışması platformu
 */

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Veritabanı ve State
const db = require('./database/db');
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

// ==================== MIDDLEWARE ====================

// Statik dosyalar
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ==================== ROUTES ====================

// Ana sayfa - Yönlendirme
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
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

// ==================== API ROUTES ====================

// Sorular API
app.get('/api/questions', (req, res) => {
    res.json(db.getAllQuestions());
});

// Yarışmacılar API
app.get('/api/contestants', (req, res) => {
    res.json(db.getAllContestants());
});

// Liderlik Tablosu API
app.get('/api/leaderboard', (req, res) => {
    res.json(db.getLeaderboard());
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
        // Veritabanını başlat (async - sql.js için)
        await db.initialize();
        console.log('Veritabanı hazır.');

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
process.on('SIGINT', () => {
    console.log('\nSunucu kapatılıyor...');
    db.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nSunucu kapatılıyor...');
    db.close();
    process.exit(0);
});
