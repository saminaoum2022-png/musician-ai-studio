#!/usr/bin/env node
/**
 * Bake env.client.js for production or staging API.
 * Simulator / dev builds should use staging; TestFlight archives use production.
 *
 *   node scripts/use-api-env.mjs staging
 *   node scripts/use-api-env.mjs production
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const envName = String(process.argv[2] || "staging").trim().toLowerCase();
const root = process.cwd();
const configPath = join(root, "config/environments.json");

let config;
try {
  config = JSON.parse(readFileSync(configPath, "utf8"));
} catch (e) {
  console.error(`[use-api-env] Missing or invalid ${configPath}: ${e?.message || e}`);
  process.exit(1);
}

const profile = config[envName];
if (!profile?.apiBase) {
  console.error(`[use-api-env] Unknown env "${envName}". Use: production | staging`);
  process.exit(1);
}

const API_BASE = String(process.env.API_BASE || profile.apiBase).trim().replace(/\/+$/, "");
const CONFIG_URL = `${API_BASE}/api/public-config`;
const vercelProtectionBypass = String(
  process.env.VERCEL_PROTECTION_BYPASS || process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "",
).trim();

async function main() {
  const headers = { Accept: "application/json" };
  if (vercelProtectionBypass) headers["x-vercel-protection-bypass"] = vercelProtectionBypass;

  let d;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch(CONFIG_URL, { headers, signal: ctrl.signal });
    clearTimeout(timer);
    d = await r.json().catch(() => ({}));
    if (!d?.supabaseUrl || !d?.supabaseAnonKey) {
      console.error(
        `[use-api-env] ${CONFIG_URL} returned ${r.status} without Supabase keys.`,
      );
      console.error(
        `[use-api-env] Push the "${profile.branch}" branch and wait for Vercel, or override: API_BASE=https://… node scripts/use-api-env.mjs ${envName}`,
      );
      process.exit(1);
    }
  } catch (e) {
    console.error(`[use-api-env] Could not fetch ${CONFIG_URL}: ${e?.message || e}`);
    process.exit(1);
  }

  const payload = {
    supabaseUrl: String(d.supabaseUrl).trim().replace(/\/+$/, ""),
    supabaseAnonKey: String(d.supabaseAnonKey).trim(),
    apiBase: API_BASE,
    vercelProtectionBypass,
    onesignalAppId: String(d.onesignalAppId || "").trim(),
    revenueCatIosApiKey: String(d.revenueCatIosApiKey || "").trim(),
    environment: envName,
    environmentLabel: String(profile.label || envName),
  };

  const body = `window.__NABAD_CLIENT_ENV__ = ${JSON.stringify(payload, null, 2)};\n`;
  for (const rel of ["env.client.js", "www/env.client.js"]) {
    const out = join(root, rel);
    writeFileSync(out, body, "utf8");
    console.log(`[use-api-env] ${envName} → ${API_BASE}`);
    console.log(`[use-api-env] Wrote ${out}`);
  }
}

main();
