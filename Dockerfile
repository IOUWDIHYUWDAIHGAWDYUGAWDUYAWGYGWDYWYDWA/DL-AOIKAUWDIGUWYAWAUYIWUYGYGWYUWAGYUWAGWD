FROM node:24-alpine

WORKDIR /app

# Bağımlılıkları ayrı katmanda önbelleklemek için önce package dosyalarını kopyala
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 🎵 Müzik botu için ses dönüştürme (play-dl → @discordjs/voice)
RUN apk add --no-cache ffmpeg python3 curl \
    && curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp

COPY . .

ENV NODE_ENV=production

CMD ["node", "dist/start.js"]
