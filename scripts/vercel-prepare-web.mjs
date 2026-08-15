#!/usr/bin/env node
/**
 * Vercel web deploy: marketing homepage at /, product SPA at /app/.
 * iOS/Capacitor still uses repo-root index.html (app shell) via sync-www — unchanged locally.
 */
import fs from "fs";
import path from "path";

const root = process.cwd();
const appShellSrc = path.join(root, "index.html");
const homeSrc = path.join(root, "home.html");
const appDir = path.join(root, "app");
const appIndex = path.join(appDir, "index.html");

if (!fs.existsSync(appShellSrc) || !fs.existsSync(homeSrc)) {
  console.error("vercel-prepare-web: missing index.html or home.html");
  process.exit(1);
}

fs.mkdirSync(appDir, { recursive: true });
fs.copyFileSync(appShellSrc, appIndex);
fs.copyFileSync(homeSrc, appShellSrc);

console.log("vercel-prepare-web: / → home (marketing), /app → app/index.html (SPA)");
