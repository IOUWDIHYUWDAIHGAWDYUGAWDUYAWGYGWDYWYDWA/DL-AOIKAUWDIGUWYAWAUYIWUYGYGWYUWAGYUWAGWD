FROM node:24-alpine

WORKDIR /app

# Bağımlılıkları ayrı katmanda önbelleklemek için önce package dosyalarını kopyala
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 🎵 Müzik botu için ses dönüştürme (play-dl → @discordjs/voice)
RUN apk add --no-cache ffmpeg

COPY . .

ENV NODE_ENV=production

CMD ["node", "dist/start.js"]
