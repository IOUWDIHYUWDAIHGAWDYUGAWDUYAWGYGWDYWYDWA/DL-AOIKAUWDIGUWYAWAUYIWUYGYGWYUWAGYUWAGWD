FROM node:20-alpine

WORKDIR /app

# Bağımlılıkları ayrı katmanda önbelleklemek için önce package dosyalarını kopyala
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
