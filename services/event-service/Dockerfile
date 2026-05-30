
#Stage1: BASE

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.30.2 --activate

#Stage2: Build

FROM base AS dependencies
WORKDIR /app
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY packages/common/package.json     ./packages/common/package.json
COPY packages/db/package.json         ./packages/db/package.json
COPY packages/kafka-client/package.json ./packages/kafka-client/package.json
COPY services/event-service/package.json ./services/event-service/package.json
RUN pnpm install --frozen-lockfile


#Stage3: Builder

FROM dependencies AS builder
COPY packages/common/   ./packages/common/
COPY packages/db/       ./packages/db/
COPY packages/kafka-client/ ./packages/kafka-client/
COPY services/event-service/ ./services/event-service/
COPY tsconfig.base.json ./
COPY tsconfig.json ./
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ticketing/common build
RUN pnpm --filter @ticketing/db build
RUN pnpm --filter @ticketing/kafka-client build
RUN pnpm --filter @ticketing/event-service build


#Stage4: Deploy

FROM builder AS deploy
RUN pnpm --filter @ticketing/event-service deploy --legacy --prod /app/deploy/event-service


#stage5: Runner

FROM node:22-alpine AS runner


ARG PORT=4004

RUN apk add --no-cache tini
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app

COPY --chown=appuser:appgroup  --from=deploy /app/deploy/event-service ./

USER appuser


ENV PORT=${PORT}
ENV NODE_ENV=production

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -O- http://localhost:${PORT}/api/event/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]