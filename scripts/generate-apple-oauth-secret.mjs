#!/usr/bin/env node
/**
 * Generate Apple OAuth client secret (JWT) for Supabase "Secret Key" field.
 * Apple .p8 alone is not accepted — Supabase wants this JWT (valid ~6 months).
 *
 * Usage:
 *   node scripts/generate-apple-oauth-secret.mjs ~/Downloads/AuthKey_XXXXXXXXXX.p8 YOUR_KEY_ID
 *
 * Or with env:
 *   APPLE_P8_PATH=~/Downloads/AuthKey_XXX.p8 APPLE_KEY_ID=XXX node scripts/generate-apple-oauth-secret.mjs
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import os from "os";

const TEAM_ID = process.env.APPLE_TEAM_ID || "D9P29385BD";
const SERVICES_ID = process.env.APPLE_SERVICES_ID || "com.nabadai.music.web";
const p8Path = process.argv[2] || process.env.APPLE_P8_PATH || "";
const keyId = process.argv[3] || process.env.APPLE_KEY_ID || "";

function usage() {
  console.error(`Usage: node scripts/generate-apple-oauth-secret.mjs <path-to-AuthKey.p8> <KEY_ID>

  KEY_ID = 10-char id from Apple Developer → Keys (e.g. AuthKey file name)

  Optional env: APPLE_TEAM_ID (default ${TEAM_ID}), APPLE_SERVICES_ID (default ${SERVICES_ID})`);
  process.exit(1);
}

function b64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

if (!p8Path || !keyId) usage();

const resolved = path.resolve(String(p8Path).replace(/^~(?=$|\/)/, os.homedir()));
if (!fs.existsSync(resolved)) {
  console.error(`File not found: ${resolved}`);
  process.exit(1);
}

const privateKey = fs.readFileSync(resolved, "utf8");
const now = Math.floor(Date.now() / 1000);
const exp = now + 86400 * 180; // 180 days (renew before 6-month Apple limit)

const header = { alg: "ES256", kid: keyId.trim(), typ: "JWT" };
const payload = {
  iss: TEAM_ID,
  iat: now,
  exp,
  aud: "https://appleid.apple.com",
  sub: SERVICES_ID,
};

const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
const signature = crypto.sign("sha256", Buffer.from(signingInput), {
  key: privateKey,
  dsaEncoding: "ieee-p1363",
});

const jwt = `${signingInput}.${b64url(signature)}`;

console.log("\nPaste this into Supabase → Authentication → Apple → Secret Key:\n");
console.log(jwt);
console.log(`\nValid until ~${new Date(exp * 1000).toISOString().slice(0, 10)} (regenerate before expiry).\n`);
