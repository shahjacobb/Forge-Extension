#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/docs/shots"
mkdir -p "$OUT"

CHROME="${CHROME:-/opt/google/chrome/google-chrome}"
BASE="${BASE:-http://127.0.0.1:5173}"
DOCS="${DOCS:-http://127.0.0.1:5174}"

shot() {
  local name="$1"
  local url="$2"
  local width="$3"
  local height="$4"
  "$CHROME" \
    --headless=new \
    --disable-gpu \
    --hide-scrollbars \
    --no-sandbox \
    --disable-dev-shm-usage \
    --no-first-run \
    --no-default-browser-check \
    --user-data-dir="/tmp/still-chrome-docs-$name" \
    --force-device-scale-factor=2 \
    --window-size="$width,$height" \
    --virtual-time-budget=8000 \
    --screenshot="$OUT/$name.png" \
    "$url" >/dev/null
  echo "wrote $OUT/$name.png"
}

shot banner "$DOCS/docs/banners/moment.html" 1600 720
shot timer "$BASE/popup.html?shot=1&view=timer" 380 620
shot running "$BASE/popup.html?shot=1&view=timer&running=1" 380 620
shot activity "$BASE/popup.html?shot=1&view=activity" 380 620
shot month "$BASE/popup.html?shot=1&view=activity&range=month" 380 620
shot settings "$BASE/popup.html?shot=1&view=settings" 380 620
shot complete "$BASE/popup.html?shot=1&view=timer&modal=1" 380 620
