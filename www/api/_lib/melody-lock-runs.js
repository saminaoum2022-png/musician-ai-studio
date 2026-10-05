/**
 * Melody Lock generation runs + admin ear-check persistence.
 */
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
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: "missing_supabase" };
  }
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
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

async function upsertMelodyLockRun(row) {
  const r = await rest("melody_lock_runs?on_conflict=task_id", {
    method: "POST",
    body: { ...row, updated_at: new Date().toISOString() },
    prefer: "resolution=merge-duplicates,return=representation",
  });
  if (!r.ok) {
    return { ok: false, persisted: false, error: r.data?.message || "melody_lock_runs_write_failed" };
  }
  const saved = Array.isArray(r.data) ? r.data[0] : r.data;
  return { ok: true, persisted: true, row: saved };
}

async function getMelodyLockRunByTask(taskId, userId) {
  const tid = String(taskId || "").trim();
  const uid = String(userId || "").trim();
  if (!tid) return { ok: false, status: 400, error: "missing_task_id" };
  const r = await rest(
    `melody_lock_runs?task_id=eq.${encodeURIComponent(tid)}&user_id=eq.${encodeURIComponent(uid)}&select=*&limit=1`,
  );
  if (!r.ok) return { ok: false, status: r.status, error: "load_failed" };
  const row = Array.isArray(r.data) ? r.data[0] : null;
  if (!row) return { ok: false, status: 404, error: "not_found" };
  return { ok: true, row };
}

async function patchMelodyLockEarCheck({ taskId, userId, verdict, adminNotes = "" }) {
  const v = String(verdict || "").trim().toLowerCase();
  if (v !== "pass" && v !== "fail") {
    return { ok: false, status: 400, error: "verdict must be pass or fail" };
  }
  const loaded = await getMelodyLockRunByTask(taskId, userId);
  if (!loaded.ok) return loaded;

  const r = await rest(`melody_lock_runs?task_id=eq.${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    body: {
      melody_lock_ear_pass: v,
      admin_ear_notes: String(adminNotes || "").slice(0, 2000),
      updated_at: new Date().toISOString(),
    },
    prefer: "return=representation",
  });
  if (!r.ok) return { ok: false, status: r.status, error: "patch_failed" };
  const row = Array.isArray(r.data) ? r.data[0] : r.data;
  return { ok: true, row };
}

function formatMelodyLockDetailLines({
  melodyId,
  similarity,
  attempt,
  attempts,
  earPass,
  scoreAnalyzeProvider,
}) {
  const sim = similarity || {};
  return [
    "melody_lock: 1",
    `melody_lock_id: ${melodyId}`,
    `melody_similarity: ${sim.score ?? 0}`,
    `melody_similarity_components: ${JSON.stringify(sim.components || {})}`,
    `melody_lock_attempt: ${attempt}`,
    `melody_lock_attempts_total: ${attempts}`,
    `melody_lock_score_pass: ${sim.pass ? "yes" : "no"}`,
    `melody_lock_ear_pass: ${earPass || "pending"}`,
    scoreAnalyzeProvider ? `melody_score_analyze: ${scoreAnalyzeProvider}` : "",
  ].filter(Boolean);
}

function runToClient(row) {
  if (!row) return null;
  const scorePass = Boolean(row.melody_lock_score_pass);
  const ear = row.melody_lock_ear_pass || "pending";
  const fullyPassed = scorePass && ear === "pass";
  return {
    taskId: row.task_id,
    melodyLockId: row.melody_lock_id,
    melodySimilarity: Number(row.melody_similarity) || 0,
    melodySimilarityComponents: row.melody_similarity_components || {},
    melodyLockAttempt: row.melody_lock_attempt,
    melodyScorePass: scorePass,
    melodyEarPass: ear,
    melodyLockPass: fullyPassed,
    adminEarNotes: row.admin_ear_notes || "",
    updatedAt: row.updated_at,
  };
}

module.exports = {
  upsertMelodyLockRun,
  getMelodyLockRunByTask,
  patchMelodyLockEarCheck,
  formatMelodyLockDetailLines,
  runToClient,
};
