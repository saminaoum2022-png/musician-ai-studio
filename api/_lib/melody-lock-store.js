/**
 * Persist Melody Lock sources via Supabase REST (service role).
 */
const crypto = require("crypto");

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
    return { ok: false, status: 500, error: "Missing Supabase service role configuration." };
  }
  const headers = serviceHeaders(body ? { "Content-Type": "application/json" } : {});
  if (prefer) headers.Prefer = prefer;
  try {
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
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 500, error: e?.message || String(e) };
  }
}

function newMelodyId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function insertMelodyLockSource(row) {
  const r = await rest("melody_lock_sources", {
    method: "POST",
    body: row,
    prefer: "return=representation",
  });
  if (!r.ok) {
    return {
      ok: false,
      status: r.status === 404 || r.status === 400 ? 503 : r.status,
      error:
        r.status === 404
          ? "melody_lock_sources table missing — apply supabase/melody_lock_sources.sql"
          : typeof r.data === "object" && r.data?.message
            ? r.data.message
            : "Could not save melody source.",
    };
  }
  const saved = Array.isArray(r.data) ? r.data[0] : r.data;
  return { ok: true, row: saved };
}

async function getMelodyLockSource(melodyId, userId) {
  const id = String(melodyId || "").trim();
  const uid = String(userId || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, status: 400, error: "Invalid melody id." };
  const r = await rest(
    `melody_lock_sources?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(uid)}&select=*&limit=1`,
  );
  if (!r.ok) return { ok: false, status: r.status || 500, error: "Could not load melody." };
  const row = Array.isArray(r.data) ? r.data[0] : null;
  if (!row) return { ok: false, status: 404, error: "Melody not found." };
  return { ok: true, row };
}

function rowToClientPayload(row) {
  const melody = row?.melody_json || {};
  return {
    melodyId: row.id,
    sourceKind: row.source_kind || "hum",
    sourceDurationSec: row.source_duration_sec,
    sourceAudioUrl: row.source_audio_url || null,
    melody,
    notes: melody.notes || [],
    tempoBpm: melody.tempoBpm || row.inferred_bpm,
    meter: melody.meter || "4/4",
    inferredBpm: row.inferred_bpm,
    inferredKey: row.inferred_key || melody.inferredKey,
    contourSummary: row.contour_summary || melody.contourSummary,
    lyriaMelodyBlock: row.lyria_melody_block || "",
    lyriaPromptPreview: row.lyria_prompt_preview || "",
    analyzeProvider: row.analyze_provider || "",
    createdAt: row.created_at,
  };
}

module.exports = {
  newMelodyId,
  insertMelodyLockSource,
  getMelodyLockSource,
  rowToClientPayload,
};
