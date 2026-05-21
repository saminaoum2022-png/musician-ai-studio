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
  process.env.API_BASE || process.env.VERCEL_API_BASE || "https://nabad-ai.vercel.app",
).trim().replace(/\/+$/, "");
const vercelProtectionBypass = String(
  process.env.VERCEL_PROTECTION_BYPASS || process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "",
).trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing env. Set SUPABASE_URL and SUPABASE_ANON_KEY (from Vercel project env).");
  console.error("Optional: API_BASE (your live web app URL), VERCEL_PROTECTION_BYPASS.");
  process.exit(1);
}

const out = join(process.cwd(), "www", "env.client.js");
const body = `window.__NABAD_CLIENT_ENV__ = ${JSON.stringify(
  { supabaseUrl, supabaseAnonKey, apiBase, vercelProtectionBypass },
  null,
  2,
)};\n`;

writeFileSync(out, body, "utf8");
console.log(`Wrote ${out}`);
