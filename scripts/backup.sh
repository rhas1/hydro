#!/bin/sh
# Dumps the Hydro database to backups/hydro-<timestamp>.dump and keeps the newest 30.
#   scripts/backup.sh
# Schedule it daily with cron, e.g. (crontab -e):
#   0 21 * * * /path/to/hydro/scripts/backup.sh >> /path/to/hydro/backups/backup.log 2>&1
set -eu
cd "$(dirname "$0")/.."
PATH="$PATH:/usr/local/bin:/opt/homebrew/bin"  # cron has a minimal PATH

mkdir -p backups
file="backups/hydro-$(date +%Y%m%d-%H%M%S).dump"
docker compose exec -T db pg_dump -U hydro -d hydro --format=custom > "$file.tmp"
mv "$file.tmp" "$file"
echo "Saved $file ($(du -h "$file" | cut -f1))"

ls -1t backups/hydro-*.dump | tail -n +31 | while read -r old; do rm -f "$old"; done
