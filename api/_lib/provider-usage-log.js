/**
 * Non-music API usage logs for admin provider spend (Gemini, Pollinations, etc.).
 * Writes via service role; failures are non-fatal.
 */

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const USAGE_RATES = Object.freeze({
  gemini: {
    coach: Number(process.env.GEMINI_USD_COACH || process.env.GEMINI_USD_PER_REQUEST || "0.002"),
    lyrics: Number(process.env.GEMINI_USD_LYRICS || process.env.GEMINI_USD_PER_REQUEST || "0.003"),
    cover_scene: Number(process.env.GEMINI_USD_COVER_SCENE || "0.002"),
    cover_image: Number(process.env.GEMINI_USD_COVER_IMAGE || "0.04"),
    image_mood: Number(process.env.GEMINI_USD_IMAGE_MOOD || "0.002"),
    maqam: Number(process.env.GEMINI_USD_MAQAM || "0.002"),
    transcribe: Number(process.env.GEMINI_USD_TRANSCRIBE || "0.004"),
  },
  pollinations: {
    cover_image: Number(process.env.POLLINATIONS_USD_PER_IMAGE || "0"),
  },
  cloudflare: {
    cover_image: Number(process.env.CLOUDFLARE_USD_PER_IMAGE || "0.002"),
  },
});

function serviceHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: "application/json",
    ...extra,
  };
}

function cleanUserId(v) {
  const s = String(v || "").trim().toLowerCase();
  return /^[0-9a-f-]{36}$/.test(s) ? s : "";
}

function estimateUsageCost(provider, kind) {
  const p = String(provider || "").trim().toLowerCase();
  let k = String(kind || "").trim().toLowerCase();
  if (k === "cover_image_regen") k = "cover_image";
  const rate = USAGE_RATES[p]?.[k];
  if (rate == null || !Number.isFinite(rate)) return 0;
  return Math.round(rate * 1_000_000) / 1_000_000;
}

async function logProviderUsage({
  provider,
  kind,
  userId = "",
  amountUsd = null,
  status = "completed",
  ref = "",
} = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { ok: false };
  const p = String(provider || "").trim().toLowerCase();
  const k = String(kind || "request").trim().slice(0, 40) || "request";
  if (!p) return { ok: false };

  const usd = amountUsd != null && Number.isFinite(Number(amountUsd))
    ? Number(amountUsd)
    : estimateUsageCost(p, k);

  const row = {
    provider: p,
    kind: k,
    amount_usd: usd,
    user_id: cleanUserId(userId) || null,
    status: status === "failed" ? "failed" : "completed",
    ref: String(ref || "").trim().slice(0, 120) || null,
  };

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/provider_usage_events`, {
      method: "POST",
      headers: serviceHeaders({ "Content-Type": "application/json", Prefer: "return=representation" }),
      body: JSON.stringify(row),
    });
    const data = await r.json().catch(() => null);
    return { ok: r.ok, id: Array.isArray(data) && data[0]?.id ? data[0].id : null };
  } catch {
    return { ok: false };
  }
}

function queueLogProviderUsage(opts) {
  void logProviderUsage(opts).catch(() => null);
}

module.exports = {
  USAGE_RATES,
  estimateUsageCost,
  logProviderUsage,
  queueLogProviderUsage,
};
