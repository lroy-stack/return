#!/usr/bin/env bash
# Off-account copy of production D1 (read-only export). Output: backups/return-db-<UTC date>.sql (git-ignored).
# Optional file sync: RCLONE_REMOTE=r2ro ./scripts/backup-offsite.sh  (see docs/operations.md section 4).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
out="backups/return-db-$(date -u +%F).sql"
pnpm exec wrangler d1 export return-db --remote --output="$out"
chmod 600 "$out"
echo "D1 export: $out ($(wc -c <"$out" | tr -d ' ') bytes)"
if [ -n "${RCLONE_REMOTE:-}" ]; then
  # Read-only R2 token: copy, never sync --delete into the source. Local mirror only.
  rclone sync "${RCLONE_REMOTE}:return-files" backups/files --fast-list
  echo "R2 files mirrored to backups/files"
else
  echo "RCLONE_REMOTE not set: skipped the R2 file mirror."
fi
