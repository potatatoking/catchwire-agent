FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache python3 make g++ sqlite

# ─── deps ────────────────────────────────────────────────────────────────────
FROM base AS deps
COPY package*.json ./
RUN npm ci --omit=dev

# ─── build ───────────────────────────────────────────────────────────────────
FROM base AS builder
COPY package*.json tsconfig.json vite.config.ts index.html ./
RUN npm ci
COPY src/ src/
COPY public/ public/
RUN npm run build

# ─── runtime ─────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production

COPY --from=deps    /app/node_modules ./node_modules
COPY --from=builder /app/src          ./src
COPY --from=builder /app/public       ./public
COPY --from=builder /app/dist         ./dist
COPY package.json tsconfig.json ./

VOLUME ["/app/data"]

EXPOSE 3000 2525

HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["./node_modules/.bin/tsx", "src/main.ts"]
