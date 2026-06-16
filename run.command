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

cleanup() {
  echo
  info "Shutting down Lableit..."
  for p in "$API_PORT" "$WEB_PORT" "$INFER_PORT"; do
    lsof -ti tcp:"$p" 2>/dev/null | xargs kill 2>/dev/null
  done
  [ -n "$MINIO_PID" ] && kill "$MINIO_PID" 2>/dev/null
  redis-cli -p "$REDIS_PORT" shutdown nosave >/dev/null 2>&1
  [ -n "$PG_BIN" ] && "$PG_BIN/pg_ctl" -D "$DEVSTACK/pg" stop -m fast >/dev/null 2>&1
  ok "All services stopped."
  exit 0
}
trap cleanup INT TERM

info "=== Lableit launcher ==="

# 1. Postgres -----------------------------------------------------------------
if port_up "$PG_PORT"; then
  ok "Postgres already running (:$PG_PORT)"
elif [ -n "$PG_BIN" ]; then
  info "Starting Postgres 16 (:$PG_PORT)..."
  "$PG_BIN/pg_ctl" -D "$DEVSTACK/pg" -o "-p $PG_PORT" -l "$DEVSTACK/pg.log" start >/dev/null
  wait_port "$PG_PORT" Postgres 30 || exit 1
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
elif [ -x "$DEVSTACK/bin/minio" ]; then
  info "Starting MinIO (:$MINIO_PORT, console :$MINIO_CONSOLE)..."
  MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD=minioadmin \
    "$DEVSTACK/bin/minio" server "$DEVSTACK/minio" \
    --address ":$MINIO_PORT" --console-address ":$MINIO_CONSOLE" \
    >"$LOGDIR/minio.log" 2>&1 &
  MINIO_PID=$!
  wait_port "$MINIO_PORT" MinIO 20 || exit 1
else
  err "MinIO binary missing at .devstack/bin/minio"; exit 1
fi

# 4. App services -------------------------------------------------------------
info "Starting API (:$API_PORT)..."
( cd "$SCRIPT_DIR" && bun run dev:api ) >"$LOGDIR/api.log" 2>&1 &

info "Starting Inference (:$INFER_PORT) - SAM3 model load takes ~20-30s..."
if [ -x "$SCRIPT_DIR/apps/inference/.venv/bin/uvicorn" ]; then
  ( cd "$SCRIPT_DIR/apps/inference" && \
    ./.venv/bin/uvicorn main:app --host 0.0.0.0 --port "$INFER_PORT" ) \
    >"$LOGDIR/inference.log" 2>&1 &
else
  err "Inference venv missing. Run: cd apps/inference && bash setup_mac.sh"
fi

info "Starting Web (:$WEB_PORT)..."
( cd "$SCRIPT_DIR" && bun run dev:web ) >"$LOGDIR/web.log" 2>&1 &

# Wait for readiness (web/API are quick; inference waits on SAM3) -------------
wait_port "$API_PORT"   API       60  || true
wait_port "$WEB_PORT"   Web       60  || true
wait_port "$INFER_PORT" Inference 150 || true

echo
ok "=== Lableit is running ==="
echo "  Web app      http://localhost:$WEB_PORT"
echo "  API health   http://localhost:$API_PORT/health"
echo "  Inference    http://localhost:$INFER_PORT/docs"
echo "  MinIO admin  http://localhost:$MINIO_CONSOLE  (minioadmin / minioadmin)"
echo
info "Logs: .devstack/logs/   |   Press Ctrl+C in this window to stop everything."
open "http://localhost:$WEB_PORT" 2>/dev/null || true

# Stream app logs so this window stays live; Ctrl+C triggers cleanup.
tail -f "$LOGDIR/api.log" "$LOGDIR/web.log" "$LOGDIR/inference.log" &
wait
