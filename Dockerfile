FROM node:18-alpine

# Çalışma dizini
WORKDIR /app

# Paket dosyalarını kopyala
COPY package*.json ./

# Production bağımlılıkları kur
RUN npm ci --only=production

# Uygulama dosyalarını kopyala
COPY . .

# Port
EXPOSE 3000

# Başlatma komutu
CMD ["node", "server.js"]
