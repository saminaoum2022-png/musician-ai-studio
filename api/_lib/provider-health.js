/**
 * Admin provider health — on-demand pings with in-memory cache (5 min).
 * No cron, no Supabase writes. Keys never leave the server.
 */

const HEALTH_CACHE_MS = 5 * 60 * 1000;

const PROVIDER_CATALOG = Object.freeze([
  {
    id: "suno",
    name: "Suno",
    vendor: "sunoapi.org",
    role: "Primary music generation",
    envKeys: ["SUNO_API_KEY"],
    topUpUrl: "https://sunoapi.org/billing",
    dashboardUrl: "https://sunoapi.org",
    docsUrl: "https://docs.sunoapi.org",
  },
  {
    id: "gemini",
    name: "Gemini / Lyria",
    vendor: "Google",
    role: "Music (Lyria Pro), cover art, coach, maqam",
    envKeys: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    featureFlag: "LYRIA_GENERATE_ENABLED",
    topUpUrl: "https://aistudio.google.com/billing",
    dashboardUrl: "https://aistudio.google.com/billing",
    docsUrl: "https://ai.google.dev/gemini-api/docs",
    lyriaDocsUrl: "https://ai.google.dev/gemini-api/docs/music-generation",
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs Music",
    vendor: "ElevenLabs",
    role: "Alternate music generation",
    envKeys: ["ELEVENLABS_API_KEY"],
    featureFlag: "ELEVENLABS_GENERATE_ENABLED",
    topUpUrl: "https://elevenlabs.io/app/subscription",
    dashboardUrl: "https://elevenlabs.io/app/subscription",
    docsUrl: "https://elevenlabs.io/docs/api-reference/music/compose",
  },
  {
    id: "cloudflare",
    name: "Cloudflare Workers AI",
    vendor: "Cloudflare",
    role: "Cover art (default Flux Schnell)",
    envKeys: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"],
    dashboardUrl: "https://dash.cloudflare.com/?to=/:account/ai/workers-ai",
    docsUrl: "https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/",
  },
  {
    id: "pollinations",
    name: "Pollinations",
    vendor: "Pollinations.ai",
    role: "Cover art fallback",
    envKeys: [],
    dashboardUrl: "https://pollinations.ai",
    docsUrl: "https://github.com/pollinations/pollinations",
  },
]);

let healthCache = { at: 0, providers: [] };

function envConfigured(keys = []) {
  if (!keys.length) return true;
  return keys.some((k) => String(process.env[k] || "").trim().length > 0);
}

function featureEnabled(flagName) {
  if (!flagName) return null;
  const v = String(process.env[flagName] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

async function timedFetch(url, options = {}, timeoutMs = 8000) {
  const start = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...options, signal: ctrl.signal });
    const text = await r.text().catch(() => "");
    return {
      ok: r.ok,
      status: r.status,
      ms: Date.now() - start,
      text,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - start,
      text: "",
      error: e?.name === "AbortError" ? "timeout" : (e?.message || String(e)),
    };
  } finally {
    clearTimeout(timer);
  }
}

function statusFromPing({ ok, status, ms, configured, error }) {
  if (!configured) return "unconfigured";
  if (error === "timeout" || ms > 6000) return "slow";
  if (!ok) return status === 401 || status === 403 ? "auth" : "down";
  if (ms > 3000) return "slow";
  return "ok";
}

function fmtInt(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return Math.round(v).toLocaleString("en-US");
}

function sunoLiveBalance(credits) {
  const cr = Number(credits);
  if (!Number.isFinite(cr)) return null;
  return {
    source: "api",
    kind: "credits",
    value: cr,
    label: `${fmtInt(cr)} cr`,
    detail: "Live from sunoapi.org",
  };
}

function geminiDashboardBalance() {
  return {
    source: "dashboard_only",
    kind: "usd",
    label: "AI Studio Billing",
    detail: "Google has no balance API for API keys — open Billing to see prepay balance",
    billingUrl: "https://aistudio.google.com/billing",
  };
}

function parseElevenLabsLiveBalance(data) {
  const sub = data?.subscription && typeof data.subscription === "object"
    ? data.subscription
    : data;
  const used = Number(sub?.character_count);
  const limit = Number(sub?.character_limit);
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return null;
  const remaining = Math.max(0, limit - used);
  const tier = String(sub?.tier || sub?.status || "plan").trim();
  const pct = limit > 0 ? Math.round((remaining / limit) * 100) : 0;
  return {
    source: "api",
    kind: "characters",
    value: remaining,
    used,
    limit,
    label: `${fmtInt(remaining)} chars`,
    detail: `${tier} · ${fmtInt(used)} / ${fmtInt(limit)} used (${pct}% left)`,
  };
}

async function pingSuno() {
  const apiKey = process.env.SUNO_API_KEY;
  const configured = Boolean(apiKey);
  if (!configured) {
    return { status: "unconfigured", latencyMs: null, detail: "SUNO_API_KEY not set", balance: null };
  }
  const r = await timedFetch("https://api.sunoapi.org/api/v1/generate/credit", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  let balance = null;
  if (r.ok) {
    try {
      const data = JSON.parse(r.text);
      if (Number.isFinite(Number(data?.data))) balance = Number(data.data);
    } catch {}
  }
  const status = statusFromPing({ ok: r.ok, status: r.status, ms: r.ms, configured: true, error: r.error });
  const detail = r.ok
    ? (balance != null ? `${balance} credits` : "API reachable")
    : (r.error || `HTTP ${r.status || "error"}`);
  const liveBalance = balance != null ? sunoLiveBalance(balance) : null;
  return { status, latencyMs: r.ms, detail, balance, liveBalance };
}

async function pingGeminiModels(apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const r = await timedFetch(url);
  const status = statusFromPing({ ok: r.ok, status: r.status, ms: r.ms, configured: true, error: r.error });
  let detail = r.ok ? "Models API OK" : (r.error || `HTTP ${r.status}`);
  if (r.status === 401 || r.status === 403) detail = "Invalid API key";
  const liveBalance = r.ok ? geminiDashboardBalance() : null;
  return { status, latencyMs: r.ms, detail, liveBalance };
}

async function pingGeminiLyria() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  const configured = Boolean(apiKey);
  const lyriaEnabled = featureEnabled("LYRIA_GENERATE_ENABLED");
  if (!configured) {
    return { status: "unconfigured", latencyMs: null, detail: "GEMINI_API_KEY not set", enabled: lyriaEnabled };
  }
  const ping = await pingGeminiModels(apiKey);
  const model = String(process.env.LYRIA_MUSIC_MODEL || "lyria-3-pro-preview").trim();
  const lyriaNote = lyriaEnabled ? `Lyria ${model} live` : "Lyria admin-only";
  return {
    ...ping,
    detail: `${ping.detail} · ${lyriaNote}`,
    enabled: lyriaEnabled,
  };
}

async function pingElevenLabs() {
  const apiKey = process.env.ELEVENLABS_API_KEY || "";
  const configured = Boolean(apiKey);
  const enabled = featureEnabled("ELEVENLABS_GENERATE_ENABLED");
  if (!configured) {
    return { status: "unconfigured", latencyMs: null, detail: "ELEVENLABS_API_KEY not set", enabled };
  }
  const r = await timedFetch("https://api.elevenlabs.io/v1/user", {
    headers: { "xi-api-key": apiKey },
  });
  let liveBalance = null;
  if (r.ok) {
    try {
      const data = JSON.parse(r.text);
      liveBalance = parseElevenLabsLiveBalance(data);
    } catch {}
  }
  const status = statusFromPing({ ok: r.ok, status: r.status, ms: r.ms, configured: true, error: r.error });
  let detail = r.ok
    ? (liveBalance ? liveBalance.detail : "Account API OK")
    : (r.error || `HTTP ${r.status}`);
  if (r.status === 401) detail = "Invalid API key";
  if (!enabled) detail += " · admin-only (ELEVENLABS_GENERATE_ENABLED off)";
  return { status, latencyMs: r.ms, detail, enabled, liveBalance };
}

async function pingPollinations() {
  const r = await timedFetch("https://pollinations.ai/", { method: "GET" }, 6000);
  const status = statusFromPing({ ok: r.ok, status: r.status, ms: r.ms, configured: true, error: r.error });
  return {
    status,
    latencyMs: r.ms,
    detail: r.ok ? "Site reachable" : (r.error || `HTTP ${r.status}`),
  };
}

async function pingCloudflare() {
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const token = String(process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_AI_API_TOKEN || "").trim();
  const configured = Boolean(accountId && token);
  if (!configured) {
    return { status: "unconfigured", latencyMs: null, detail: "CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not set" };
  }
  const r = await timedFetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
    headers: { Authorization: `Bearer ${token}` },
  }, 8000);
  const status = statusFromPing({ ok: r.ok, status: r.status, ms: r.ms, configured: true, error: r.error });
  let detail = r.ok ? "API token verified" : (r.error || `HTTP ${r.status}`);
  if (r.status === 401) detail = "Invalid API token";
  return { status, latencyMs: r.ms, detail };
}

const PINGERS = {
  suno: pingSuno,
  gemini: pingGeminiLyria,
  elevenlabs: pingElevenLabs,
  cloudflare: pingCloudflare,
  pollinations: pingPollinations,
};

async function runProviderHealthChecks() {
  const results = await Promise.all(
    PROVIDER_CATALOG.map(async (meta) => {
      const pinger = PINGERS[meta.id];
      const ping = pinger ? await pinger() : { status: "unknown", latencyMs: null, detail: "—" };
      return {
        ...meta,
        configured: meta.envKeys.length ? envConfigured(meta.envKeys) : true,
        featureEnabled: meta.featureFlag ? featureEnabled(meta.featureFlag) : null,
        status: ping.status,
        latencyMs: ping.latencyMs,
        detail: ping.detail || "",
        balance: ping.balance ?? null,
        liveBalance: ping.liveBalance ?? null,
      };
    }),
  );
  return results;
}

async function getProviderHealth({ force = false } = {}) {
  const now = Date.now();
  if (!force && healthCache.providers.length && now - healthCache.at < HEALTH_CACHE_MS) {
    return {
      providers: healthCache.providers,
      cached: true,
      cachedAt: new Date(healthCache.at).toISOString(),
      cacheTtlSec: Math.max(0, Math.round((HEALTH_CACHE_MS - (now - healthCache.at)) / 1000)),
    };
  }
  const providers = await runProviderHealthChecks();
  healthCache = { at: now, providers };
  return {
    providers,
    cached: false,
    cachedAt: new Date(now).toISOString(),
    cacheTtlSec: HEALTH_CACHE_MS / 1000,
  };
}

module.exports = {
  PROVIDER_CATALOG,
  getProviderHealth,
  HEALTH_CACHE_MS,
};
