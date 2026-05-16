# ── Build aşaması ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app
COPY app/package*.json ./
RUN npm install --omit=dev

# ── Çalıştırma aşaması (küçük imaj) ────────────────────────────────────────────
FROM node:20-alpine

# Güvenlik: root olmayan kullanıcı
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Bağımlılıkları kopyala
COPY --from=builder /app/node_modules ./node_modules

# Uygulama dosyalarını kopyala
COPY app/ .

# Veri dizinini oluştur (PVC bu noktaya mount edilecek)
RUN mkdir -p /data && chown -R appuser:appgroup /data /app

USER appuser

EXPOSE 3000

# Sağlık kontrolü
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data

CMD ["node", "index.js"]
