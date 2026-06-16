/**
 * Shared helpers for credit-aware API routes.
 *
 *   verifyUser(req)    -> { userId, email } or null
 *   callRpc(name, body) -> parsed JSON response from Supabase RPC
 *   adminEmails()      -> Set of admin emails (lower-cased)
 *
 * The Vercel server uses the Supabase service role key for all writes
 * (per-user balance, ledger, promo redemption) so the SQL functions can
 * be SECURITY DEFINER and we don't have to thread the user's JWT into
 * Postgres. Identity is established once at the edge by hitting
 * /auth/v1/user with the user's access token.
 */

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const DEFAULT_ADMIN = "saminaoum2022@gmail.com";

function readBearer(req) {
  const raw = req.headers?.authorization || req.headers?.Authorization || "";
  const m = String(raw || "").match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

const VERIFY_USER_CACHE_TTL_MS = 60_000;
const VERIFY_USER_CACHE_MAX = 200;
/** token -> { user, expAt } — avoids /auth/v1/user on every Vercel social/credits hit */
const verifyUserCache = new Map();

function decodeJwtExpMs(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return 0;
    const json = Buffer.from(
      parts[1].replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    const exp = Number(JSON.parse(json)?.exp || 0);
    return exp > 0 ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

function pruneVerifyUserCache(now = Date.now()) {
  for (const [k, v] of verifyUserCache) {
    if (v.expAt <= now) verifyUserCache.delete(k);
  }
  if (verifyUserCache.size <= VERIFY_USER_CACHE_MAX) return;
  let drop = verifyUserCache.size - VERIFY_USER_CACHE_MAX;
  for (const k of verifyUserCache.keys()) {
    verifyUserCache.delete(k);
    if (--drop <= 0) break;
  }
}

async function verifyUser(req) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const token = readBearer(req);
  if (!token || token.split(".").length < 3) return null;
  const now = Date.now();
  const cached = verifyUserCache.get(token);
  if (cached && cached.expAt > now) return cached.user;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!r.ok) return null;
    const data = await r.json().catch(() => null);
    if (!data?.id) return null;
    const user = {
      userId: String(data.id),
      email: String(data.email || "").toLowerCase(),
      raw: data,
    };
    const jwtExp = decodeJwtExpMs(token);
    const expAt = Math.min(
      now + VERIFY_USER_CACHE_TTL_MS,
      jwtExp > 0 ? jwtExp - 30_000 : now + VERIFY_USER_CACHE_TTL_MS,
    );
    if (expAt > now) {
      verifyUserCache.set(token, { user, expAt });
      pruneVerifyUserCache(now);
    }
    return user;
  } catch {
    return null;
  }
}

async function callRpc(name, body) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, error: "Missing SUPABASE_SERVICE_ROLE_KEY on server" };
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body || {}),
    });
    const text = await r.text().catch(() => "");
    let data = null;
    try { data = JSON.parse(text); } catch { data = text; }
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 500, error: e?.message || String(e) };
  }
}

async function selectFromTable(path) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, data: null };
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: "application/json",
      },
    });
    if (!r.ok) return { ok: false, status: r.status, data: null };
    const data = await r.json().catch(() => null);
    return { ok: true, data };
  } catch {
    return { ok: false, data: null };
  }
}

function adminEmails() {
  const raw = String(process.env.ADMIN_EMAILS || DEFAULT_ADMIN);
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

function isAdminEmail(email) {
  if (!email) return false;
  return adminEmails().has(String(email).toLowerCase());
}

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  setCors(res);
  res.end(JSON.stringify(obj));
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, apikey, x-client-info");
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

module.exports = {
  verifyUser,
  callRpc,
  selectFromTable,
  adminEmails,
  isAdminEmail,
  sendJson,
  setCors,
  readJsonBody,
};
