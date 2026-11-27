#!/usr/bin/env bash
# GearCast capture environment: builds the app and starts a LOCAL wrangler dev on a fixed port.
#   video/capture/up.sh             build app (into video/capture/.dist) + seed if no state yet + start server
#   video/capture/up.sh --no-build  start with the existing build
# Local D1/R2 state lives in video/capture/.state (git-ignored). Production D1/R2/Vectorize are never bound
# (see wrangler.jsonc). Logs: video/capture/.state/wrangler.log. Stop with video/capture/down.sh.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PORT="${CAPTURE_PORT:-8790}"
INSPECTOR_PORT="${CAPTURE_INSPECTOR_PORT:-9240}"
WRANGLER="$ROOT/worker/node_modules/.bin/wrangler"
STATE="${CAPTURE_STATE:-$HERE/.state}"
PIDF="${CAPTURE_STATE:-$HERE/.state}.pid"
cd "$HERE"

build=1
for a in "$@"; do case "$a" in --no-build) build=0 ;; *) echo "unknown option $a" >&2; exit 2 ;; esac; done

if [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null; then
  echo "capture server already running (pid $(cat "$PIDF")) on http://127.0.0.1:$PORT"; exit 0
fi
if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/api/health" 2>/dev/null; then
  echo "port $PORT is already serving something else; set CAPTURE_PORT or stop it" >&2; exit 1
fi

# secrets for local dev: DeepSeek key + cookie secret from worker/.dev.vars (never printed). ADMIN_TOKEN is left out,
# so /api/admin/seed (which would try to upsert Vectorize) answers 403 here.
[ -f "$ROOT/worker/.dev.vars" ] || { echo "worker/.dev.vars missing (needs DEEPSEEK_API_KEY, AUTH_SECRET)" >&2; exit 1; }
grep -E '^(DEEPSEEK_API_KEY|AUTH_SECRET)=' "$ROOT/worker/.dev.vars" > "$HERE/.dev.vars"
echo 'DEV_MODE=1' >> "$HERE/.dev.vars"
chmod 600 "$HERE/.dev.vars"

if [ "$build" = 1 ] || [ ! -f "$HERE/.dist/index.html" ]; then
  echo "building app -> video/capture/.dist"
  (cd "$ROOT/app" && npx vite build --outDir "$HERE/.dist" --emptyOutDir --logLevel warn)
fi

if [ ! -d "$STATE/v3/d1" ]; then "$HERE/scripts/seed.sh"; fi

mkdir -p "$STATE"
echo "starting wrangler dev on :$PORT"
nohup "$WRANGLER" dev -c "$HERE/wrangler.jsonc" --persist-to "$STATE" --ip 127.0.0.1 --port "$PORT" \
  --inspector-port "$INSPECTOR_PORT" --show-interactive-dev-session=false > "$STATE/wrangler.log" 2>&1 &
echo $! > "$PIDF"
for i in $(seq 1 120); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" > "$HERE/.health.json" 2>/dev/null; then
    echo "up: http://127.0.0.1:$PORT  health: $(cat "$HERE/.health.json")"; exit 0
  fi
  if ! kill -0 "$(cat "$PIDF")" 2>/dev/null; then echo "wrangler exited; see $STATE/wrangler.log" >&2; tail -30 "$STATE/wrangler.log" >&2; exit 1; fi
  sleep 1
done
echo "server did not answer /api/health in 120 s; see $STATE/wrangler.log" >&2; exit 1
