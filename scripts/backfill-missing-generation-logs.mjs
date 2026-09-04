#!/usr/bin/env node
/**
 * Backfill missing music_generation_logs from credits_transactions.
 *
 * Requires .env.local with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *
 *   node scripts/backfill-missing-generation-logs.mjs
 *   node scripts/backfill-missing-generation-logs.mjs --days=90 --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadDotEnv(path.join(root, ".env.local"));
loadDotEnv(path.join(root, ".env"));

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const daysArg = args.find((a) => a.startsWith("--days="));
const daysBack = daysArg ? Number(daysArg.split("=")[1]) : 90;

const mod = await import(pathToFileURL(path.join(root, "api/_lib/backfill-generation-logs.js")).href);
const { backfillMissingGenerationLogs } = mod.default || mod;

console.log(`Backfill generation logs — days=${daysBack} dryRun=${!apply}`);
const result = await backfillMissingGenerationLogs({
  daysBack,
  dryRun: !apply,
  limit: 10000,
});

console.log(JSON.stringify(result, null, 2));
if (!apply) {
  console.log("\nDry run only. Re-run with --apply to insert rows.");
}
