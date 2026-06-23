#!/usr/bin/env node
/**
 * Mirror shipped web assets into www/ before Capacitor copies them to ios/App/App/public.
 * iOS loads www/, not repo-root index.html or src/ directly.
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const copies = [
  ["index.html", "index.html"],
  ["styles.css", "styles.css"],
];

for (const [from, to] of copies) {
  const src = path.join(root, from);
  const dest = path.join(root, "www", to);
  if (!fs.existsSync(src)) {
    console.error(`sync-www: missing ${from}`);
    process.exit(1);
  }
  fs.copyFileSync(src, dest);
  console.log(`sync-www: ${from} → www/${to}`);
}

for (const worker of ["OneSignalSDKWorker.js", "OneSignalSDKUpdaterWorker.js"]) {
  const src = path.join(root, worker);
  const dest = path.join(root, "www", worker);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`sync-www: ${worker} → www/${worker}`);
  }
}

execSync("rsync -a src/ www/src/", { cwd: root, stdio: "inherit" });
console.log("sync-www: src/ → www/src/");

const splashAssets = path.join(root, "assets", "splash");
const wwwSplashAssets = path.join(root, "www", "assets", "splash");
if (fs.existsSync(splashAssets)) {
  fs.mkdirSync(path.join(root, "www", "assets"), { recursive: true });
  execSync(`rsync -a assets/splash/ www/assets/splash/`, { cwd: root, stdio: "inherit" });
  console.log("sync-www: assets/splash/ → www/assets/splash/");
}

const discoverAssets = path.join(root, "assets", "discover");
const wwwDiscoverAssets = path.join(root, "www", "assets", "discover");
if (fs.existsSync(discoverAssets)) {
  fs.mkdirSync(path.join(root, "www", "assets"), { recursive: true });
  execSync(`rsync -a assets/discover/ www/assets/discover/`, { cwd: root, stdio: "inherit" });
  console.log("sync-www: assets/discover/ → www/assets/discover/");
}
