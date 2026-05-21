#!/usr/bin/env node
/**
 * Writes www/env.client.js for iOS/native builds when Vercel Deployment Protection
 * blocks /api/public-config (403). Run from repo root with env vars set.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const supabaseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const supabaseAnonKey = String(process.env.SUPABASE_ANON_KEY || "").trim();
const vercelProtectionBypass = String(
  process.env.VERCEL_PROTECTION_BYPASS || process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "",
).trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing env. Set SUPABASE_URL and SUPABASE_ANON_KEY (from Vercel project env).");
  console.error("Optional: VERCEL_PROTECTION_BYPASS if Deployment Protection stays ON.");
  process.exit(1);
}

const out = join(process.cwd(), "www", "env.client.js");
const body = `window.__NABAD_CLIENT_ENV__ = ${JSON.stringify(
  { supabaseUrl, supabaseAnonKey, vercelProtectionBypass },
  null,
  2,
)};\n`;

writeFileSync(out, body, "utf8");
console.log(`Wrote ${out}`);
