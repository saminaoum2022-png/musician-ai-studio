#!/usr/bin/env node
/**
 * End-to-end smoke test for POST /api/account/delete (production or staging).
 *
 * Creates nothing permanent if you use a dedicated test account you intend to delete.
 *
 * Usage:
 *   export SUPABASE_URL="https://xxxx.supabase.co"
 *   export SUPABASE_ANON_KEY="eyJ..."
 *   export TEST_EMAIL="test-delete@example.com"
 *   export TEST_PASSWORD="your-test-password"
 *   # optional — verify user removed from Auth admin API
 *   export SUPABASE_SERVICE_ROLE_KEY="eyJ..."
 *   export API_BASE="https://musician-ai-studio.vercel.app"
 *   node scripts/test-account-delete.mjs
 *
 * Or with an existing access token (skips password sign-in):
 *   export ACCESS_TOKEN="eyJ..."
 *   node scripts/test-account-delete.mjs
 */

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const API_BASE = (process.env.API_BASE || "https://musician-ai-studio.vercel.app").replace(/\/$/, "");
const TEST_EMAIL = (process.env.TEST_EMAIL || "").trim();
const TEST_PASSWORD = process.env.TEST_PASSWORD || "";
const ACCESS_TOKEN = (process.env.ACCESS_TOKEN || "").trim();

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`✓ ${msg}`);
}

async function signInWithPassword() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    fail("Set SUPABASE_URL and SUPABASE_ANON_KEY (or ACCESS_TOKEN).");
  }
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    fail("Set TEST_EMAIL and TEST_PASSWORD (or ACCESS_TOKEN).");
  }
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) fail(`Sign-in failed (${r.status}): ${d?.error_description || d?.msg || JSON.stringify(d)}`);
  const token = String(d?.access_token || "").trim();
  const userId = String(d?.user?.id || "").trim();
  if (!token || !userId) fail("Sign-in response missing access_token or user.id");
  ok(`Signed in as ${TEST_EMAIL} (${userId})`);
  return { token, userId, email: TEST_EMAIL };
}

async function authUserExists(token) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  return r.ok;
}

async function adminUserExists(userId) {
  if (!SUPABASE_SERVICE_ROLE_KEY) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (r.status === 404) return false;
  if (r.ok) return true;
  const t = await r.text().catch(() => "");
  console.warn(`  (admin lookup ${r.status}: ${t.slice(0, 120)})`);
  return null;
}

async function callDeleteApi(token) {
  const r = await fetch(`${API_BASE}/api/account/delete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ confirm: "DELETE" }),
  });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: d };
}

async function main() {
  console.log(`API_BASE: ${API_BASE}`);
  console.log("--- Pre-flight (unauthenticated) ---");
  const pre = await fetch(`${API_BASE}/api/account/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: "DELETE" }),
  });
  const preBody = await pre.json().catch(() => ({}));
  if (pre.status !== 401) fail(`Expected 401 without auth, got ${pre.status}: ${JSON.stringify(preBody)}`);
  ok("Unauthenticated delete returns 401");

  let token = ACCESS_TOKEN;
  let userId = "";
  let email = TEST_EMAIL || "(token)";

  if (!token) {
    const session = await signInWithPassword();
    token = session.token;
    userId = session.userId;
    email = session.email;
  } else {
    ok("Using ACCESS_TOKEN from env");
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) fail(`ACCESS_TOKEN invalid (${r.status})`);
    userId = String(d?.id || "").trim();
    email = String(d?.email || email);
    ok(`Token valid for ${email} (${userId})`);
  }

  if (!(await authUserExists(token))) fail("User not found before delete");

  const adminBefore = await adminUserExists(userId);
  if (adminBefore === true) ok("Admin API: user exists before delete");
  else if (adminBefore === false) fail("Admin API: user missing before delete (unexpected)");

  console.log("\n--- Delete account ---");
  if (!process.env.CONFIRM_DELETE) {
    console.warn(
      "\n⚠  This will PERMANENTLY delete the account:",
      email,
      "\n   Re-run with CONFIRM_DELETE=1 to proceed.\n"
    );
    process.exit(0);
  }

  const del = await callDeleteApi(token);
  if (!del.ok) fail(`Delete API failed (${del.status}): ${del.data?.error || JSON.stringify(del.data)}`);
  ok(`Delete API returned ${del.status} (${JSON.stringify(del.data)})`);

  if (await authUserExists(token)) fail("Old access token still valid after delete");
  ok("Old access token rejected after delete");

  const adminAfter = await adminUserExists(userId);
  if (adminAfter === true) fail("Admin API: user still exists after delete");
  if (adminAfter === false) ok("Admin API: user removed");

  if (TEST_EMAIL && TEST_PASSWORD) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    if (r.ok) fail("Password sign-in still works after delete — account may not be fully removed");
    ok("Password sign-in fails after delete (expected)");
  }

  console.log("\n✓ Account deletion E2E passed.\n");
}

main().catch((e) => fail(e?.message || String(e)));
