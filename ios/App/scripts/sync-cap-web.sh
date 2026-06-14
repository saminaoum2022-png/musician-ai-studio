#!/bin/sh
# Copy www → ios/App/App/public before every Xcode build (public/ is gitignored).
set -e
REPO_ROOT="$(cd "${SRCROOT}/../.." && pwd)"
cd "$REPO_ROOT"
echo "sync-cap-web: syncing www into ios/App/App/public"
node scripts/sync-www.mjs
npx cap copy ios
node scripts/patch-ios-capacitor-plugins.mjs
test -f "${SRCROOT}/App/public/index.html" || {
  echo "sync-cap-web: ERROR — App/public/index.html missing after cap copy" >&2
  exit 1
}
echo "sync-cap-web: ok ($(wc -c < "${SRCROOT}/App/public/index.html" | tr -d ' ') bytes)"
