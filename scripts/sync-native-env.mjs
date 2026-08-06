#!/usr/bin/env node
/**
 * Bake production public-config into env.client.js for Capacitor builds.
 * Native iOS loads bundled www/ — without this file, the app depends on a live
 * /api/public-config fetch on every cold start (fragile after OTA updates).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const API_BASE = String(
  process.env.API_BASE || process.env.VERCEL_API_BASE || "https://www.nabadai.com",
).trim().replace(/\/+$/, "");
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
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(CONFIG_URL, { headers, signal: ctrl.signal });
    clearTimeout(timer);
    d = await r.json().catch(() => ({}));
    if (!d?.supabaseUrl || !d?.supabaseAnonKey) {
      console.warn(`[sync-native-env] ${CONFIG_URL} returned ${r.status} without Supabase keys — skip`);
      process.exit(0);
    }
  } catch (e) {
    console.warn(`[sync-native-env] Could not fetch ${CONFIG_URL}: ${e?.message || e} — skip`);
    process.exit(0);
  }

  const payload = {
    supabaseUrl: String(d.supabaseUrl).trim().replace(/\/+$/, ""),
    supabaseAnonKey: String(d.supabaseAnonKey).trim(),
    apiBase: API_BASE,
    vercelProtectionBypass,
    onesignalAppId: String(d.onesignalAppId || "").trim(),
    revenueCatIosApiKey: String(d.revenueCatIosApiKey || "").trim(),
  };

  const body = `window.__NABAD_CLIENT_ENV__ = ${JSON.stringify(payload, null, 2)};\n`;
  const root = process.cwd();
  for (const rel of ["env.client.js", "www/env.client.js"]) {
    const out = join(root, rel);
    writeFileSync(out, body, "utf8");
    console.log(`[sync-native-env] Wrote ${out}`);
  }
}

main();
