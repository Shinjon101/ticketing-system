# =============================================================================
# Stage 1: BASE 
# =============================================================================
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.30.2 --activate

# =============================================================================
# Stage 2: DEPENDENCIES 
# =============================================================================
FROM base AS dependencies
WORKDIR /app
COPY pnpm-workspace.yaml ./ 
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY packages/common/package.json       ./packages/common/package.json
COPY packages/db/package.json           ./packages/db/package.json
COPY packages/kafka-client/package.json ./packages/kafka-client/package.json
COPY services/event-service/package.json ./services/event-service/package.json
RUN pnpm install --frozen-lockfile

# =============================================================================
# Stage 3: BUILDER 
# =============================================================================
FROM dependencies AS builder
COPY tsconfig.base.json ./
COPY tsconfig.json ./
COPY packages/common/       ./packages/common/
COPY packages/db/           ./packages/db/
COPY packages/kafka-client/ ./packages/kafka-client/
COPY services/event-service/ ./services/event-service/

RUN pnpm --filter @ticketing/common build
RUN pnpm --filter @ticketing/db build
RUN pnpm --filter @ticketing/kafka-client build
RUN pnpm --filter @ticketing/event-service build


RUN pnpm deploy --filter @ticketing/event-service --prod --legacy /app/deploy

# =============================================================================
# Stage 4: RUNNER 
# =============================================================================
FROM node:22-alpine AS runner

ARG PORT=4005

RUN apk add --no-cache tini
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app

COPY --chown=appuser:appgroup --from=builder /app/deploy/package.json ./
COPY --chown=appuser:appgroup --from=builder /app/deploy/node_modules ./node_modules/
COPY --chown=appuser:appgroup --from=builder /app/deploy/dist ./dist/

USER appuser

ENV PORT=${PORT}
ENV NODE_ENV=production

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/health || exit 1

LABEL version="2.0"
LABEL description="Event Service"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]