#!/bin/sh
set -eu

: "${BOT_TOKEN:?BOT_TOKEN is required}"
: "${SUPER_ADMIN_TELEGRAM_ID:?SUPER_ADMIN_TELEGRAM_ID is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"

FRONTEND_URL="${FRONTEND_URL:-http://frontend/}"
BACKEND_URL="${BACKEND_URL:-http://backend:5000/}"
POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
CHECK_INTERVAL="${MONITOR_INTERVAL_SECONDS:-60}"
HEARTBEAT_MINUTES="${MONITOR_HEARTBEAT_MINUTES:-60}"
HEARTBEAT_SECONDS=$((HEARTBEAT_MINUTES * 60))
STARTUP_GRACE_SECONDS="${MONITOR_STARTUP_GRACE_SECONDS:-90}"

last_failure=""
last_heartbeat=$(date +%s)
started_at="$last_heartbeat"

log() {
  printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"
}

send_telegram() {
  message="$1"
  if ! curl --silent --show-error --fail --max-time 15 \
    --request POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${SUPER_ADMIN_TELEGRAM_ID}" \
    --data-urlencode "text=${message}" \
    --data-urlencode "disable_web_page_preview=true" \
    >/dev/null; then
    log "telegram notification failed"
    return 1
  fi
}

check_frontend() {
  curl --silent --show-error --fail --connect-timeout 5 --max-time 10 \
    "$FRONTEND_URL" >/dev/null 2>&1
}

check_backend() {
  curl --silent --show-error --fail --connect-timeout 5 --max-time 10 \
    "$BACKEND_URL" >/dev/null 2>&1
}

check_database() {
  PGPASSWORD="$POSTGRES_PASSWORD" psql \
    --no-psqlrc \
    --quiet \
    --tuples-only \
    --no-align \
    --set=ON_ERROR_STOP=1 \
    --host="$POSTGRES_HOST" \
    --port="$POSTGRES_PORT" \
    --username="$POSTGRES_USER" \
    --dbname="$POSTGRES_DB" \
    --command='SELECT 1' \
    >/dev/null 2>&1
}

run_check() {
  failed=""

  check_frontend || failed="${failed} frontend"
  check_backend || failed="${failed} backend"
  check_database || failed="${failed} database"

  printf '%s' "$failed"
}

log "monitor started: frontend=${FRONTEND_URL}, backend=${BACKEND_URL}, database=${POSTGRES_HOST}:${POSTGRES_PORT}"
send_telegram "✅ Production monitor запущен. Проверяю frontend, backend и базу данных раз в минуту." || true

while true; do
  now=$(date +%s)
  failed=$(run_check)

  if [ -n "$failed" ]; then
    if [ $((now - started_at)) -lt "$STARTUP_GRACE_SECONDS" ]; then
      log "startup grace period, temporarily unavailable:${failed}"
    elif [ "$failed" != "$last_failure" ]; then
      log "check failed:${failed}"
      send_telegram "🚨 Production: недоступны:${failed}. Проверка продолжится через ${CHECK_INTERVAL} сек." || true
      last_failure="$failed"
    else
      log "still unavailable:${failed}"
    fi
  else
    if [ -n "$last_failure" ]; then
      log "all services recovered"
      send_telegram "✅ Production: frontend, backend и база данных снова доступны." || true
      last_failure=""
    fi

    if [ $((now - last_heartbeat)) -ge "$HEARTBEAT_SECONDS" ]; then
      log "all checks passed"
      send_telegram "✅ Production monitor работает: frontend, backend и база данных доступны. Продолжаю проверку раз в минуту." || true
      last_heartbeat="$now"
    fi
  fi

  sleep "$CHECK_INTERVAL"
done
