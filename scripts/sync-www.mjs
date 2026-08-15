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

execSync("node scripts/inject-marketing-shell.mjs", { cwd: root, stdio: "inherit" });

const copies = [
  ["index.html", "index.html"],
  ["styles.css", "styles.css"],
  ["privacy.html", "privacy.html"],
  ["terms.html", "terms.html"],
  ["support.html", "support.html"],
  ["legal.css", "legal.css"],
  ["home.html", "home.html"],
  ["marketing.css", "marketing.css"],
  ["ai-music-generator.html", "ai-music-generator.html"],
  ["hum-to-song.html", "hum-to-song.html"],
  ["lyrics-to-song.html", "lyrics-to-song.html"],
  ["photo-to-song.html", "photo-to-song.html"],
  ["arabic-ai-music-generator.html", "arabic-ai-music-generator.html"],
];

for (const [from, to] of copies) {
  const src = path.join(root, from);
  const dest = path.join(root, "www", to);
  if (!fs.existsSync(src)) {
    console.error(`sync-www: missing ${from}`);
    process.exit(1);
  }
  fs.copyFileSync(src, dest);
  if (to === "index.html" && process.env.NABAD_SCREENSHOT_MODE === "1") {
    let html = fs.readFileSync(dest, "utf8");
    if (!html.includes('name="nabad-screenshot-mode"')) {
      html = html.replace(
        "<head>",
        '<head>\n    <meta name="nabad-screenshot-mode" content="1" />',
      );
      fs.writeFileSync(dest, html);
      console.log("sync-www: injected nabad-screenshot-mode meta");
    }
  }
  console.log(`sync-www: ${from} → www/${to}`);
}

const seoArabicSrc = path.join(root, "ar");
const seoArabicDest = path.join(root, "www", "ar");
if (fs.existsSync(seoArabicSrc)) {
  fs.mkdirSync(seoArabicDest, { recursive: true });
  execSync("rsync -a --delete ar/ www/ar/", { cwd: root, stdio: "inherit" });
  console.log("sync-www: ar/ → www/ar/");
}

const seoMarketingFiles = [
  "nabadai-social-card.png",
  "seo-hero-device.png",
  "seo-hero-device-source.jpg",
  "seo-hero-player.png",
  "seo-hero-create-flow.png",
  "app-store-screenshots/02-create-hub.png",
  "app-store-screenshots/08-generate-song.png",
  "app-store-screenshots/10-song-player.png",
];
for (const rel of seoMarketingFiles) {
  const src = path.join(root, "assets", "marketing", rel);
  const dest = path.join(root, "www", "assets", "marketing", rel);
  if (!fs.existsSync(src)) continue;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`sync-www: assets/marketing/${rel} → www/assets/marketing/${rel}`);
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

const brandIconFiles = ["icon-192.png", "icon-512.png", "apple-touch-icon.png", "splash-mark.png"];
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

function bundleSupabaseVendor() {
  try {
    execSync("node scripts/bundle-supabase.mjs", { cwd: root, stdio: "inherit" });
  } catch (e) {
    console.warn("sync-www: supabase bundle skipped or failed", e?.message || e);
  }
}

bundleSupabaseVendor();
copyNativePushVendor();

function addJsExtensionsToRelativeImports(code) {
  const withExt = (spec) => (spec.endsWith(".js") ? spec : `${spec}.js`);
  return code
    .replace(/from '(\.\/[^']+)'/g, (_, spec) => `from '${withExt(spec)}'`)
    .replace(/from "(\.\/[^"]+)"/g, (_, spec) => `from "${withExt(spec)}"`)
    .replace(/import\('(\.\/[^']+)'\)/g, (_, spec) => `import('${withExt(spec)}')`);
}

function patchVendorImports(code, fileLabel) {
  let out = code;
  out = out.replaceAll(
    'from "@capacitor/core"',
    'from "../../vendor/capacitor-core/index.js"',
  );
  out = out.replaceAll(
    "from '@capacitor/core'",
    "from '../../vendor/capacitor-core/index.js'",
  );
  out = out.replaceAll(
    'from "@revenuecat/purchases-typescript-internal-esm"',
    'from "../revenuecat-internal/index.js"',
  );
  out = out.replaceAll(
    "from '@revenuecat/purchases-typescript-internal-esm'",
    "from '../revenuecat-internal/index.js'",
  );
  out = addJsExtensionsToRelativeImports(out);
  if (out !== code) {
    console.log(`sync-www: patched imports in ${fileLabel}`);
  }
  return out;
}

function walkJsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJsFiles(full, out);
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

function copyRevenueCatVendor() {
  const rcEsmSrc = path.join(root, "node_modules/@revenuecat/purchases-capacitor/dist/esm");
  const rcInternalSrc = path.join(
    root,
    "node_modules/@revenuecat/purchases-typescript-internal-esm/dist",
  );
  if (!fs.existsSync(rcEsmSrc) || !fs.existsSync(rcInternalSrc)) {
    console.warn("sync-www: RevenueCat packages missing — skip billing vendor");
    return;
  }

  const rcDestDir = path.join(root, "www/vendor/revenuecat");
  const rcInternalDestDir = path.join(root, "www/vendor/revenuecat-internal");
  fs.mkdirSync(rcDestDir, { recursive: true });
  fs.mkdirSync(rcInternalDestDir, { recursive: true });

  execSync(`rsync -a --include='*.js' --include='generated/***' --exclude='*' "${rcInternalSrc}/" "${rcInternalDestDir}/"`, {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });

  for (const file of walkJsFiles(rcInternalDestDir)) {
    const rel = path.relative(rcInternalDestDir, file);
    let code = fs.readFileSync(file, "utf8");
    code = addJsExtensionsToRelativeImports(code);
    fs.writeFileSync(file, code);
    console.log(`sync-www: patched imports in revenuecat-internal/${rel}`);
  }

  for (const name of fs.readdirSync(rcEsmSrc)) {
    if (!name.endsWith(".js")) continue;
    const srcFile = path.join(rcEsmSrc, name);
    let code = fs.readFileSync(srcFile, "utf8");
    code = patchVendorImports(code, `revenuecat/${name}`);
    fs.writeFileSync(path.join(rcDestDir, name), code);
  }

  console.log("sync-www: RevenueCat vendor → www/vendor/revenuecat/");
}

copyRevenueCatVendor();

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

try {
  const apiEnv = String(process.env.NABAD_API_ENV || "").trim().toLowerCase();
  if (apiEnv === "staging" || apiEnv === "production") {
    execSync(`node scripts/use-api-env.mjs ${apiEnv}`, { cwd: root, stdio: "inherit" });
  } else {
    execSync("node scripts/sync-native-env.mjs", { cwd: root, stdio: "inherit" });
  }
} catch {
  console.warn("sync-www: native env bake skipped or failed");
}
