#!/usr/bin/env node
/**
 * Stamp a fresh, unique build id into the cache-busting asset URLs and the
 * APP_BUILD marker so every ship busts the WKWebView (native) and browser/CDN
 * caches — i.e. device + web always pick up the new code without deleting the
 * app or hard-refreshing.
 *
 * Rewrites:
 *   - index.html:  styles.css?v=<id>  and  src/app.js?v=<id>
 *   - src/app.js:  const APP_BUILD = "<id>";
 *
 * The id doubles as the faint on-screen build marker, so you can glance at it to
 * confirm a device actually received the latest build.
 *
 * Run via: npm run stamp:build  (which also mirrors into www/).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function buildId(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const m = p(date.getMonth() + 1);
  const d = p(date.getDate());
  const hh = p(date.getHours());
  const mm = p(date.getMinutes());
  const ss = p(date.getSeconds());
  return `${y}${m}${d}-${hh}${mm}${ss}`;
}

const id = process.argv[2] || buildId();

function rewrite(file, replacers) {
  const abs = path.join(root, file);
  if (!fs.existsSync(abs)) {
    console.error(`stamp-build: missing ${file}`);
    process.exit(1);
  }
  let text = fs.readFileSync(abs, "utf8");
  let changed = 0;
  for (const [pattern, replacement] of replacers) {
    const next = text.replace(pattern, replacement);
    if (next !== text) changed += 1;
    text = next;
  }
  fs.writeFileSync(abs, text);
  console.log(`stamp-build: ${file} (${changed} replacement${changed === 1 ? "" : "s"})`);
}

rewrite("index.html", [
  [/(styles\.css\?v=)[^"']+/g, `$1${id}`],
  [/(src\/app\.js\?v=)[^"']+/g, `$1${id}`],
]);

rewrite("src/app.js", [
  [/(const APP_BUILD = ")[^"]+(";)/, `$1${id}$2`],
]);

console.log(`stamp-build: build id = ${id}`);
