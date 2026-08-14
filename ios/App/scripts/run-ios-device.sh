#!/bin/sh
# Build, install, and launch on the connected iPhone WITHOUT the Xcode debugger (avoids "Attaching…" hang on iOS 26).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
IOS_DIR="$REPO_ROOT/ios/App"
DEVICE_ID="${IOS_DEVICE_ID:-00008150-001C5D9C3480401C}"
BUNDLE_ID="com.nabadai.music"

cd "$REPO_ROOT"
npm run sync:ios

cd "$IOS_DIR"
echo "run-ios-device: building for device (prefer id=$DEVICE_ID)"
if ! xcodebuild -scheme App -configuration Debug -destination "id=$DEVICE_ID" -allowProvisioningUpdates build 2>&1 | tail -8; then
  echo "run-ios-device: device-specific build failed — building generic iphoneos (phone can be offline during build)"
  xcodebuild -scheme App -configuration Debug -destination "generic/platform=iOS" -allowProvisioningUpdates build 2>&1 | tail -8
fi

APP_PATH=$(find "$HOME/Library/Developer/Xcode/DerivedData" -path "*/Build/Products/Debug-iphoneos/App.app" -not -path "*/Index.noindex/*" 2>/dev/null | head -1)
if [ -z "$APP_PATH" ] || [ ! -d "$APP_PATH" ]; then
  echo "run-ios-device: ERROR — could not find App.app in DerivedData" >&2
  exit 1
fi

echo "run-ios-device: checking that iPhone is connected for install…"
if ! xcrun devicectl device install app --device "$DEVICE_ID" "$APP_PATH" 2>&1; then
  echo "" >&2
  echo "run-ios-device: ERROR — Mac cannot see your iPhone for install." >&2
  echo "  • Plug iPhone into this Mac with a data cable" >&2
  echo "  • Unlock the phone and tap Trust This Computer" >&2
  echo "  • Leave it on the home screen, then run: npm run run:ios:staging" >&2
  echo "  • Staging build is ready at: $APP_PATH" >&2
  exit 70
fi

echo "run-ios-device: launching $BUNDLE_ID (no debugger)"
xcrun devicectl device process launch --device "$DEVICE_ID" "$BUNDLE_ID"
echo "run-ios-device: done — app should be open on your iPhone"
