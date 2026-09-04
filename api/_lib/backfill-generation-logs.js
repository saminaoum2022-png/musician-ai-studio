/**
 * Backfill music_generation_logs from credits_transactions + suno_generation_watch.
 * Used by scripts/backfill-missing-generation-logs.mjs and admin backfill endpoint.
 */

const { logMusicGeneration, estimateProviderCost } = require("./music-generation-log");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const ORPHAN_MATCH_MS = 3 * 60 * 1000;
const WATCH_MATCH_MS = 12 * 60 * 1000;
const REFUND_WINDOW_MS = 45 * 60 * 1000;

const GENERATION_DEBIT_REASONS = Object.freeze([
  "full_song",
  "stems_remix",
  "stems_vocal_removal",
  "sound_generate",
  "nabad_clip",
  "template_spark_clip",
  "mashup",
  "persona_create",
]);

function serviceHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: "application/json",
    Prefer: "count=exact",
    ...extra,
  };
}

async function serviceFetch(path, { method = "GET", body, prefer = "count=exact" } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 0, data: null, total: 0 };
  }
  try {
    const headers = serviceHeaders(body ? { "Content-Type": "application/json" } : {});
    if (prefer) headers.Prefer = prefer;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text().catch(() => "");
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    const range = r.headers.get("content-range") || "";
    const totalMatch = range.match(/\/(\d+)$/);
    const total = totalMatch ? Number(totalMatch[1]) : null;
    return { ok: r.ok, status: r.status, data, total };
  } catch {
    return { ok: false, status: 0, data: null, total: 0 };
  }
}

function mapReasonToLogMeta(reason, ref = "") {
  const r = String(reason || "").toLowerCase();
  const refL = String(ref || "").trim().toLowerCase();
  switch (r) {
    case "stems_remix":
      return { kind: "remix", provider: "suno", requestDetail: "recovered_stems_remix" };
    case "stems_vocal_removal":
      return { kind: "stems", provider: "suno", requestDetail: "recovered_stems_vocal_removal" };
    case "sound_generate":
      return { kind: "sound", provider: "suno", requestDetail: "recovered_sound_generate" };
    case "nabad_clip":
      return { kind: "clip", provider: "lyria", requestDetail: "nabad_clip" };
    case "template_spark_clip":
      return { kind: "clip", provider: "lyria", requestDetail: "template_spark_clip" };
    case "mashup":
      return { kind: "mashup", provider: "suno", requestDetail: "recovered_mashup" };
    case "persona_create":
      return { kind: "persona", provider: "suno", requestDetail: "recovered_persona" };
    case "full_song":
    default:
      if (refL === "minimax") return { kind: "song", provider: "minimax", requestDetail: "recovered_full_song" };
      if (refL === "lyria") return { kind: "song", provider: "lyria", requestDetail: "recovered_full_song" };
      if (refL === "elevenlabs") return { kind: "song", provider: "elevenlabs", requestDetail: "recovered_full_song" };
      return { kind: "song", provider: "suno", requestDetail: "recovered_full_song" };
  }
}

function watchKindToLogKind(watchKind) {
  const k = String(watchKind || "").trim().toLowerCase();
  if (["song", "photo", "sound", "hum_track", "instrumental", "music_video", "studio_guide"].includes(k)) {
    return k;
  }
  return "";
}

function watchStatusToLogStatus(watchStatus, creditMs) {
  const s = String(watchStatus || "").trim().toLowerCase();
  if (s === "failed") return "failed";
  if (s === "complete" || s === "notified") return "completed";
  if (Number.isFinite(creditMs) && Date.now() - creditMs > 60 * 60 * 1000) return "completed";
  return "pending";
}

function looksLikeTaskId(ref) {
  const s = String(ref || "").trim();
  if (s.length < 6 || s.length > 120) return "";
  if (/^[0-9a-f-]{36}$/i.test(s)) return "";
  return s;
}

function wasRefunded(debitTx, refundRows) {
  const debitMs = Date.parse(String(debitTx.created_at || ""));
  const amount = Math.abs(Number(debitTx.delta || 0));
  if (!Number.isFinite(debitMs) || amount <= 0) return false;
  return refundRows.some((t) => {
    const delta = Number(t.delta || 0);
    if (delta <= 0) return false;
    const reason = String(t.reason || "").toLowerCase();
    if (!reason.startsWith("refund_")) return false;
    if (String(t.user_id || "") !== String(debitTx.user_id || "")) return false;
    const tMs = Date.parse(String(t.created_at || ""));
    if (!Number.isFinite(tMs)) return false;
    if (tMs < debitMs || tMs - debitMs > REFUND_WINDOW_MS) return false;
    return Math.abs(delta - amount) < 0.01;
  });
}

function findNearestWatch(debitTx, watches) {
  const uid = String(debitTx.user_id || "");
  const debitMs = Date.parse(String(debitTx.created_at || ""));
  if (!uid || !Number.isFinite(debitMs)) return null;
  let best = null;
  let bestDelta = Infinity;
  for (const w of watches) {
    if (String(w.user_id || "") !== uid) continue;
    const wMs = Date.parse(String(w.created_at || ""));
    if (!Number.isFinite(wMs)) continue;
    const delta = Math.abs(wMs - debitMs);
    if (delta > WATCH_MATCH_MS || delta >= bestDelta) continue;
    best = w;
    bestDelta = delta;
  }
  return best;
}

function hasNearbyLog(debitTx, logTimesByUser) {
  const uid = String(debitTx.user_id || "");
  const debitMs = Date.parse(String(debitTx.created_at || ""));
  if (!uid || !Number.isFinite(debitMs)) return true;
  const times = logTimesByUser.get(uid) || [];
  return times.some((t) => Math.abs(t - debitMs) <= ORPHAN_MATCH_MS);
}

async function fetchAllPages(buildPath, pageSize = 1000, maxRows = 10000) {
  const rows = [];
  let offset = 0;
  while (rows.length < maxRows) {
    const res = await serviceFetch(`${buildPath()}&limit=${pageSize}&offset=${offset}`);
    const chunk = Array.isArray(res.data) ? res.data : [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    offset += pageSize;
  }
  return rows.slice(0, maxRows);
}

/**
 * @returns {Promise<{ inserted: number, skipped: number, dryRun: boolean, samples: object[] }>}
 */
async function backfillMissingGenerationLogs({ daysBack = 90, dryRun = true, limit = 5000 } = {}) {
  const days = Math.min(Math.max(Number(daysBack) || 90, 1), 365);
  const cap = Math.min(Math.max(Number(limit) || 5000, 1), 20000);
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const reasonIn = GENERATION_DEBIT_REASONS.map((r) => encodeURIComponent(r)).join(",");

  const [debitRows, logRows, watchRows, refundRows] = await Promise.all([
    fetchAllPages(
      () =>
        [
          "credits_transactions?select=id,user_id,delta,reason,ref,created_at",
          `reason=in.(${reasonIn})`,
          "delta=lt.0",
          `created_at=gte.${encodeURIComponent(sinceIso)}`,
          "order=created_at.asc",
        ].join("&"),
      1000,
      cap,
    ),
    fetchAllPages(
      () =>
        [
          "music_generation_logs?select=user_id,created_at",
          `created_at=gte.${encodeURIComponent(sinceIso)}`,
          "order=created_at.asc",
        ].join("&"),
      1000,
      50000,
    ),
    fetchAllPages(
      () =>
        [
          "suno_generation_watch?select=user_id,task_id,kind,title,status,created_at",
          `created_at=gte.${encodeURIComponent(sinceIso)}`,
          "order=created_at.asc",
        ].join("&"),
      1000,
      20000,
    ),
    fetchAllPages(
      () =>
        [
          "credits_transactions?select=user_id,delta,reason,created_at",
          "delta=gt.0",
          `created_at=gte.${encodeURIComponent(sinceIso)}`,
          "order=created_at.asc",
        ].join("&"),
      1000,
      20000,
    ).then((rows) => rows.filter((r) => String(r.reason || "").toLowerCase().startsWith("refund_"))),
  ]);

  const logTimesByUser = new Map();
  for (const row of logRows) {
    const uid = String(row.user_id || "").trim();
    const t = Date.parse(String(row.created_at || ""));
    if (!uid || !Number.isFinite(t)) continue;
    if (!logTimesByUser.has(uid)) logTimesByUser.set(uid, []);
    logTimesByUser.get(uid).push(t);
  }

  let inserted = 0;
  let skipped = 0;
  const samples = [];

  for (const debit of debitRows) {
    if (inserted >= cap) break;
    if (hasNearbyLog(debit, logTimesByUser)) {
      skipped += 1;
      continue;
    }
    if (wasRefunded(debit, refundRows)) {
      skipped += 1;
      continue;
    }

    const watch = findNearestWatch(debit, watchRows);
    const meta = mapReasonToLogMeta(debit.reason, debit.ref);
    const taskId = String(watch?.task_id || looksLikeTaskId(debit.ref) || "").trim();
    const watchKind = watchKindToLogKind(watch?.kind);
    const kind = watchKind || meta.kind;
    const title = String(watch?.title || "").trim();
    const prompt = title
      ? title
      : `Recovered ${String(debit.reason || "generation").replace(/_/g, " ")}`;
    const creditMs = Date.parse(String(debit.created_at || ""));
    const status = watch
      ? watchStatusToLogStatus(watch.status, creditMs)
      : "completed";
    const creditsUsed = Math.abs(Number(debit.delta || 0));

    const payload = {
      userId: debit.user_id,
      taskId,
      kind,
      provider: meta.provider,
      prompt,
      requestDetail: meta.requestDetail,
      status,
      creditsUsed,
      providerCostUsd: estimateProviderCost(creditsUsed),
      errorMessage: status === "failed" ? "Recovered from credit ledger (upstream failed)" : "",
      createdAt: debit.created_at,
      completedAt: status === "completed" || status === "failed" ? debit.created_at : "",
    };

    if (dryRun) {
      inserted += 1;
      if (samples.length < 12) {
        samples.push({
          userId: debit.user_id,
          reason: debit.reason,
          createdAt: debit.created_at,
          taskId: taskId || null,
          kind,
          status,
        });
      }
      if (Number.isFinite(creditMs)) {
        const uid = String(debit.user_id || "");
        if (!logTimesByUser.has(uid)) logTimesByUser.set(uid, []);
        logTimesByUser.get(uid).push(creditMs);
      }
      continue;
    }

    const r = await logMusicGeneration(payload);
    if (r.ok) {
      inserted += 1;
      if (Number.isFinite(creditMs)) {
        const uid = String(debit.user_id || "");
        if (!logTimesByUser.has(uid)) logTimesByUser.set(uid, []);
        logTimesByUser.get(uid).push(creditMs);
      }
      if (samples.length < 12) {
        samples.push({
          id: r.id,
          userId: debit.user_id,
          reason: debit.reason,
          createdAt: debit.created_at,
          taskId: taskId || null,
        });
      }
    } else {
      skipped += 1;
    }
  }

  return { inserted, skipped, dryRun: Boolean(dryRun), daysBack: days, samples };
}

module.exports = {
  GENERATION_DEBIT_REASONS,
  ORPHAN_MATCH_MS,
  mapReasonToLogMeta,
  backfillMissingGenerationLogs,
};
