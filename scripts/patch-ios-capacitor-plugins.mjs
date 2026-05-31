#!/usr/bin/env node
/**
 * cap sync ios only registers npm plugins in packageClassList.
 * Local Swift plugins in ios/App/App must be appended or they never load.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, "../ios/App/App/capacitor.config.json");
const LOCAL_PLUGINS = ["NowPlayingPlugin", "StoryCameraPlugin", "AuthVaultPlugin"];

if (!fs.existsSync(configPath)) {
  console.error("patch-ios-capacitor-plugins: missing", configPath);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const merged = [...new Set([...(config.packageClassList || []), ...LOCAL_PLUGINS])];
config.packageClassList = merged;
fs.writeFileSync(configPath, JSON.stringify(config, null, "\t") + "\n");
console.log("patch-ios-capacitor-plugins: packageClassList =", merged.join(", "));
