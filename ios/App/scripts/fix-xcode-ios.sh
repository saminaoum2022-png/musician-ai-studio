#!/bin/sh
# Reset Xcode attach / SPM glitches (safe to re-run).
set -e
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$REPO_ROOT/ios/App"
echo "fix-xcode-ios: resolve packages"
xcodebuild -scheme App -resolvePackageDependencies >/dev/null
echo "fix-xcode-ios: sync web assets"
cd "$REPO_ROOT"
npm run sync:ios
echo "fix-xcode-ios: done — quit Xcode, reopen ios/App/App.xcodeproj, Clean Build, Run"
