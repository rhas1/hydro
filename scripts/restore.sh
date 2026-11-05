#!/bin/sh
# Replaces ALL data in the Hydro database with a backup made by backup.sh.
#   scripts/restore.sh backups/hydro-20260101-210000.dump
set -eu
[ $# -eq 1 ] && [ -f "$1" ] || { echo "usage: $0 <backup .dump file>" >&2; exit 1; }
dump="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
cd "$(dirname "$0")/.."

printf "This replaces ALL current Hydro data with %s.\nType 'restore' to continue: " "$dump"
read -r answer
[ "$answer" = "restore" ] || { echo "Cancelled."; exit 1; }

docker compose stop app
docker compose exec -T db pg_restore -U hydro -d hydro --clean --if-exists --no-owner < "$dump"
docker compose start app
echo "Restored."
