/**
 * Bilgi Yarışması - Ana Sunucu Dosyası
 *
 * LAN tabanlı gerçek zamanlı bilgi yarışması platformu
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import log from './src/utils/logger';

import db from './database/postgres';
import competitionManager from './src/state/competitionManager';

import { registerAdminHandlers } from './src/handlers/adminHandler';
import { registerPlayerHandlers } from './src/handlers/playerHandler';
import { registerJuryHandlers } from './src/handlers/juryHandler';
import { registerScreenHandlers } from './src/handlers/screenHandler';

import type { AuthenticatedSocket } from './src/types';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 60000,
    pingInterval: 25000
});

// ==================== MIDDLEWARE ====================

// __dirname = dist/ when compiled, public/ is at project root
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.use(express.json());

import rateLimit from 'express-rate-limit';

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

app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.get('/admin-login', (req, res) => res.sendFile(path.join(publicDir, 'admin-login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(publicDir, 'admin.html')));
app.get('/player', (req, res) => res.sendFile(path.join(publicDir, 'player.html')));
app.get('/jury', (req, res) => res.sendFile(path.join(publicDir, 'jury.html')));
app.get('/screen', (req, res) => res.sendFile(path.join(publicDir, 'screen.html')));

import authRoutes from './src/routes/authRoutes';
import competitionRoutes from './src/routes/competitionRoutes';
import uploadRoutes from './src/routes/uploadRoutes';
import settingsRoutes from './src/routes/settingsRoutes';
import gameRoutes from './src/routes/gameRoutes';
import questionImportExportRoutes from './src/routes/questionImportExportRoutes';

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/validate-code', authLimiter);
app.use('/api/auth/change-password', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/competitions', competitionRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api', gameRoutes);
app.use('/api/questions', questionImportExportRoutes);

// ==================== SOCKET.IO ====================

import { optionalSocketAuth } from './src/auth/socketAuth';
io.use(optionalSocketAuth as any);

io.on('connection', async (socket: AuthenticatedSocket) => {
    log.info({ socketId: socket.id, role: socket.role || 'unauthenticated' }, 'Yeni socket baglantisi');

    if (socket.role) {
        // If competitionId not in JWT (e.g. admin), use active competition
        let competitionId = socket.competitionId;
        if (!competitionId) {
            const active = await db.getActiveCompetition();
            competitionId = active ? active.id : 1;
        }
        log.info({ username: socket.username, role: socket.role, competitionId }, 'JWT authenticated');

        // Join both role room and competition-specific room
        socket.join(socket.role!);
        socket.join(`comp-${competitionId}`);

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
        const active = await db.getActiveCompetition();
        const compId = active ? active.id : 1;
        socket.join(`comp-${compId}`);
        const defaultGameState = competitionManager.getGameState(compId);
        registerScreenHandlers(io, socket, defaultGameState);
    }

    socket.on('disconnect', (reason: string) => {
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

        setInterval(async () => {
            try {
                const deleted = await db.cleanupRevokedTokens();
                if (deleted && deleted > 0) {
                    log.info({ deleted }, 'Eski revoked tokenlar temizlendi');
                }
            } catch (err) {
                log.error({ err }, 'Token temizligi hatasi');
            }
        }, 6 * 60 * 60 * 1000);

        httpServer.listen(PORT as number, HOST, () => {
            log.info({ port: PORT, host: HOST }, 'Bilgi Yarismasi sunucusu baslatildi');
        });
    } catch (error) {
        log.fatal({ err: error }, 'Sunucu baslatma hatasi');
        process.exit(1);
    }
}

startServer();

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
