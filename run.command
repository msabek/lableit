#!/bin/bash
# Lableit - macOS one-click launcher
#
# Double-click this file in Finder, or run it from a terminal:  ./run.command
#
# It starts the local infrastructure (Postgres 16, Redis, MinIO) from .devstack,
# then the app services (API, Inference, Web), waits for each to become ready,
# opens the web app in your browser, and tears everything down on Ctrl+C.
#
# First time only: the inference venv must exist
#   (cd apps/inference && bash setup_mac.sh)

set -uo pipefail

# Postgres refuses to start ("postmaster became multithreaded") without a locale.
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

# --- resolve repo root (this script lives at the repo root) -----------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DEVSTACK="$SCRIPT_DIR/.devstack"
LOGDIR="$DEVSTACK/logs"
mkdir -p "$LOGDIR"

# Ports (must match the root .env)
PG_PORT=5433
REDIS_PORT=6380
MINIO_PORT=9000
MINIO_CONSOLE=9001
API_PORT=3001
INFER_PORT=8001
WEB_PORT=3000

MINIO_PID=""

# --- locate a PostgreSQL 16 toolchain (the .devstack PGDATA is v16) ---------
PG_BIN=""
for cand in /opt/homebrew/opt/postgresql@16/bin /usr/local/opt/postgresql@16/bin; do
  [ -x "$cand/pg_ctl" ] && PG_BIN="$cand" && break
done
if [ -z "$PG_BIN" ] && command -v pg_ctl >/dev/null 2>&1; then
  v="$(pg_ctl --version | grep -oE '[0-9]+' | head -1)"
  [ "$v" = "16" ] && PG_BIN="$(dirname "$(command -v pg_ctl)")"
fi

# --- pretty output ----------------------------------------------------------
info() { printf '\033[1;36m%s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m%s\033[0m\n' "$*"; }
err()  { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }

port_up() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

wait_port() { # port name timeout_seconds
  local p="$1" n="$2" t="${3:-60}" i=0
  while ! port_up "$p"; do
    i=$((i + 1))
    [ "$i" -ge "$t" ] && { err "  timed out waiting for $n (:$p)"; return 1; }
    sleep 1
  done
  ok "  $n ready (:$p)"
}

# Runs on Ctrl+C and on any exit, including an early failure, so nothing is left
# running in the background. It preserves the exit status it was called with.
CLEANED=0
cleanup() {
  status=$?
  [ "$CLEANED" = "1" ] && exit "$status"
  CLEANED=1
  echo
  info "Shutting down Lableit..."
  for p in "$API_PORT" "$WEB_PORT" "$INFER_PORT"; do
    lsof -ti tcp:"$p" 2>/dev/null | xargs kill 2>/dev/null
  done
  [ -n "$MINIO_PID" ] && kill "$MINIO_PID" 2>/dev/null
  redis-cli -p "$REDIS_PORT" shutdown nosave >/dev/null 2>&1
  [ -n "$PG_BIN" ] && "$PG_BIN/pg_ctl" -D "$DEVSTACK/pg" stop -m fast >/dev/null 2>&1
  ok "All services stopped."
  exit "$status"
}
trap cleanup INT TERM EXIT

info "=== Lableit launcher ==="

# 0. First-run setup ----------------------------------------------------------
# A fresh clone has no .env, no node_modules, no Prisma client and no local
# database. Create whatever is missing; every step here is a no-op on reruns.
if [ ! -f "$SCRIPT_DIR/.env" ]; then
  info "Creating .env from .env.example..."
  cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
fi

if ! command -v bun >/dev/null 2>&1; then
  err "bun not found. Install it with: curl -fsSL https://bun.sh/install | bash"; exit 1
fi

if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
  info "Installing JS dependencies (first run only)..."
  ( cd "$SCRIPT_DIR" && bun install ) || { err "bun install failed"; exit 1; }
fi

# 1. Postgres -----------------------------------------------------------------
if port_up "$PG_PORT"; then
  ok "Postgres already running (:$PG_PORT)"
elif [ -n "$PG_BIN" ]; then
  # Create the cluster on first run. initdb alone is not enough: the app connects
  # as the "lableit" role to a "lableit" database, so both are created here.
  if [ ! -d "$DEVSTACK/pg/base" ]; then
    info "Creating the local Postgres cluster (first run only)..."
    mkdir -p "$DEVSTACK/pg"
    "$PG_BIN/initdb" -D "$DEVSTACK/pg" -U "$(whoami)" --encoding=UTF8 >"$LOGDIR/initdb.log" 2>&1 \
      || { err "initdb failed, see .devstack/logs/initdb.log"; exit 1; }
    NEW_CLUSTER=1
  fi
  info "Starting Postgres 16 (:$PG_PORT)..."
  "$PG_BIN/pg_ctl" -D "$DEVSTACK/pg" -o "-p $PG_PORT" -l "$DEVSTACK/pg.log" start >/dev/null
  wait_port "$PG_PORT" Postgres 30 || { err "Postgres did not start, see .devstack/pg.log"; exit 1; }
  if [ "${NEW_CLUSTER:-0}" = "1" ]; then
    info "Creating the lableit role and database..."
    "$PG_BIN/psql" -p "$PG_PORT" -d postgres -v ON_ERROR_STOP=1 \
      -c "CREATE ROLE lableit LOGIN PASSWORD 'lableit' SUPERUSER;" \
      -c "CREATE DATABASE lableit OWNER lableit;" >>"$LOGDIR/initdb.log" 2>&1 \
      || { err "Could not create the lableit role/database, see .devstack/logs/initdb.log"; exit 1; }
  fi
else
  err "PostgreSQL 16 not found. Install with: brew install postgresql@16"; exit 1
fi

# 2. Redis --------------------------------------------------------------------
if port_up "$REDIS_PORT"; then
  ok "Redis already running (:$REDIS_PORT)"
elif command -v redis-server >/dev/null 2>&1; then
  info "Starting Redis (:$REDIS_PORT)..."
  redis-server --port "$REDIS_PORT" --daemonize yes --logfile "$LOGDIR/redis.log" >/dev/null
  wait_port "$REDIS_PORT" Redis 20 || exit 1
else
  err "redis-server not found. Install with: brew install redis"; exit 1
fi

# 3. MinIO --------------------------------------------------------------------
if port_up "$MINIO_PORT"; then
  ok "MinIO already running (:$MINIO_PORT)"
else
  # Prefer a binary vendored in .devstack, else one on PATH (brew install
  # minio/stable/minio). MinIO no longer serves direct binary downloads, so this
  # asks rather than fetching from a URL that can disappear.
  MINIO_BIN=""
  if [ -x "$DEVSTACK/bin/minio" ]; then
    MINIO_BIN="$DEVSTACK/bin/minio"
  elif command -v minio >/dev/null 2>&1; then
    MINIO_BIN="$(command -v minio)"
  else
    err "MinIO not found. Install it with: brew install minio/stable/minio"
    err "(or put a minio binary at .devstack/bin/minio), then run this again."
    exit 1
  fi
  info "Starting MinIO (:$MINIO_PORT, console :$MINIO_CONSOLE)..."
  MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD=minioadmin \
    "$MINIO_BIN" server "$DEVSTACK/minio" \
    --address ":$MINIO_PORT" --console-address ":$MINIO_CONSOLE" \
    >"$LOGDIR/minio.log" 2>&1 &
  MINIO_PID=$!
  wait_port "$MINIO_PORT" MinIO 20 || { err "MinIO did not start, see .devstack/logs/minio.log"; exit 1; }
fi

# The API uploads into this bucket; create it once. mc is optional, so fall back
# to MinIO's own filesystem layout, where a bucket is just a directory.
mkdir -p "$DEVSTACK/minio/lableit"

# 4. Database schema ----------------------------------------------------------
info "Applying database migrations..."
( cd "$SCRIPT_DIR/apps/api" && bunx prisma generate >>"$LOGDIR/prisma.log" 2>&1 \
  && bunx prisma migrate deploy >>"$LOGDIR/prisma.log" 2>&1 ) \
  || { err "Prisma setup failed, see .devstack/logs/prisma.log"; exit 1; }

# 5. App services -------------------------------------------------------------
info "Starting API (:$API_PORT)..."
( cd "$SCRIPT_DIR" && bun run dev:api ) >"$LOGDIR/api.log" 2>&1 &

info "Starting Inference (:$INFER_PORT) - SAM3 model load takes ~20-30s..."
# Use "python -m uvicorn": the venv's uvicorn launcher script hardcodes the
# path the venv was created at, so it breaks if the project folder moved.
if [ -x "$SCRIPT_DIR/apps/inference/.venv/bin/python" ]; then
  ( cd "$SCRIPT_DIR/apps/inference" && \
    ./.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port "$INFER_PORT" ) \
    >"$LOGDIR/inference.log" 2>&1 &
else
  err "Inference venv missing. Run: cd apps/inference && bash setup_mac.sh"
fi

info "Starting Web (:$WEB_PORT)..."
( cd "$SCRIPT_DIR" && bun run dev:web ) >"$LOGDIR/web.log" 2>&1 &

# Wait for readiness (web/API are quick; inference waits on SAM3) -------------
FAILED=""
wait_port "$API_PORT"   API       60  || FAILED="$FAILED api"
wait_port "$WEB_PORT"   Web       60  || FAILED="$FAILED web"
wait_port "$INFER_PORT" Inference 150 || FAILED="$FAILED inference"

echo
if [ -z "$FAILED" ]; then
  ok "=== Lableit is running ==="
else
  err "=== Some services did not start:$FAILED ==="
  for svc in $FAILED; do
    err "  last lines of .devstack/logs/$svc.log:"
    tail -5 "$LOGDIR/$svc.log" 2>/dev/null | sed 's/^/    /'
  done
  echo
fi
echo "  Web app      http://localhost:$WEB_PORT"
echo "  API health   http://localhost:$API_PORT/health"
echo "  Inference    http://localhost:$INFER_PORT/docs"
echo "  MinIO admin  http://localhost:$MINIO_CONSOLE  (minioadmin / minioadmin)"
echo
info "Logs: .devstack/logs/   |   Press Ctrl+C in this window to stop everything."
# Only open the browser when the web app is actually up.
case "$FAILED" in *web*) ;; *) open "http://localhost:$WEB_PORT" 2>/dev/null || true ;; esac

# Stream app logs so this window stays live; Ctrl+C triggers cleanup.
tail -f "$LOGDIR/api.log" "$LOGDIR/web.log" "$LOGDIR/inference.log" &
wait
