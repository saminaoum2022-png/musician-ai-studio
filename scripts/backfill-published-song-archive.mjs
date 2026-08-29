#!/usr/bin/env node
/**
 * Archive published songs still on legacy Suno/proxy URLs.
 *
 * Local (service role):
 *   export SUPABASE_URL="https://xxxx.supabase.co"
 *   export SUPABASE_SERVICE_ROLE_KEY="..."
 *   export SUNO_API_KEY="..."
 *   node scripts/backfill-published-song-archive.mjs
 *
 * Remote (production cron endpoint):
 *   export API_BASE="https://www.nabadai.com"
 *   export CRON_SECRET="..."
 *   node scripts/backfill-published-song-archive.mjs --remote
 *
 * Dry run:
 *   node scripts/backfill-published-song-archive.mjs --dry-run
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const require = createRequire(import.meta.url);

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

for (const f of [".env.local", ".env"]) {
  loadDotEnv(path.join(root, f));
}

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const remote = args.has("--remote");
const API_BASE = (process.env.API_BASE || "https://www.nabadai.com").replace(/\/$/, "");

async function runRemote() {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) {
    console.error("Set CRON_SECRET for --remote (Vercel → Settings → Environment Variables).");
    process.exit(1);
  }
  const q = dryRun ? "?dryRun=1" : "";
  const r = await fetch(`${API_BASE}/api/cron/backfill-published-archive${q}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  const data = await r.json().catch(() => ({}));
  console.log(JSON.stringify(data, null, 2));
  if (!r.ok) process.exit(1);
}

async function runLocal() {
  const modPath = path.join(root, "api/_lib/archive-remote-song.js");
  const { backfillPublishedSongArchives } = require(modPath);
  const result = await backfillPublishedSongArchives({ dryRun });
  console.log(JSON.stringify(result, null, 2));
  if (result.failed > 0) process.exit(1);
}

if (remote) {
  await runRemote();
} else if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_URL) {
  await runLocal();
} else {
  console.error(
    "Missing local secrets. Either set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUNO_API_KEY,\n" +
      "or run: CRON_SECRET=... node scripts/backfill-published-song-archive.mjs --remote",
  );
  process.exit(1);
}
