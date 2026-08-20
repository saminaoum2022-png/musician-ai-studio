/**
 * Refund credits when a watched Suno task fails after the initial 200 OK
 * (copyright, content policy, verify_failed, etc.).
 */

const { callRpc } = require("./credits-auth");
const { queueUpdateMusicGenerationByTaskId } = require("./music-generation-log");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function serviceHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: "application/json",
    ...extra,
  };
}

async function rest(path, { method = "GET", body, prefer = "" } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { ok: false, data: null };
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
    return { ok: false, data: null };
  }
}

function cleanUserId(v) {
  const s = String(v || "").trim().toLowerCase();
  return /^[0-9a-f-]{36}$/.test(s) ? s : "";
}

function cleanTaskId(v) {
  const s = String(v || "").trim();
  return s.length >= 6 && s.length <= 120 ? s : "";
}

function defaultCreditsForKind(kind) {
  const k = String(kind || "song").trim();
  if (k === "sound") return 2.5;
  if (k === "persona") return 5;
  if (k === "instrumental" || k === "studio_guide") return 2;
  // Music videos are not credit-billed today — never invent a refund amount.
  if (k === "music_video") return 0;
  return 12;
}

function refundReasonForKind(kind, credits = 0) {
  const k = String(kind || "song").trim();
  if (k === "sound") return "refund_sound_generate";
  if (k === "persona") return "refund_persona_create";
  if (k === "mashup") return "refund_mashup";
  if (k === "instrumental" || k === "studio_guide") {
    return Number(credits) <= 2.5 ? "refund_stems_vocal_removal" : "refund_stems_remix";
  }
  if (k === "hum_track" || k === "remix" || k === "cover" || k === "extend") return "refund_stems_remix";
  return "refund_full_song";
}

function resolveCreditsToRefund(log, kind) {
  if (log && Number.isFinite(Number(log.credits_used))) {
    // Preserve 0 for admin / unbilled rows — do not fall through to defaults.
    return Number(log.credits_used);
  }
  return defaultCreditsForKind(kind);
}

async function fetchGenerationLogByTaskId(taskId) {
  const tid = cleanTaskId(taskId);
  if (!tid) return null;
  const r = await rest(
    `music_generation_logs?task_id=eq.${encodeURIComponent(tid)}&select=id,user_id,kind,status,credits_used&limit=1`,
  );
  return Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
}

async function hasExistingRefund(userId, taskId, reason) {
  const uid = cleanUserId(userId);
  const tid = cleanTaskId(taskId);
  if (!uid || !tid) return false;
  const r = await rest(
    `credit_ledger?user_id=eq.${encodeURIComponent(uid)}&reason=eq.${encodeURIComponent(reason)}&ref=eq.${encodeURIComponent(tid)}&select=id&limit=1`,
  );
  return Array.isArray(r.data) && r.data.length > 0;
}

/**
 * Mark watch failed + refund debited credits (idempotent per task_id + reason).
 * @param {{ user_id?: string, task_id?: string, kind?: string }} row
 */
async function refundFailedSunoWatch(row, errorMessage = "") {
  const taskId = cleanTaskId(row?.task_id);
  const userId = cleanUserId(row?.user_id);
  if (!taskId || !userId) return { ok: false, reason: "invalid_args" };

  const log = await fetchGenerationLogByTaskId(taskId);
  const kind = String(log?.kind || row?.kind || "song").trim();
  const err = String(errorMessage || "").trim().slice(0, 500);

  if (log?.status === "refunded") {
    return { ok: true, skipped: true, reason: "already_refunded" };
  }
  if (log?.status === "completed") {
    return { ok: false, skipped: true, reason: "already_completed" };
  }

  const credits = resolveCreditsToRefund(log, kind);
  const reason = refundReasonForKind(kind, credits);

  if (credits <= 0) {
    queueUpdateMusicGenerationByTaskId(taskId, {
      status: "failed",
      error_message: err || "generation_failed",
    });
    return { ok: true, skipped: true, reason: "no_credits_charged" };
  }

  if (await hasExistingRefund(userId, taskId, reason)) {
    queueUpdateMusicGenerationByTaskId(taskId, {
      status: "refunded",
      error_message: err || "generation_failed",
    });
    return { ok: true, skipped: true, reason: "ledger_refund_exists" };
  }

  const refund = await callRpc("refund_credits", {
    p_user_id: userId,
    p_amount: credits,
    p_reason: reason,
    p_ref: taskId,
  });

  if (!refund.ok || !refund.data?.ok) {
    console.warn("[suno-watch-refund] refund failed", taskId, userId, refund.data || refund.error);
    queueUpdateMusicGenerationByTaskId(taskId, {
      status: "failed",
      error_message: err || "refund_failed",
    });
    return { ok: false, reason: "refund_rpc_failed" };
  }

  queueUpdateMusicGenerationByTaskId(taskId, {
    status: "refunded",
    error_message: err || "generation_failed",
  });

  try {
    console.info("[suno-watch-refund] refunded", { taskId, userId, credits, kind, reason });
  } catch {}

  return { ok: true, refunded: credits, reason };
}

module.exports = {
  refundFailedSunoWatch,
  defaultCreditsForKind,
  refundReasonForKind,
  resolveCreditsToRefund,
};
