"use strict";
/**
 * Bilgi Yarışması - Ana Sunucu Dosyası
 *
 * LAN tabanlı gerçek zamanlı bilgi yarışması platformu
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const path_1 = __importDefault(require("path"));
const logger_1 = __importDefault(require("./src/utils/logger"));
const postgres_1 = __importDefault(require("./database/postgres"));
const competitionManager_1 = __importDefault(require("./src/state/competitionManager"));
const adminHandler_1 = require("./src/handlers/adminHandler");
const playerHandler_1 = require("./src/handlers/playerHandler");
const juryHandler_1 = require("./src/handlers/juryHandler");
const screenHandler_1 = require("./src/handlers/screenHandler");
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 60000,
    pingInterval: 25000
});
// ==================== MIDDLEWARE ====================
app.use(express_1.default.static(path_1.default.join(__dirname, 'public')));
app.use(express_1.default.json());
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.' },
    standardHeaders: true,
    legacyHeaders: false
});
const apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 100,
    message: { error: 'Çok fazla istek. Lütfen biraz bekleyin.' },
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api/', apiLimiter);
// ==================== ROUTES ====================
app.get('/', (req, res) => res.sendFile(path_1.default.join(__dirname, 'public', 'index.html')));
app.get('/admin-login', (req, res) => res.sendFile(path_1.default.join(__dirname, 'public', 'admin-login.html')));
app.get('/admin', (req, res) => res.sendFile(path_1.default.join(__dirname, 'public', 'admin.html')));
app.get('/player', (req, res) => res.sendFile(path_1.default.join(__dirname, 'public', 'player.html')));
app.get('/jury', (req, res) => res.sendFile(path_1.default.join(__dirname, 'public', 'jury.html')));
app.get('/screen', (req, res) => res.sendFile(path_1.default.join(__dirname, 'public', 'screen.html')));
const authRoutes_1 = __importDefault(require("./src/routes/authRoutes"));
const competitionRoutes_1 = __importDefault(require("./src/routes/competitionRoutes"));
const uploadRoutes_1 = __importDefault(require("./src/routes/uploadRoutes"));
const settingsRoutes_1 = __importDefault(require("./src/routes/settingsRoutes"));
const gameRoutes_1 = __importDefault(require("./src/routes/gameRoutes"));
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/validate-code', authLimiter);
app.use('/api/auth/change-password', authLimiter);
app.use('/api/auth', authRoutes_1.default);
app.use('/api/competitions', competitionRoutes_1.default);
app.use('/api/upload', uploadRoutes_1.default);
app.use('/api/settings', settingsRoutes_1.default);
app.use('/api', gameRoutes_1.default);
// ==================== SOCKET.IO ====================
const socketAuth_1 = require("./src/auth/socketAuth");
io.use(socketAuth_1.optionalSocketAuth);
io.on('connection', (socket) => {
    logger_1.default.info({ socketId: socket.id, role: socket.role || 'unauthenticated' }, 'Yeni socket baglantisi');
    if (socket.role) {
        const competitionId = socket.competitionId || 1;
        logger_1.default.info({ username: socket.username, role: socket.role, competitionId }, 'JWT authenticated');
        const roomName = `${socket.role}-${competitionId}`;
        socket.join(roomName);
        logger_1.default.debug({ socketId: socket.id, room: roomName }, 'Joined room');
        socket.competitionId = competitionId;
        const gameState = competitionManager_1.default.getGameState(competitionId);
        switch (socket.role) {
            case 'admin':
                (0, adminHandler_1.registerAdminHandlers)(io, socket, gameState);
                break;
            case 'player':
                (0, playerHandler_1.registerPlayerHandlers)(io, socket, gameState);
                break;
            case 'jury':
                (0, juryHandler_1.registerJuryHandlers)(io, socket, gameState);
                break;
            case 'screen':
                (0, screenHandler_1.registerScreenHandlers)(io, socket, gameState);
                break;
        }
    }
    if (!socket.role) {
        logger_1.default.debug({ socketId: socket.id }, 'Unauthenticated connection -> screen handler');
        const defaultGameState = competitionManager_1.default.getGameState(1);
        (0, screenHandler_1.registerScreenHandlers)(io, socket, defaultGameState);
    }
    socket.on('disconnect', (reason) => {
        logger_1.default.info({ socketId: socket.id, reason }, 'Socket baglantisi koptu');
    });
});
// ==================== SUNUCU BAŞLAT ====================
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
async function startServer() {
    try {
        await postgres_1.default.initialize();
        await postgres_1.default.ensureDefaultAdmin();
        competitionManager_1.default.setIO(io);
        setInterval(async () => {
            try {
                const deleted = await postgres_1.default.cleanupRevokedTokens();
                if (deleted && deleted > 0) {
                    logger_1.default.info({ deleted }, 'Eski revoked tokenlar temizlendi');
                }
            }
            catch (err) {
                logger_1.default.error({ err }, 'Token temizligi hatasi');
            }
        }, 6 * 60 * 60 * 1000);
        httpServer.listen(PORT, HOST, () => {
            logger_1.default.info({ port: PORT, host: HOST }, 'Bilgi Yarismasi sunucusu baslatildi');
        });
    }
    catch (error) {
        logger_1.default.fatal({ err: error }, 'Sunucu baslatma hatasi');
        process.exit(1);
    }
}
startServer();
process.on('SIGINT', async () => {
    logger_1.default.info('Sunucu kapatiliyor (SIGINT)...');
    await postgres_1.default.close();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    logger_1.default.info('Sunucu kapatiliyor (SIGTERM)...');
    await postgres_1.default.close();
    process.exit(0);
});
//# sourceMappingURL=server.js.map