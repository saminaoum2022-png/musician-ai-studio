#!/usr/bin/env node
/**
 * Fail if Nabad Producer ships on the current branch (for main/staging merges).
 *
 *   node scripts/verify-no-producer-on-main.mjs
 *   node scripts/verify-no-producer-on-main.mjs --base origin/main
 */
import { execFileSync } from "child_process";

const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
const base = baseIdx >= 0 ? args[baseIdx + 1] : "origin/main";

const BLOCKED_PATHS = [
  "src/nabad-producer.js",
  "www/src/nabad-producer.js",
  "api/_lib/nabad-producer-lib.js",
  "api/music/producer/chat.js",
  "api/music/producer/generate.js",
  "api/music/producer/recover.js",
];

const BLOCKED_GREP = [
  { path: "src/app.js", pattern: "configureNabadProducer" },
  { path: "index.html", pattern: 'data-home-card="producer"' },
  { path: "index.html", pattern: "nabadProducerRoute" },
];

function sh(cmd, cmdArgs) {
  return execFileSync(cmd, cmdArgs, { encoding: "utf8" }).trim();
}

function headExists(relPath) {
  try {
    sh("git", ["cat-file", "-e", `HEAD:${relPath}`]);
    return true;
  } catch {
    return false;
  }
}

function headGrep(relPath, pattern) {
  try {
    const text = sh("git", ["show", `HEAD:${relPath}`]);
    return text.includes(pattern);
  } catch {
    return false;
  }
}

const hits = [];

for (const p of BLOCKED_PATHS) {
  if (headExists(p)) hits.push(p);
}

for (const { path, pattern } of BLOCKED_GREP) {
  if (headGrep(path, pattern)) hits.push(`${path} (contains ${pattern})`);
}

let diffFiles = "";
try {
  diffFiles = sh("git", ["diff", "--name-only", `${base}...HEAD`]);
} catch (e) {
  console.error(`verify-no-producer-on-main: could not diff against ${base}`);
  process.exit(2);
}

const diffProducerRe =
  /(^|\/)(nabad-producer\.js|nabad-producer-lib\.js|api\/music\/producer\/)/;
const diffHits = (diffFiles ? diffFiles.split("\n").filter(Boolean) : []).filter((f) =>
  diffProducerRe.test(f),
);

if (hits.length || diffHits.length) {
  console.error("Nabad Producer must not ship to main/staging. Found:");
  for (const h of [...new Set([...hits, ...diffHits])]) console.error("  -", h);
  console.error("\nProducer work belongs on feature/nabad-producer only.");
  process.exit(1);
}

console.log(`verify-no-producer-on-main: OK (HEAD is Producer-free vs ${base})`);
