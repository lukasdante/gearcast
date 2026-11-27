#!/usr/bin/env bash
# Stops the capture server started by up.sh (state is kept).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIDF="${CAPTURE_STATE:-$HERE/.state}.pid"
if [ -f "$PIDF" ]; then
  pid="$(cat "$PIDF")"
  if kill -0 "$pid" 2>/dev/null; then
    pkill -TERM -P "$pid" 2>/dev/null; kill -TERM "$pid" 2>/dev/null
    for i in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
    kill -KILL "$pid" 2>/dev/null
  fi
  rm -f "$PIDF"
fi
# workerd children that outlived wrangler (bound to our persist dir)
pkill -f "workerd.*video/capture" 2>/dev/null || true
echo "capture server stopped"
