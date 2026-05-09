#!/usr/bin/env node
/**
 * generate-promo-codes.js
 *
 * Outputs SQL `INSERT` statements you can paste into the Supabase SQL Editor
 * to seed N single-use promo codes for the friends beta.
 *
 *   node scripts/generate-promo-codes.js                  # defaults
 *   node scripts/generate-promo-codes.js --count 30 --credits 30
 *   node scripts/generate-promo-codes.js --prefix NABADAI-BETA-2026 --count 50
 *
 * Each generated code looks like NABADAI-BETA-2026-XXXX where XXXX is 4
 * random alphanumeric chars (avoiding 0/O/1/I to dodge typos). Codes are
 * single-use (max_redemptions = 1), no expiry by default.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function rand4() {
  let out = "";
  for (let i = 0; i < 4; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

function parseArgs(argv) {
  const opts = {
    prefix: "NABADAI-BETA-2026",
    count: 30,
    credits: 30,
    expires: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--prefix") opts.prefix = argv[++i] || opts.prefix;
    else if (a === "--count") opts.count = Number(argv[++i]) || opts.count;
    else if (a === "--credits") opts.credits = Number(argv[++i]) || opts.credits;
    else if (a === "--expires") opts.expires = String(argv[++i] || "").trim();
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { prefix, count, credits, expires } = opts;
  const seen = new Set();
  const codes = [];
  while (codes.length < count) {
    const c = `${prefix}-${rand4()}`;
    if (seen.has(c)) continue;
    seen.add(c);
    codes.push(c);
  }

  const lines = [];
  lines.push(`-- ${count} single-use promo codes worth ${credits} credits each`);
  lines.push(`-- Generated ${new Date().toISOString()}`);
  lines.push("");
  lines.push("insert into public.promo_codes (code, credits, max_redemptions, redemptions, active, expires_at)");
  lines.push("values");
  const valuesSql = codes
    .map((c, i) => {
      const last = i === codes.length - 1;
      const exp = expires
        ? `'${expires.replace(/'/g, "''")}'`
        : "null";
      return `  ('${c}', ${credits}, 1, 0, true, ${exp})${last ? "" : ","}`;
    })
    .join("\n");
  lines.push(valuesSql);
  lines.push("on conflict (code) do nothing;");
  lines.push("");
  lines.push("-- Plain code list (DM these to friends, one each):");
  lines.push("/*");
  for (const c of codes) lines.push(c);
  lines.push("*/");

  process.stdout.write(lines.join("\n") + "\n");
}

main();
