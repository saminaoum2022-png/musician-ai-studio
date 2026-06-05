#!/usr/bin/env node
/**
 * cap sync ios only registers npm plugins in packageClassList.
 * Local Swift plugins in ios/App/App must be appended or they never load.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const configPath = path.join(root, "ios/App/App/capacitor.config.json");
const LOCAL_PLUGINS = ["NowPlayingPlugin", "StoryCameraPlugin", "AuthVaultPlugin"];

/** @capacitor-community/apple-sign-in 7.x still pins capacitor-swift-pm 7.x in Package.swift. */
function patchAppleSignInSwiftPm() {
  const pkgPath = path.join(
    root,
    "node_modules/@capacitor-community/apple-sign-in/Package.swift"
  );
  if (!fs.existsSync(pkgPath)) {
    console.warn("patch-ios-capacitor-plugins: apple-sign-in Package.swift not found, skipping");
    return;
  }
  const before = fs.readFileSync(pkgPath, "utf8");
  const after = before.replace(
    /capacitor-swift-pm\.git", from: "7\.0\.0"/,
    'capacitor-swift-pm.git", from: "8.0.0"'
  );
  if (after === before) {
    console.warn("patch-ios-capacitor-plugins: apple-sign-in Package.swift already patched or unexpected format");
    return;
  }
  fs.writeFileSync(pkgPath, after);
  console.log("patch-ios-capacitor-plugins: patched apple-sign-in Package.swift for Capacitor 8 SPM");
}

if (!fs.existsSync(configPath)) {
  console.error("patch-ios-capacitor-plugins: missing", configPath);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const merged = [...new Set([...(config.packageClassList || []), ...LOCAL_PLUGINS])];
config.packageClassList = merged;
fs.writeFileSync(configPath, JSON.stringify(config, null, "\t") + "\n");
console.log("patch-ios-capacitor-plugins: packageClassList =", merged.join(", "));

patchAppleSignInSwiftPm();
