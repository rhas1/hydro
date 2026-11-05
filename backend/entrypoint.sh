#!/bin/sh
set -e
# Apply database migrations before starting (set RUN_MIGRATIONS=0 to skip,
# e.g. when migrations run as a separate Cloud Run job).
if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  alembic upgrade head
fi
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips='*'
