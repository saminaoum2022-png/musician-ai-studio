#!/bin/sh
# Build, install, and launch on an iOS Simulator (for previewing changes before
# shipping to the physical device). Mirrors run-ios-device.sh but targets a sim.
# Override the target with: IOS_SIM_NAME="iPhone 17 Pro" sh run-ios-sim.sh
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
IOS_DIR="$REPO_ROOT/ios/App"
SIM_NAME="${IOS_SIM_NAME:-iPhone 17 Pro}"
BUNDLE_ID="com.nabadai.music"

SIM_ID=$(xcrun simctl list devices available | grep -m1 "$SIM_NAME (" | sed -E 's/.*\(([0-9A-F-]+)\).*/\1/')
if [ -z "$SIM_ID" ]; then
  echo "run-ios-sim: ERROR — simulator '$SIM_NAME' not found" >&2
  exit 1
fi
echo "run-ios-sim: using $SIM_NAME ($SIM_ID)"

cd "$REPO_ROOT"
npm run sync:ios

echo "run-ios-sim: booting simulator"
xcrun simctl boot "$SIM_ID" 2>/dev/null || true
open -a Simulator

cd "$IOS_DIR"
echo "run-ios-sim: building for simulator"
xcodebuild -scheme App -configuration Debug -destination "platform=iOS Simulator,id=$SIM_ID" build | tail -5

APP_PATH=$(find "$HOME/Library/Developer/Xcode/DerivedData" -path "*/Build/Products/Debug-iphonesimulator/App.app" -not -path "*/Index.noindex/*" 2>/dev/null | head -1)
if [ -z "$APP_PATH" ] || [ ! -d "$APP_PATH" ]; then
  echo "run-ios-sim: ERROR — could not find App.app in DerivedData" >&2
  exit 1
fi
echo "run-ios-sim: installing $APP_PATH"
xcrun simctl install "$SIM_ID" "$APP_PATH"
echo "run-ios-sim: launching $BUNDLE_ID"
xcrun simctl launch "$SIM_ID" "$BUNDLE_ID"
echo "run-ios-sim: done — app should be open in the Simulator"
