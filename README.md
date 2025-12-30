# Bilgi Yarışması - LAN Tabanlı Gerçek Zamanlı Platform

## 🎯 Proje Hakkında

LAN üzerinde çalışan, 4 farklı arayüze sahip (Admin, Yarışmacı, Jüri, Seyirci), düşük gecikmeli real-time bilgi yarışması platformu.

## 🚀 Hızlı Başlangıç

### Yerel Geliştirme

```bash
# Bağımlılıkları kur
npm install

# Sunucuyu başlat
npm start

# veya geliştirme modunda (hot reload)
npm run dev
```

### Docker ile Çalıştırma

```bash
docker-compose up -d
```

## 📱 Erişim Adresleri

| Arayüz | Adres |
|--------|-------|
| Ana Sayfa | <http://192.168.1.100:3000> |
| Admin Paneli | <http://192.168.1.100:3000/admin> |
| Yarışmacı | <http://192.168.1.100:3000/player> |
| Jüri | <http://192.168.1.100:3000/jury> |
| Seyirci Ekranı | <http://192.168.1.100:3000/screen> |

> **Not:** `192.168.1.100` yerine sunucunuzun gerçek IP adresini kullanın.

## 🏗️ Mimari

```
┌─────────────────────────────────────────────────────────┐
│                    LAN Network                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐   │
│  │  Admin  │  │ Player  │  │  Jury   │  │ Screen  │   │
│  │ Browser │  │ Browser │  │ Browser │  │ Browser │   │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘   │
│       │            │            │            │         │
│       └────────────┴────────────┴────────────┘         │
│                         │                               │
│                    WebSocket                            │
│                         │                               │
│              ┌──────────┴──────────┐                   │
│              │   Node.js Server    │                   │
│              │   (Socket.io)       │                   │
│              └──────────┬──────────┘                   │
│                         │                               │
│              ┌──────────┴──────────┐                   │
│              │      SQLite DB      │                   │
│              └─────────────────────┘                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## 📂 Proje Yapısı

```
bilgi_yarismasi/
├── server.js              # Ana sunucu dosyası
├── package.json           # Node.js bağımlılıkları
├── Dockerfile             # Docker imaj tanımı
├── docker-compose.yml     # Docker Compose yapılandırması
├── database/
│   ├── db.js              # Veritabanı modülü
│   ├── schema.sql         # Veritabanı şeması
│   └── quiz.db            # SQLite veritabanı (otomatik oluşur)
├── src/
│   ├── state/
│   │   └── gameState.js   # Oyun durumu yönetimi
│   └── handlers/
│       ├── adminHandler.js
│       ├── playerHandler.js
│       ├── juryHandler.js
│       └── screenHandler.js
└── public/
    ├── index.html         # Ana sayfa
    ├── admin.html         # Admin paneli
    ├── player.html        # Yarışmacı arayüzü
    ├── jury.html          # Jüri paneli
    ├── screen.html        # Seyirci ekranı
    ├── css/               # Stil dosyaları
    └── js/                # JavaScript dosyaları
```

## 🎮 Oyun Akışı

1. **IDLE** - Bekleme modu
2. **QUESTION_ACTIVE** - Soru yayında, yarışmacılar cevaplıyor
3. **LOCKED** - Süre doldu, cevaplar kilitleniyor
4. **GRADING** - Jüri değerlendirmesi (açık uçlu sorular)
5. **REVEAL** - Doğru cevap ve puan tablosu gösterimi

## 🔧 Yapılandırma

### Sunucu IP Adresi Değiştirme

Sunucu varsayılan olarak tüm ağ arayüzlerini dinler (`0.0.0.0:3000`). Farklı port kullanmak için:

```bash
PORT=8080 npm start
```

### Veritabanı

SQLite veritabanı `database/quiz.db` dosyasında saklanır. İlk çalıştırmada otomatik oluşturulur ve örnek verilerle doldurulur.

## 🔒 Güvenlik

- Sistemin internet bağlantısı olmadan çalışması önerilir
- Yarışmacı cihazlarında Kiosk modu kullanın:

  ```
  chrome.exe --kiosk http://192.168.1.100:3000/player --incognito
  ```

## 📝 Lisans

MIT
