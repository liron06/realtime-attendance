# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
WORKDIR /app
COPY . .
# Niet-geheime compile-time waarden; runtime krijgt de echte waarden uit .env.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    APP_URL=https://attendance.sv-realtime-gaming.nl \
    SESSION_SECRET=build-only-session-secret-at-least-32-bytes \
    QR_SECRET=build-only-qr-secret-at-least-32-bytes-long \
    DEMO_MODE=false
RUN npm run build

# Eenmalige image met Prisma CLI, gegenereerde client, schema én migraties.
FROM node:24-alpine AS migrator
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=node:node /app/prisma ./prisma
USER node
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

# Afzonderlijke niet-root workerimage met dezelfde gegenereerde Prisma-client.
FROM node:24-alpine AS worker
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json /app/tsconfig.json ./
COPY --from=builder --chown=node:node /app/lib ./lib
COPY --from=builder --chown=node:node /app/scripts ./scripts
USER node
CMD ["./node_modules/.bin/tsx", "scripts/sync-worker.ts"]

FROM node:24-alpine AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
