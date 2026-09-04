/**
 * Append-only music generation logs for admin analytics.
 * Writes via service role; failures are non-fatal.
 */

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Suno pack: $5.25 / 1000 credits → $0.00525 per credit (12 credits = $0.063 per generation).
const SUNO_USD_PER_CREDIT = Number(process.env.SUNO_USD_PER_CREDIT || "0.00525");

function serviceHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: "application/json",
    ...extra,
  };
}

function estimateProviderCost(creditsUsed) {
  const n = Number(creditsUsed || 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * SUNO_USD_PER_CREDIT * 1_000_000) / 1_000_000;
}

async function rest(path, { method = "GET", body, prefer = "" } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { ok: false };
  const headers = serviceHeaders(body ? { "Content-Type": "application/json" } : {});
  if (prefer) headers.Prefer = prefer;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false };
  }
}

function cleanUserId(v) {
  const s = String(v || "").trim().toLowerCase();
  return /^[0-9a-f-]{36}$/.test(s) ? s : "";
}

function cleanTaskId(v) {
  const s = String(v || "").trim();
  return s.length >= 4 && s.length <= 120 ? s : "";
}

async function logMusicGeneration({
  userId,
  taskId = "",
  kind = "song",
  provider = "suno",
  prompt = "",
  requestDetail = "",
  status = "pending",
  creditsUsed = 0,
  providerCostUsd = null,
  errorMessage = "",
  createdAt = "",
  completedAt = "",
} = {}) {
  const uid = cleanUserId(userId);
  if (!uid) return { ok: false };
  const createdIso = createdAt ? new Date(createdAt).toISOString() : "";
  const completedIso = completedAt
    ? new Date(completedAt).toISOString()
    : status === "completed" || status === "failed" || status === "refunded"
      ? (createdIso || new Date().toISOString())
      : "";
  const row = {
    user_id: uid,
    task_id: cleanTaskId(taskId),
    kind: String(kind || "song").trim().slice(0, 40) || "song",
    provider:
      provider === "minimax"
        ? "minimax"
        : provider === "lyria"
          ? "lyria"
          : provider === "elevenlabs"
            ? "elevenlabs"
            : provider === "other"
              ? "other"
              : "suno",
    prompt: String(prompt || "").trim().slice(0, 2000),
    request_detail: String(requestDetail || "").trim().slice(0, 4000),
    status: ["pending", "completed", "failed", "refunded"].includes(status) ? status : "pending",
    credits_used: Number(creditsUsed || 0),
    provider_cost_usd: providerCostUsd != null ? providerCostUsd : estimateProviderCost(creditsUsed),
    error_message: String(errorMessage || "").trim().slice(0, 500),
    ...(createdIso ? { created_at: createdIso } : {}),
    ...(completedIso ? { completed_at: completedIso } : {}),
  };
  let r = await rest("music_generation_logs", {
    method: "POST",
    body: row,
    prefer: "return=representation",
  });
  // Older DBs may lack cover/remix/extend/stems/clip in the kind check — fall back so the row still lands.
  if (!r.ok && ["cover", "remix", "extend", "stems", "clip"].includes(row.kind)) {
    const fallbackKind =
      row.kind === "stems" ? "instrumental" : row.kind === "clip" ? "other" : "song";
    const retry = { ...row, kind: fallbackKind };
    r = await rest("music_generation_logs", {
      method: "POST",
      body: retry,
      prefer: "return=representation",
    });
    if (r.ok) {
      try {
        console.warn("[music-generation-log] kind fallback", row.kind, "→", fallbackKind, row.task_id);
      } catch {}
    }
  }
  // Column may be missing until generation_logs_request_detail.sql is applied.
  if (!r.ok && Object.prototype.hasOwnProperty.call(row, "request_detail")) {
    const { request_detail: _drop, ...withoutDetail } = row;
    r = await rest("music_generation_logs", {
      method: "POST",
      body: withoutDetail,
      prefer: "return=representation",
    });
    if (r.ok) {
      try {
        console.warn("[music-generation-log] request_detail omitted", row.task_id);
      } catch {}
    }
  }
  if (!r.ok) {
    try {
      console.warn("[music-generation-log] insert failed", r.status, row.kind, row.task_id, row.status, r.data);
    } catch {}
  }
  const id = Array.isArray(r.data) && r.data[0]?.id ? r.data[0].id : null;
  return { ok: r.ok, id };
}

async function updateMusicGenerationByTaskId(taskId, patch = {}) {
  const tid = cleanTaskId(taskId);
  if (!tid) return { ok: false };
  const body = { ...patch };
  if (body.status && ["completed", "failed", "refunded"].includes(body.status)) {
    body.completed_at = new Date().toISOString();
  }
  return rest(`music_generation_logs?task_id=eq.${encodeURIComponent(tid)}`, {
    method: "PATCH",
    body,
  });
}

function scheduleBackgroundWork(promise) {
  let waitUntilFn = null;
  try {
    waitUntilFn = require("@vercel/functions").waitUntil;
  } catch {}
  if (typeof waitUntilFn === "function") {
    waitUntilFn(promise);
    return;
  }
  void promise;
}

function queueLogMusicGeneration(opts) {
  scheduleBackgroundWork(logMusicGeneration(opts).catch(() => null));
}

function queueUpdateMusicGenerationByTaskId(taskId, patch) {
  scheduleBackgroundWork(updateMusicGenerationByTaskId(taskId, patch).catch(() => null));
}

module.exports = {
  logMusicGeneration,
  updateMusicGenerationByTaskId,
  queueLogMusicGeneration,
  queueUpdateMusicGenerationByTaskId,
  estimateProviderCost,
  SUNO_USD_PER_CREDIT,
};
