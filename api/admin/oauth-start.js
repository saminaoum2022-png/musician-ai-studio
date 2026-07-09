/**
 * POST /api/admin/oauth-start
 * Start admin Google OAuth with PKCE verifier stored in an httpOnly cookie.
 */
const crypto = require("crypto");
const { readJson, sendJson } = require("../_lib/suno-upstream");
const { applyCors } = require("../_lib/cors");

const PKCE_COOKIE = "nabad_admin_pkce_srv";
const DEFAULT_REDIRECT = "https://www.nabadai.com/admin/";

function b64url(bytes) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function isAllowedRedirect(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === "www.nabadai.com" || host === "nabadai.com") return true;
    if (host === "localhost" || host === "127.0.0.1") return true;
    if (host.endsWith(".vercel.app")) return true;
  } catch {}
  return false;
}

function pkceCookieHeader(req, verifier, maxAge = 600) {
  const host = String(req.headers.host || "").toLowerCase();
  const secure = host.includes("nabadai.com") || host.includes("vercel.app") ? "Secure; " : "";
  const domain = host.includes("nabadai.com") ? "Domain=.nabadai.com; " : "";
  return `${PKCE_COOKIE}=${encodeURIComponent(verifier)}; Path=/; Max-Age=${maxAge}; HttpOnly; ${secure}SameSite=Lax; ${domain}`;
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  if (!supabaseUrl) return sendJson(res, 500, { error: "Server auth config missing" });

  const body = await readJson(req);
  const redirectTo = String(body?.redirect_to || DEFAULT_REDIRECT).trim();
  if (!isAllowedRedirect(redirectTo)) {
    return sendJson(res, 400, { error: "Invalid redirect_to" });
  }

  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const scope = encodeURIComponent("email profile");
  const redirectEnc = encodeURIComponent(redirectTo);
  const url =
    `${supabaseUrl}/auth/v1/authorize?provider=google&response_type=code` +
    `&scope=${scope}&code_challenge=${encodeURIComponent(challenge)}` +
    `&code_challenge_method=S256&redirect_to=${redirectEnc}`;

  res.setHeader("Set-Cookie", pkceCookieHeader(req, verifier));
  return sendJson(res, 200, { url });
};
