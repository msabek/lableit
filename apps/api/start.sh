#!/bin/sh
# Lableit API container entrypoint.
# 1. Apply any pending Prisma migrations (idempotent; safe to run every boot).
# 2. Launch the process. The same image serves both roles:
#      - API server (default)
#      - BullMQ worker when WORKER_MODE=true (no HTTP listener)
#    Both are started via the apps/api "start" script (`bun run src/index.ts`),
#    which inspects WORKER_MODE / RUN_HTTP_SERVER at runtime.
set -e

cd /app/apps/api

bunx prisma migrate deploy

exec bun run start
