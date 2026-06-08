#!/usr/bin/env node
/**
 * Writes www/env.client.js for iOS/native builds when Vercel Deployment Protection
 * blocks /api/public-config (403). Run from repo root with env vars set.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const supabaseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const supabaseAnonKey = String(process.env.SUPABASE_ANON_KEY || "").trim();
const apiBase = String(
  process.env.API_BASE || process.env.VERCEL_API_BASE || "https://www.nabadai.com",
).trim().replace(/\/+$/, "");
const vercelProtectionBypass = String(
  process.env.VERCEL_PROTECTION_BYPASS || process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "",
).trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[sync-client-env] Skip: set SUPABASE_URL + SUPABASE_ANON_KEY (and optional VERCEL_PROTECTION_BYPASS) on Vercel to bake env.client.js into deploys.",
  );
  process.exit(0);
}

if (!vercelProtectionBypass) {
  console.warn(
    "[sync-client-env] WARNING: VERCEL_PROTECTION_BYPASS is empty. If Deployment Protection is on, /api/* returns 403 and Friends/login break until you disable protection or set the bypass secret on Vercel and redeploy.",
  );
}

const body = `window.__NABAD_CLIENT_ENV__ = ${JSON.stringify(
  { supabaseUrl, supabaseAnonKey, apiBase, vercelProtectionBypass },
  null,
  2,
)};\n`;

const root = process.cwd();
for (const rel of ["env.client.js", "www/env.client.js"]) {
  const out = join(root, rel);
  writeFileSync(out, body, "utf8");
  console.log(`Wrote ${out}`);
}
