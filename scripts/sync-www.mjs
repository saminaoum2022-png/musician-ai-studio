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

const brandRootFiles = [
  "manifest.webmanifest",
  "favicon.ico",
  "favicon-48x48.png",
  "favicon-96x96.png",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
];
for (const name of brandRootFiles) {
  const src = path.join(root, name);
  const dest = path.join(root, "www", name);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`sync-www: ${name} → www/${name}`);
  }
}

const brandIconFiles = ["icon-192.png", "icon-512.png", "apple-touch-icon.png"];
for (const name of brandIconFiles) {
  const src = path.join(root, "assets", "icons", name);
  const dest = path.join(root, "www", "assets", "icons", name);
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log(`sync-www: assets/icons/${name} → www/assets/icons/${name}`);
  }
}

execSync("rsync -a src/ www/src/", { cwd: root, stdio: "inherit" });
console.log("sync-www: src/ → www/src/");

function copyNativePushVendor() {
  const capSrc = path.join(root, "node_modules/@capacitor/core/dist/index.js");
  const osSrc = path.join(root, "node_modules/@onesignal/capacitor-plugin/dist/index.js");
  if (!fs.existsSync(capSrc) || !fs.existsSync(osSrc)) return;

  const capDest = path.join(root, "www/vendor/capacitor-core/index.js");
  const osDest = path.join(root, "www/vendor/onesignal/index.js");
  fs.mkdirSync(path.dirname(capDest), { recursive: true });
  fs.mkdirSync(path.dirname(osDest), { recursive: true });
  fs.copyFileSync(capSrc, capDest);

  let osCode = fs.readFileSync(osSrc, "utf8");
  osCode = osCode.replace(
    'import { registerPlugin } from "@capacitor/core";',
    'import { registerPlugin } from "../../vendor/capacitor-core/index.js";',
  );
  fs.writeFileSync(osDest, osCode);
  console.log("sync-www: native push vendor → www/vendor/");
}

copyNativePushVendor();

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
