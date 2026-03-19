/**
 * Bilgi Yarışması - Ana Sunucu Dosyası
 *
 * LAN tabanlı gerçek zamanlı bilgi yarışması platformu
 */

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const log = require('./src/utils/logger');

// Veritabanı ve State
const db = require('./database/postgres');
const competitionManager = require('./src/state/competitionManager');

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

// Rate Limiting
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.' },
    standardHeaders: true,
    legacyHeaders: false
});

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 100,
    message: { error: 'Çok fazla istek. Lütfen biraz bekleyin.' },
    standardHeaders: true,
    legacyHeaders: false
});

app.use('/api/', apiLimiter);

// ==================== ROUTES ====================

// Sayfa yönlendirmeleri
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin-login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/player', (req, res) => res.sendFile(path.join(__dirname, 'public', 'player.html')));
app.get('/jury', (req, res) => res.sendFile(path.join(__dirname, 'public', 'jury.html')));
app.get('/screen', (req, res) => res.sendFile(path.join(__dirname, 'public', 'screen.html')));

// API Routes
const authRoutes = require('./src/routes/authRoutes');
const competitionRoutes = require('./src/routes/competitionRoutes');
const uploadRoutes = require('./src/routes/uploadRoutes');
const settingsRoutes = require('./src/routes/settingsRoutes');
const gameRoutes = require('./src/routes/gameRoutes');

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/validate-code', authLimiter);
app.use('/api/auth/change-password', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/competitions', competitionRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api', gameRoutes);

// ==================== SOCKET.IO ====================

const { optionalSocketAuth } = require('./src/auth/socketAuth');
io.use(optionalSocketAuth);

io.on('connection', (socket) => {
    log.info({ socketId: socket.id, role: socket.role || 'unauthenticated' }, 'Yeni socket baglantisi');

    if (socket.role) {
        const competitionId = socket.competitionId || 1;
        log.info({ username: socket.username, role: socket.role, competitionId }, 'JWT authenticated');

        const roomName = `${socket.role}-${competitionId}`;
        socket.join(roomName);
        log.debug({ socketId: socket.id, room: roomName }, 'Joined room');

        socket.competitionId = competitionId;
        const gameState = competitionManager.getGameState(competitionId);

        switch (socket.role) {
            case 'admin':
                registerAdminHandlers(io, socket, gameState);
                break;
            case 'player':
                registerPlayerHandlers(io, socket, gameState);
                break;
            case 'jury':
                registerJuryHandlers(io, socket, gameState);
                break;
            case 'screen':
                registerScreenHandlers(io, socket, gameState);
                break;
        }
    }

    if (!socket.role) {
        log.debug({ socketId: socket.id }, 'Unauthenticated connection -> screen handler');
        const defaultGameState = competitionManager.getGameState(1);
        registerScreenHandlers(io, socket, defaultGameState);
    }

    socket.on('disconnect', (reason) => {
        log.info({ socketId: socket.id, reason }, 'Socket baglantisi koptu');
    });
});

// ==================== SUNUCU BAŞLAT ====================

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

async function startServer() {
    try {
        await db.initialize();
        await db.ensureDefaultAdmin();
        competitionManager.setIO(io);

        // Periyodik token temizligi (her 6 saatte bir, 7 günden eski revoked token'lari sil)
        setInterval(async () => {
            try {
                const deleted = await db.cleanupRevokedTokens();
                if (deleted > 0) {
                    log.info({ deleted }, 'Eski revoked tokenlar temizlendi');
                }
            } catch (err) {
                log.error({ err }, 'Token temizligi hatasi');
            }
        }, 6 * 60 * 60 * 1000);

        httpServer.listen(PORT, HOST, () => {
            log.info({ port: PORT, host: HOST }, 'Bilgi Yarismasi sunucusu baslatildi');
        });
    } catch (error) {
        log.fatal({ err: error }, 'Sunucu baslatma hatasi');
        process.exit(1);
    }
}

startServer();

// Graceful Shutdown
process.on('SIGINT', async () => {
    log.info('Sunucu kapatiliyor (SIGINT)...');
    await db.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    log.info('Sunucu kapatiliyor (SIGTERM)...');
    await db.close();
    process.exit(0);
});
