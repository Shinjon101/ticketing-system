# =============================================================================
# Stage 1: BASE
# =============================================================================
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.30.2 --activate
WORKDIR /app

# =============================================================================
# Stage 2: DEPENDENCIES
# =============================================================================
FROM base AS dependencies
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY packages/common/package.json     ./packages/common/package.json
COPY packages/db/package.json         ./packages/db/package.json
COPY services/auth-service/package.json ./services/auth-service/package.json
RUN pnpm install --frozen-lockfile

# =============================================================================
# Stage 3: BUILDER
# =============================================================================
FROM dependencies AS builder
COPY packages/common/   ./packages/common/
COPY packages/db/       ./packages/db/
COPY services/auth-service/ ./services/auth-service/
COPY tsconfig.base.json ./
COPY tsconfig.json ./
RUN pnpm --filter @ticketing/common build
RUN pnpm --filter @ticketing/db build
RUN pnpm --filter @ticketing/auth-service build

# =============================================================================
# Stage 4: DEPLOY
# =============================================================================
FROM builder AS deploy
RUN pnpm --filter @ticketing/auth-service deploy --legacy --prod /app/deploy/auth-service

# =============================================================================
# Stage 5: RUNNER
# =============================================================================
FROM node:22-alpine AS runner


ARG PORT=4003

RUN apk add --no-cache tini
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app

COPY --chown=appuser:appgroup --from=deploy /app/deploy/auth-service ./

USER appuser


ENV PORT=${PORT}
ENV NODE_ENV=production

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
  CMD wget -qO- http://localhost:${PORT}/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]