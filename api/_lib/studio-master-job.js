/**
 * Signed job tokens for Studio Pro Master preview/finalize sessions.
 */
const crypto = require("crypto");

function signingSecret() {
  return String(process.env.STUDIO_MASTER_SIGNING_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}

function signJobToken(payload) {
  const secret = signingSecret();
  if (!secret) return "";
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyJobToken(token, expected) {
  const secret = signingSecret();
  const raw = String(token || "").trim();
  if (!secret || !raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expectedSig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (sig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (expected?.userId && payload.userId !== expected.userId) return null;
    if (expected?.masteringTaskId && payload.masteringTaskId !== expected.masteringTaskId) return null;
    if (payload.exp && Date.now() > Number(payload.exp)) return null;
    return payload;
  } catch {
    return null;
  }
}

module.exports = { signJobToken, verifyJobToken };
