/**
 * POST /api/admin/oauth-exchange
 * Exchange a Supabase PKCE auth code for a session (admin Google sign-in).
 */
const { readJson, sendJson } = require("../_lib/suno-upstream");
const { applyCors } = require("../_lib/cors");

const PKCE_COOKIE = "nabad_admin_pkce_srv";

function readPkceCookie(req) {
  const raw = String(req.headers.cookie || "");
  const m = raw.match(new RegExp(`(?:^|; )${PKCE_COOKIE}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : "";
}

function clearPkceCookieHeader(req) {
  const host = String(req.headers.host || "").toLowerCase();
  const secure = host.includes("nabadai.com") || host.includes("vercel.app") ? "Secure; " : "";
  const domain = host.includes("nabadai.com") ? "Domain=.nabadai.com; " : "";
  return `${PKCE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; ${secure}SameSite=Lax; ${domain}`;
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY || "";
  if (!supabaseUrl || !anonKey) {
    return sendJson(res, 500, { error: "Server auth config missing" });
  }

  const body = await readJson(req);
  const code = String(body?.code || "").trim();
  const codeVerifier =
    readPkceCookie(req) || String(body?.code_verifier || "").trim();
  if (!code || !codeVerifier) {
    return sendJson(res, 400, {
      error: "Sign-in expired — tap Continue with Google again",
    });
  }

  const r = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ auth_code: code, code_verifier: codeVerifier }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data?.access_token) {
    const msg = data?.error_description || data?.msg || data?.message || "OAuth exchange failed";
    return sendJson(res, r.status >= 400 ? r.status : 502, { error: msg, details: data });
  }

  res.setHeader("Set-Cookie", clearPkceCookieHeader(req));
  return sendJson(res, 200, data);
};
