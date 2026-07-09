#!/usr/bin/env node
/**
 * Set (or reset) a password on a Supabase user so they can sign in to admin
 * with email + password — including accounts that originally signed up with Google.
 *
 * Usage:
 *   export SUPABASE_URL="https://xxxx.supabase.co"
 *   export SUPABASE_SERVICE_ROLE_KEY="eyJ..."
 *   export ADMIN_EMAIL="you@gmail.com"   # optional, default below
 *   node scripts/set-admin-password.mjs
 *
 * Or pass a password you choose:
 *   export ADMIN_PASSWORD="YourSecurePass123!"
 *   node scripts/set-admin-password.mjs
 */

import crypto from "node:crypto";

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "saminaoum2022@gmail.com").trim().toLowerCase();
const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD || "").trim();

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

function adminHeaders(extra = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function generatePassword() {
  // 16 chars, easy to copy: letters + digits, no ambiguous symbols
  const raw = crypto.randomBytes(12).toString("base64url");
  return `Nabad-${raw}`;
}

async function findUserByEmail(email) {
  let page = 1;
  const perPage = 200;
  while (page <= 20) {
    const r = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${perPage}`,
      { headers: adminHeaders() },
    );
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      fail(`Could not list users (${r.status}): ${JSON.stringify(data).slice(0, 200)}`);
    }
    const users = Array.isArray(data?.users) ? data.users : [];
    const hit = users.find((u) => String(u?.email || "").toLowerCase() === email);
    if (hit) return hit;
    if (users.length < perPage) break;
    page += 1;
  }
  return null;
}

async function setUserPassword(userId, password) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify({
      password,
      email_confirm: true,
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    fail(`Could not set password (${r.status}): ${data?.message || data?.msg || JSON.stringify(data).slice(0, 200)}`);
  }
}

async function grantAdminRole(userId) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: adminHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify({ role: "admin" }),
    },
  );
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    console.warn(`⚠ Could not set profiles.role=admin (${r.status}): ${t.slice(0, 120)}`);
    console.warn("  You may still have access if your email is in ADMIN_EMAILS on Vercel.");
    return;
  }
  console.log("✓ profiles.role set to admin");
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    fail("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.");
  }

  const password = ADMIN_PASSWORD || generatePassword();
  console.log(`Looking up ${ADMIN_EMAIL}…`);
  const user = await findUserByEmail(ADMIN_EMAIL);
  if (!user?.id) {
    fail(`No Supabase user found for ${ADMIN_EMAIL}. Sign up in the app first.`);
  }

  console.log(`Found user ${user.id}`);
  await setUserPassword(user.id, password);
  console.log("✓ Password updated (email/password login enabled)");
  await grantAdminRole(user.id);

  console.log("\n--- Admin login ---");
  console.log(`URL:      https://www.nabadai.com/admin/`);
  console.log(`Email:    ${ADMIN_EMAIL}`);
  console.log(`Password: ${password}`);
  console.log("\nSave this password somewhere safe. It is not stored in the repo.");
}

main().catch((e) => fail(e?.message || String(e)));
