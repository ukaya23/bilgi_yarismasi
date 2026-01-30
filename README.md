# Bilgi Yarışması - LAN Tabanlı Gerçek Zamanlı Platform

## 🎯 Proje Hakkında

LAN üzerinde çalışan, 4 farklı arayüze sahip (Admin, Yarışmacı, Jüri, Seyirci), düşük gecikmeli real-time bilgi yarışması platformu.

**Modern Mimari:**
- PostgreSQL database
- JWT-based authentication
- Multi-tenant support (eş zamanlı birden fazla yarışma)
- WebSocket real-time communication

## 🚀 Hızlı Başlangıç

### Docker ile Çalıştırma (Önerilen)

```bash
# Tüm servisleri başlat (PostgreSQL + Node.js)
docker compose up -d

# Logları görüntüle
docker compose logs -f

# Servisleri durdur
docker compose down
```

### Yerel Geliştirme

```bash
# Bağımlılıkları kur
npm install

# Environment variables ayarla
cp .env.example .env

# PostgreSQL bağlantısını yapılandır (veya Docker kullan)
# DATABASE_URL=postgresql://quiz_admin:password@localhost:5432/quiz_game

# Sunucuyu başlat
npm start

# veya geliştirme modunda (hot reload)
npm run dev
```

## 📱 Erişim Adresleri

| Arayüz | Adres | Kimlik Bilgileri |
|--------|-------|------------------|
| Ana Sayfa | http://192.168.1.100:3000 | - |
| Admin Login | http://192.168.1.100:3000/admin-login | admin / admin123 |
| Admin Paneli | http://192.168.1.100:3000/admin | JWT required |
| Yarışmacı | http://192.168.1.100:3000/player | İsim + Masa No |
| Jüri | http://192.168.1.100:3000/jury | Jüri Kodu |
| Seyirci Ekranı | http://192.168.1.100:3000/screen | - |

> **Not:** `192.168.1.100` yerine sunucunuzun gerçek IP adresini kullanın.

## 🏗️ Mimari

```
┌─────────────────────────────────────────────────────────────────┐
│                         LAN Network                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐           │
│  │  Admin  │  │ Player  │  │  Jury   │  │ Screen  │           │
│  │ Browser │  │ Browser │  │ Browser │  │ Browser │           │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘           │
│       │            │            │            │                 │
│       └────────────┴────────────┴────────────┘                 │
│                         │                                       │
│                    WebSocket (JWT Auth)                         │
│                         │                                       │
│              ┌──────────┴──────────┐                           │
│              │   Node.js Server    │                           │
│              │   Express + Socket.io                           │
│              │   JWT Authentication│                           │
│              └──────────┬──────────┘                           │
│                         │                                       │
│              ┌──────────┴──────────┐                           │
│              │  PostgreSQL 15      │                           │
│              │  Multi-tenant DB    │                           │
│              └─────────────────────┘                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 📂 Proje Yapısı

```
bilgi_yarismasi/
├── server.js                    # Ana sunucu dosyası
├── package.json                 # Node.js bağımlılıkları
├── Dockerfile                   # Docker imaj tanımı
├── docker-compose.yml           # Docker Compose (PostgreSQL + App)
├── .env                         # Environment variables
├── database/
│   ├── postgres.js             # PostgreSQL modülü (async/await)
│   └── migrations/             # Database migrations
│       ├── 001_initial_schema.sql
│       ├── 002_jwt_tokens.sql
│       └── 003_multi_tenant.sql
├── src/
│   ├── auth/                   # Authentication layer
│   │   ├── jwtUtils.js        # JWT token generation/validation
│   │   ├── authMiddleware.js  # Express auth middleware
│   │   └── socketAuth.js      # Socket.io auth middleware
│   ├── routes/                 # API routes
│   │   ├── authRoutes.js      # Auth endpoints (login/logout)
│   │   └── competitionRoutes.js # Competition management
│   ├── state/                  # Game state management
│   │   ├── gameState.js       # Game state machine
│   │   └── competitionManager.js # Multi-competition manager
│   └── handlers/               # Socket.io handlers
│       ├── adminHandler.js
│       ├── playerHandler.js
│       ├── juryHandler.js
│       └── screenHandler.js
└── public/                     # Frontend files
    ├── index.html              # Ana sayfa
    ├── admin-login.html        # Admin login (JWT)
    ├── admin.html              # Admin paneli
    ├── player.html             # Yarışmacı arayüzü
    ├── jury.html               # Jüri paneli
    ├── screen.html             # Seyirci ekranı
    ├── css/                    # Stil dosyaları
    └── js/                     # JavaScript dosyaları
        ├── common.js           # Socket manager (JWT support)
        ├── admin.js
        ├── player.js
        ├── jury.js
        └── screen.js
```

## 🎮 Oyun Akışı

1. **IDLE** - Bekleme modu
2. **QUESTION_ACTIVE** - Soru yayında, yarışmacılar cevaplıyor
3. **LOCKED** - Süre doldu, cevaplar kilitleniyor
4. **GRADING** - Jüri değerlendirmesi (açık uçlu sorular)
5. **REVEAL** - Doğru cevap ve puan tablosu gösterimi

## 🔐 Authentication & Authorization

### JWT Token System

- **Access Token**: 15 dakika geçerlilik
- **Refresh Token**: 7 gün geçerlilik
- Token revocation support (logout)
- Competition context in tokens

### API Endpoints

```bash
# Admin Login
POST /api/auth/login/admin
Body: { "username": "admin", "password": "admin123" }

# Player Login
POST /api/auth/login/player
Body: { "name": "Ali", "tableNo": 5, "competitionId": 1 }

# Jury Login
POST /api/auth/login/jury
Body: { "code": "JURY2024" }

# Token Refresh
POST /api/auth/refresh
Headers: Authorization: Bearer <REFRESH_TOKEN>

# Logout
POST /api/auth/logout
Headers: Authorization: Bearer <ACCESS_TOKEN>

# Verify Token
GET /api/auth/verify
Headers: Authorization: Bearer <ACCESS_TOKEN>
```

## 🏆 Multi-tenant Support

Sistem birden fazla yarışmayı eş zamanlı destekler:

```bash
# List all competitions
GET /api/competitions

# Get competition details
GET /api/competitions/:id

# Create new competition (admin only)
POST /api/competitions
Headers: Authorization: Bearer <ADMIN_TOKEN>
Body: { "name": "Yarışma 2", "contestantCount": 10, "juryCount": 3 }

# Get competition contestants
GET /api/competitions/:id/contestants

# Get competition leaderboard
GET /api/competitions/:id/leaderboard
```

### Competition Isolation

- Her yarışmanın kendi game state'i
- Ayrı Socket.io rooms: `admin-1`, `player-2`, etc.
- Database-level data isolation
- Independent contestant lists and scores

## 🔧 Yapılandırma

### Environment Variables

`.env` dosyası:

```env
# Database
DATABASE_URL=postgresql://quiz_admin:password@postgres:5432/quiz_game
DB_PASSWORD=QuizGame2024SecurePass!

# JWT
JWT_SECRET=your-secret-key-min-32-chars
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Server
PORT=3000
NODE_ENV=production
```

### Docker Environment

Docker Compose otomatik olarak:
- PostgreSQL 15-alpine container'ı başlatır
- Database migrations'ı uygular
- Health checks yapılandırır
- Volume persistence sağlar

## 🗄️ Database Schema

**Temel Tablolar:**
- `competitions` - Yarışma bilgileri
- `contestants` - Yarışmacılar (competition_id ile ilişkili)
- `questions` - Sorular
- `answers` - Cevaplar (competition_id ile ilişkili)
- `admin_users` - Admin kullanıcıları (bcrypt hash)
- `revoked_tokens` - İptal edilmiş JWT token'lar
- `quotes` - Özlü sözler
- `game_sessions` - Oyun oturumları
- `access_codes` - Erişim kodları

## 🔒 Güvenlik

- ✅ JWT-based authentication
- ✅ Bcrypt password hashing
- ✅ Token revocation support
- ✅ PostgreSQL parameterized queries (SQL injection koruması)
- ✅ Connection pooling (max 20 connections)
- ✅ Environment variables for secrets
- ⚠️ Sistemin internet bağlantısı olmadan çalışması önerilir
- ⚠️ Yarışmacı cihazlarında Kiosk modu kullanın:
  ```
  chrome.exe --kiosk http://192.168.1.100:3000/player --incognito
  ```

## 🚀 Production Deployment

### Docker Compose (Recommended)

```bash
# Build and start
docker compose up -d --build

# View logs
docker compose logs -f quiz-server

# Database backup
docker exec quiz-postgres pg_dump -U quiz_admin quiz_game > backup.sql

# Restore backup
cat backup.sql | docker exec -i quiz-postgres psql -U quiz_admin quiz_game
```

### Manual Setup

1. Install PostgreSQL 15+
2. Create database and user
3. Run migrations from `database/migrations/`
4. Configure `.env` file
5. `npm install && npm start`

## 📊 Performance

- **WebSocket**: Low-latency real-time updates
- **PostgreSQL**: Connection pooling (20 connections)
- **JWT**: Stateless authentication
- **Multi-tenant**: Isolated game states per competition

## 🛠️ Development

```bash
# Install dependencies
npm install

# Start PostgreSQL (Docker)
docker compose up -d postgres

# Run migrations
docker exec quiz-postgres psql -U quiz_admin -d quiz_game < database/migrations/001_initial_schema.sql

# Start dev server
npm run dev

# Run tests
npm test
```

## 📝 API Documentation

Full API documentation: `/api/docs` (coming soon)

## 🐛 Troubleshooting

**PostgreSQL connection error:**
```bash
# Check PostgreSQL is running
docker compose ps

# Check logs
docker compose logs postgres

# Restart services
docker compose restart
```

**JWT token issues:**
```bash
# Clear browser localStorage
localStorage.clear()

# Check token in dev tools > Application > Local Storage
```

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📞 Support

For issues and questions, please open an issue on GitHub.

---

**Built with:** Node.js 18 • Express 4 • Socket.io 4 • PostgreSQL 15 • JWT • Docker
