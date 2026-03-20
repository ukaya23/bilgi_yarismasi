FROM node:18-alpine

# Çalışma dizini
WORKDIR /app

# Paket dosyalarını kopyala
COPY package*.json ./
COPY tsconfig.json ./

# Tüm bağımlılıkları kur (TypeScript build için devDependencies dahil)
RUN npm install

# Uygulama dosyalarını kopyala
COPY . .

# TypeScript derle
RUN npx tsc

# Frontend bundle (concat + minify)
RUN node esbuild.config.mjs

# devDependencies'i kaldır (image boyutunu küçült)
RUN npm prune --omit=dev

# Port
EXPOSE 3000

# Başlatma komutu
CMD ["node", "dist/server.js"]
