# Lableit API Dockerfile
# Build context: REPO ROOT (see docker-compose.prod.yml / Railway service config).
# The API is part of a Bun workspace, so the root package.json + bun.lock and the
# per-package manifests must be present before `bun install` to resolve
# fastify / prisma / bullmq and the @lableit/shared workspace package.

FROM oven/bun:1.3.12 AS base
# openssl is required by Prisma's query engine at runtime.
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# --- Dependencies stage --------------------------------------------------------
# Copy only manifests first so Docker can cache the install layer across source
# changes. The root manifest alone is NOT enough — Bun needs every workspace
# package.json referenced by the workspace globs to build the dependency tree.
FROM base AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

# Frozen install guarantees the image matches the committed lockfile.
RUN bun install --frozen-lockfile

# --- Build stage ---------------------------------------------------------------
FROM base AS builder
WORKDIR /app

# Reuse the installed workspace node_modules from the deps stage.
COPY --from=deps /app/node_modules ./node_modules

# Copy the rest of the repo (root .dockerignore keeps secrets/models/etc. out).
COPY . .

# Generate the Prisma client from apps/api (schema lives at apps/api/prisma).
RUN cd apps/api && bunx prisma generate

# --- Production image ----------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy the fully built workspace (includes generated Prisma client).
COPY --from=builder /app ./

# Startup: run pending DB migrations, then launch the API (apps/api "start"
# script = `bun run src/index.ts`). WORKER_MODE=true switches the same image to
# the BullMQ worker (no HTTP listener) — see apps/api/src/index.ts.
COPY apps/api/start.sh /start.sh
RUN chmod +x /start.sh

# Runtime scratch dirs used by export/temp logic, owned by the non-root user.
RUN mkdir -p apps/api/temp apps/api/exports && chown -R bun:bun /app

# Run as the non-root "bun" user that ships with the oven/bun image.
USER bun

# Default port (Railway overrides PORT; Railway internal services listen on 8080).
ENV PORT=3001
EXPOSE 3001

# Health check uses wget, which is available in the oven/bun debian base image
# (curl is NOT installed here).
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

CMD ["/start.sh"]
