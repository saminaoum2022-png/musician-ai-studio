#!/bin/sh
# Capture App Store screenshots from the iOS Simulator with demo usernames.
# Enables screenshot mode (?screenshot=1) which swaps real @handles for fake ones.
#
# Usage: sh scripts/capture-app-screenshots.sh
# Output: assets/marketing/app-store-screenshots/*.png
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$REPO_ROOT/assets/marketing/app-store-screenshots"
SIM_NAME="${IOS_SIM_NAME:-iPhone 17 Pro}"
BUNDLE_ID="com.nabadai.music"
export NABAD_SCREENSHOT_MODE=1

mkdir -p "$OUT_DIR"

SIM_ID=$(xcrun simctl list devices available | grep -m1 "$SIM_NAME (" | sed -E 's/.*\(([0-9A-F-]+)\).*/\1/')
if [ -z "$SIM_ID" ]; then
  echo "capture-screenshots: ERROR — simulator '$SIM_NAME' not found" >&2
  exit 1
fi

cd "$REPO_ROOT"
echo "capture-screenshots: syncing www (screenshot mode) + building for $SIM_NAME"
npm run sync:www
sh ios/App/scripts/run-ios-sim.sh

sleep 5

open_route() {
  hash="$1"
  xcrun simctl openurl "$SIM_ID" "com.nabadai.music://capture?screenshot=1#${hash}"
}

fetch_top_track_id() {
  curl -fsS "https://www.nabadai.com/api/social?type=weekly_chart" 2>/dev/null \
    | node -e "
const fs = require('fs');
const d = JSON.parse(fs.readFileSync(0, 'utf8'));
const id = String(d?.chart?.[0]?.songId || '').trim();
if (!id) process.exit(1);
process.stdout.write(id);
" 2>/dev/null || true
}

capture() {
  name="$1"
  wait_s="${2:-3}"
  sleep "$wait_s"
  out="$OUT_DIR/${name}.png"
  xcrun simctl io "$SIM_ID" screenshot "$out"
  echo "capture-screenshots: wrote $out"
}

echo "capture-screenshots: enabling screenshot mode + capturing routes"

open_route "/discover"
capture "01-discover" 5

open_route "/challenges"
capture "02-create-hub" 4

open_route "/generate"
capture "08-generate-song" 5

open_route "/messages-thread?thread=nabad-coach"
capture "09-nabad-coach" 5

TRACK_ID="$(fetch_top_track_id)"
if [ -n "$TRACK_ID" ]; then
  echo "capture-screenshots: opening song player for track $TRACK_ID"
  open_route "/player?track=${TRACK_ID}"
  capture "10-song-player" 6
else
  echo "capture-screenshots: WARN — could not fetch a public track id; skipping song player" >&2
fi

open_route "/profile"
capture "03-profile" 4

open_route "/activity"
capture "04-activity" 4

open_route "/friends"
capture "05-friends" 4

open_route "/sounds"
capture "06-sounds" 4

open_route "/settings"
capture "07-settings" 3

echo "capture-screenshots: done — $OUT_DIR"
