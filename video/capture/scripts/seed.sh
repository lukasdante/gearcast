#!/usr/bin/env bash
# Seeds a fresh local state dir (called by up.sh when there is no state, and by reset.sh). LOCAL ONLY: every wrangler
# call below uses --local --persist-to video/capture/.state with the capture config (fake D1/R2 ids).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
WRANGLER="$ROOT/worker/node_modules/.bin/wrangler"
STATE="${CAPTURE_STATE:-$HERE/.state}"
GEN="$HERE/.gen"
W=("$WRANGLER" --cwd "$HERE")
mkdir -p "$GEN/acct/scripts" "$STATE" "$HERE/.cache"

# 1. schema
"${W[@]}" d1 execute DB -c "$HERE/wrangler.jsonc" --local --persist-to "$STATE" --file "$ROOT/worker/schema.sql" > /dev/null

# 2. accounts (easy demo passwords). The script runs from a copy so it writes .gen/.accounts and
#    .gen/acct/.wrangler/accounts.sql instead of touching the repo's .accounts / worker/.wrangler.
cp "$ROOT/worker/scripts/make_accounts.mjs" "$GEN/acct/scripts/make_accounts.mjs"
node "$GEN/acct/scripts/make_accounts.mjs" > /dev/null
"${W[@]}" d1 execute DB -c "$HERE/wrangler.jsonc" --local --persist-to "$STATE" --file "$GEN/acct/.wrangler/accounts.sql" > /dev/null

# 3. plants (default layout + demo Plant 2) and empty story tables
node "$HERE/scripts/gen_seed.mjs" > /dev/null
"${W[@]}" d1 execute DB -c "$HERE/wrangler.jsonc" --local --persist-to "$STATE" --file "$GEN/seed.sql" > /dev/null

# 4. built-in knowledge-base vectors into LOCAL R2 (search ranks against this copy; no Vectorize involved).
#    Downloaded once from production R2 (read-only GET) and cached in .cache/.
KEY="index/builtin-$(node -e "const c=require('$ROOT/worker/src/generated/corpus.json');process.stdout.write(c.version+'-'+c.chunks.length)").f32"
F="$HERE/.cache/$(basename "$KEY")"
if [ ! -s "$F" ]; then
  echo "fetching $KEY from production R2 (read-only)"
  (cd "$ROOT/worker" && "$WRANGLER" r2 object get "gearcast-files/$KEY" --remote --file "$F" > /dev/null)
fi
"${W[@]}" r2 object put "gearcast-capture-files/$KEY" -c "$HERE/wrangler.jsonc" --local --persist-to "$STATE" --file "$F" > /dev/null
echo "seeded $STATE (schema, 8 accounts, plants default + plant-2, KB vectors)"
