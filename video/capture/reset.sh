#!/usr/bin/env bash
# Wipes the capture state and reseeds it, then (re)starts the server, so every take starts identical.
#   video/capture/reset.sh            reset + start (no app rebuild)
#   video/capture/reset.sh --build    also rebuild the app
#   video/capture/reset.sh --no-pdfs  skip pre-rendering the historical incident PDFs
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PORT="${CAPTURE_PORT:-8790}"
build=--no-build; pdfs=1
for a in "$@"; do case "$a" in --build) build= ;; --no-pdfs) pdfs=0 ;; *) echo "unknown option $a" >&2; exit 2 ;; esac; done

"$HERE/down.sh" > /dev/null
rm -rf "${CAPTURE_STATE:-$HERE/.state}"
"$HERE/scripts/seed.sh"
"$HERE/up.sh" $build

if [ "$pdfs" = 1 ]; then
  # same as production's seeding step: render the historical incident PDFs once so the first download is instant
  mkdir -p "$HERE/.gen"
  [ -f "$HERE/.gen/seed_pdfs.mjs" ] || (cd "$ROOT/worker" && npx esbuild scripts/seed_pdfs.ts --bundle --platform=node --format=esm \
    --outfile="$HERE/.gen/seed_pdfs.mjs" --log-level=warning)
  # seed_pdfs.mjs reads <root>/.accounts relative to itself: give it the capture accounts
  mkdir -p "$HERE/.gen/pdfroot/x/y" && cp "$HERE/.gen/.accounts" "$HERE/.gen/pdfroot/.accounts"
  cp "$HERE/.gen/seed_pdfs.mjs" "$HERE/.gen/pdfroot/x/y/seed_pdfs.mjs"
  mkdir -p "$HERE/.gen/pdfroot/app/public" && ln -sfn "$ROOT/app/public/forms" "$HERE/.gen/pdfroot/app/public/forms"
  node "$HERE/.gen/pdfroot/x/y/seed_pdfs.mjs" "http://127.0.0.1:$PORT"
fi
echo "reset done: http://127.0.0.1:$PORT"
