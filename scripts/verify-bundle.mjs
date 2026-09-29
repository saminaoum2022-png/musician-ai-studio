#!/usr/bin/env node
/**
 * Refuse to build/ship code that cannot possibly boot.
 *
 * A single leftover merge-conflict marker or syntax error in src/app.js makes the
 * whole app freeze on the splash — and it happened once after a staging merge.
 * This gate runs before every simulator/device sync, stamp, commit, push and
 * Vercel build, so a broken bundle never reaches a phone, TestFlight or production.
 *
 *   npm run verify:bundle
 *
 * Checks:
 *   1. No git conflict markers in any shipped source file (incl. the www/ mirror).
 *   2. Every shipped JS file parses as an ES module (node --check).
 *   3. Inline <script> blocks in index.html parse (the boot script runs before app.js).
 *   4. src/ and index.html match their www/ mirror (a stale mirror = phone runs old code).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const skipMirror = process.argv.includes("--no-mirror");

const SCAN_DIRS = ["src", "api", "www/src", "scripts"];
const SCAN_FILES = ["index.html", "styles.css", "home.html", "www/index.html", "www/styles.css"];
const SCAN_EXT = new Set([".js", ".mjs", ".html", ".css", ".json"]);
const MARKER = /^(<<<<<<< |>>>>>>> |=======$)/;

const errors = [];
const fail = (msg) => errors.push(msg);

function walk(dir, out = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name.startsWith(".")) continue;
    const rel = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(rel, out);
    else if (SCAN_EXT.has(path.extname(ent.name))) out.push(rel);
  }
  return out;
}

const files = [...SCAN_DIRS.flatMap((d) => walk(d)), ...SCAN_FILES.filter((f) => fs.existsSync(path.join(root, f)))];

// 1) conflict markers
for (const rel of files) {
  const lines = fs.readFileSync(path.join(root, rel), "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (MARKER.test(lines[i])) {
      // "=======" alone is a valid line in some markdown/text; only flag when a <<<<<<< exists in file
      if (lines[i] === "=======" && !lines.some((l) => l.startsWith("<<<<<<< "))) continue;
      fail(`${rel}:${i + 1}  merge conflict marker: ${lines[i].slice(0, 40)}`);
      break;
    }
  }
}

// 2) JS syntax (ES module). Copy to a temp .mjs because the repo is "type": "commonjs".
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verify-bundle-"));
function checkSyntax(label, source) {
  const f = path.join(tmp, `${Math.random().toString(36).slice(2)}.mjs`);
  fs.writeFileSync(f, source);
  try {
    execFileSync(process.execPath, ["--check", f], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    const msg = String(e.stderr || e.message).split("\n").slice(0, 6).join("\n    ");
    fail(`${label}  syntax error:\n    ${msg.replaceAll(f, label)}`);
  }
}

const alreadyBroken = new Set(errors.map((e) => e.split(":")[0]));
for (const rel of files) {
  if (!/\.(m?js)$/.test(rel) || alreadyBroken.has(rel)) continue;
  checkSyntax(rel, fs.readFileSync(path.join(root, rel), "utf8"));
}

// 3) inline scripts in the app shell (boot script runs before app.js)
for (const rel of ["index.html", "www/index.html"]) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs) || alreadyBroken.has(rel)) continue;
  const html = fs.readFileSync(abs, "utf8");
  const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  let n = 0;
  while ((m = re.exec(html))) {
    const attrs = m[1] || "";
    if (/type\s*=\s*["'](?!module)/i.test(attrs) && !/javascript/i.test(attrs)) continue; // json / templates
    if (/type\s*=\s*["']application\/(ld\+)?json/i.test(attrs)) continue;
    n++;
    if (m[2].trim()) checkSyntax(`${rel} <script #${n}>`, m[2]);
  }
}

fs.rmSync(tmp, { recursive: true, force: true });

// 4) www mirror must match source (the device runs www/, not src/)
if (!skipMirror) {
  const pairs = [["index.html", "www/index.html"], ["styles.css", "www/styles.css"]];
  for (const rel of walk("src")) pairs.push([rel, path.join("www", rel)]);
  for (const [a, b] of pairs) {
    const pa = path.join(root, a);
    const pb = path.join(root, b);
    if (!fs.existsSync(pa) || !fs.existsSync(pb)) continue;
    if (!fs.readFileSync(pa).equals(fs.readFileSync(pb))) {
      fail(`${b}  is out of sync with ${a} — run: npm run sync:www`);
    }
  }
}

if (errors.length) {
  console.error("\nverify-bundle: FAILED — this code would not boot. Fix before building/shipping:\n");
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error("");
  process.exit(1);
}
console.log(`verify-bundle: OK (${files.length} files: no conflict markers, JS parses, boot script parses${skipMirror ? "" : ", www mirror in sync"})`);
