#!/usr/bin/env bash
# Restore drill WITHOUT touching production: apply a production export to a throwaway LOCAL D1 and count rows.
# Usage: scripts/restore-drill.sh [backups/return-db-YYYY-MM-DD.sql]   (default: export now, read-only)
set -euo pipefail
cd "$(dirname "$0")/.."
start=$(date +%s)
sql="${1:-}"
if [ -z "$sql" ]; then
  mkdir -p backups
  sql="backups/drill-$(date -u +%FT%H%M%SZ).sql"
  pnpm exec wrangler d1 export return-db --remote --output="$sql" >/dev/null
fi
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
w() { pnpm exec wrangler d1 execute DB --local --persist-to "$scratch" "$@"; }
# The export contains schema + data (and d1_migrations), so it restores into an empty database as-is.
w --file "$sql" >/dev/null
q() { w --json --command "$1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s)[0].results[0];console.log(Object.values(r)[0])})'; }
echo "export:        $sql"
echo "owners:        $(q 'SELECT count(*) FROM owners')"
echo "items:         $(q 'SELECT count(*) FROM items')"
echo "tags:          $(q 'SELECT count(*) FROM tags')"
echo "tags w/ token: $(q "SELECT count(*) FROM tags WHERE token IS NOT NULL AND token <> ''")"
echo "conversations: $(q 'SELECT count(*) FROM conversations')"
echo "messages:      $(q 'SELECT count(*) FROM messages')"
echo "migrations:    $(q 'SELECT count(*) FROM d1_migrations')"
echo "fk violations: $(q 'SELECT count(*) FROM pragma_foreign_key_check')"
echo "duration:      $(( $(date +%s) - start )) s"
