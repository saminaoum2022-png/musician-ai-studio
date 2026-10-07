"use strict";

/**
 * Take 2 take-card persistence — service-role only.
 * Linked by task_id immediately; song_id / local_song_id attached after Library save.
 */

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const CREATE_INPUT_KEYS = [
  "mode",
  "prompt",
  "style",
  "title",
  "vocalGender",
  "singerGender",
  "personaId",
  "dialect",
  "dialectHint",
  "arabicAddress",
  "instrumental",
  "songKey",
  "durationPreset",
  "timing",
  "groovePace",
  "prosody",
  "beatStability",
  "avoidTags",
  "artworkStyle",
  "voiceProfile",
  "lyricsLanguage",
  "lyricsDialect",
];

function svcHeaders(extra) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(extra || {}),
  };
}

async function svcFetch(path, opts = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, data: null, text: "Missing Supabase service role" };
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...opts,
      headers: svcHeaders(opts.headers),
    });
    const text = await r.text().catch(() => "");
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { ok: r.ok, status: r.status, data, text };
  } catch (e) {
    return { ok: false, status: 500, data: null, text: String(e?.message || e) };
  }
}

function isTableMissing(result) {
  const text = String(result?.text || result?.error || "");
  const data = result?.data;
  const msg = typeof data === "object" && data
    ? String(data.message || data.hint || data.details || "")
    : "";
  return (
    result?.status === 404
    || /song_take_cards/i.test(text)
    || /song_take_cards/i.test(msg)
    || /does not exist/i.test(text)
    || /does not exist/i.test(msg)
    || /schema cache/i.test(text)
    || /schema cache/i.test(msg)
  );
}

function str(v) {
  return String(v == null ? "" : v).trim();
}

function bool(v) {
  return v === true || v === 1 || v === "1" || v === "true";
}

function normalizeCreateInputs(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const mode = str(src.mode).toLowerCase() === "idea" ? "idea" : "write";
  const vocal = str(src.vocalGender || src.singerGender).toLowerCase();
  const vocalGender = vocal === "f" || vocal === "m" || vocal === "duo" ? vocal : "";
  return {
    mode,
    prompt: str(src.prompt || src.lyrics || src.idea || src.ideaBrief),
    style: str(src.style || src.styleInput),
    title: str(src.title),
    vocalGender,
    singerGender: vocalGender,
    personaId: str(src.personaId),
    dialect: str(src.dialect),
    dialectHint: str(src.dialectHint),
    arabicAddress: str(src.arabicAddress),
    instrumental: bool(src.instrumental),
    songKey: str(src.songKey),
    durationPreset: str(src.durationPreset || src.songDurationPreset),
    timing: str(src.timing),
    groovePace: str(src.groovePace),
    prosody: str(src.prosody || src.prosodyStrictness),
    beatStability: str(src.beatStability),
    avoidTags: str(src.avoidTags || src.avoidTagsInput),
    artworkStyle: str(src.artworkStyle),
    voiceProfile: str(src.voiceProfile),
    lyricsLanguage: str(src.lyricsLanguage) === "auto" ? "" : str(src.lyricsLanguage),
    lyricsDialect: str(src.lyricsDialect),
  };
}

function createInputsFingerprint(inputs) {
  const norm = normalizeCreateInputs(inputs);
  return JSON.stringify(CREATE_INPUT_KEYS.map((k) => norm[k]));
}

function createInputsEqual(a, b) {
  return createInputsFingerprint(a) === createInputsFingerprint(b);
}

function compactProducerJson(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const list = Array.isArray(src.sections) ? src.sections : Array.isArray(raw) ? raw : [];
  const sections = list.map((s) => ({
    name: str(s?.name),
    bars: Number.isFinite(Number(s?.bars)) ? Math.round(Number(s.bars)) : 0,
    arrangement: str(s?.arrangement),
    intensity: Number.isFinite(Number(s?.intensity)) ? Math.round(Number(s.intensity)) : 0,
    lyrics: Array.isArray(s?.lyrics) ? s.lyrics.map((line) => str(line)).filter(Boolean) : [],
    backing: Array.isArray(s?.backing) ? s.backing.map((line) => str(line)).filter(Boolean) : [],
  })).filter((s) => s.name);
  return sections.length ? { sections } : null;
}

function stripTakeSuffix(title) {
  return str(title).replace(/\s*\(Take\s+\d+\)\s*$/i, "").trim();
}

function nextTakeTitle(title, takeNumber) {
  const n = Math.max(2, Math.round(Number(takeNumber) || 2));
  const base = stripTakeSuffix(title) || "Song";
  return `${base} (Take ${n})`;
}

function applyTake2Title(title, body = {}) {
  const parent = str(body.take2ParentSongId || body.take2ParentTaskId);
  if (!parent) return str(title);
  if (/\(Take\s+\d+\)\s*$/i.test(str(title))) return str(title);
  return nextTakeTitle(title, body.take2Number);
}

function publicTakeCard(row) {
  if (!row || typeof row !== "object") return null;
  return {
    id: row.id || "",
    taskId: row.task_id || "",
    songId: row.song_id || "",
    localSongId: row.local_song_id || "",
    parentSongId: row.parent_song_id || "",
    parentTaskId: row.parent_task_id || "",
    createInputs: normalizeCreateInputs(row.create_inputs),
    producerJson: compactProducerJson(row.producer_json),
    finalPrompt: str(row.final_prompt),
    createdAt: row.created_at || "",
    hasCard: Boolean(str(row.final_prompt)),
  };
}

async function insertTakeCard({
  userId,
  taskId,
  songId = "",
  localSongId = "",
  parentSongId = "",
  parentTaskId = "",
  createInputs,
  producerJson,
  finalPrompt,
} = {}) {
  const uid = str(userId);
  const tid = str(taskId);
  if (!uid || !tid) return { ok: false, error: "missing_ids" };
  const row = {
    user_id: uid,
    task_id: tid,
    song_id: str(songId) || null,
    local_song_id: str(localSongId) || null,
    parent_song_id: str(parentSongId) || null,
    parent_task_id: str(parentTaskId) || null,
    create_inputs: normalizeCreateInputs(createInputs),
    producer_json: compactProducerJson(producerJson),
    final_prompt: str(finalPrompt),
  };
  const res = await svcFetch("song_take_cards", {
    method: "POST",
    headers: { Prefer: "return=representation,resolution=merge-duplicates" },
    body: JSON.stringify(row),
  });
  if (isTableMissing(res)) return { ok: false, error: "table_missing" };
  if (!res.ok) return { ok: false, error: res.text || `http_${res.status}` };
  const saved = Array.isArray(res.data) ? res.data[0] : res.data;
  return { ok: true, card: publicTakeCard(saved) || publicTakeCard(row) };
}

async function fetchTakeCardByTaskId({ userId, taskId } = {}) {
  const uid = str(userId);
  const tid = encodeURIComponent(str(taskId));
  if (!uid || !tid) return { ok: false, error: "missing_ids" };
  const res = await svcFetch(
    `song_take_cards?user_id=eq.${encodeURIComponent(uid)}&task_id=eq.${tid}&select=*&limit=1`,
  );
  if (isTableMissing(res)) return { ok: false, error: "table_missing" };
  if (!res.ok) return { ok: false, error: res.text || `http_${res.status}` };
  const row = Array.isArray(res.data) ? res.data[0] : null;
  if (!row) return { ok: false, error: "not_found" };
  return { ok: true, card: publicTakeCard(row) };
}

async function countChildTakes({ userId, parentSongId = "", parentTaskId = "" } = {}) {
  const uid = str(userId);
  if (!uid) return 0;
  const parts = [`user_id=eq.${encodeURIComponent(uid)}`];
  if (str(parentTaskId)) {
    parts.push(`parent_task_id=eq.${encodeURIComponent(str(parentTaskId))}`);
  } else if (str(parentSongId)) {
    parts.push(`parent_song_id=eq.${encodeURIComponent(str(parentSongId))}`);
  } else {
    return 0;
  }
  const res = await svcFetch(`${parts.join("&")}&select=id`, {
    headers: { Prefer: "count=exact" },
  });
  if (!res.ok || isTableMissing(res)) return 0;
  return Array.isArray(res.data) ? res.data.length : 0;
}

async function attachTakeCardSong({ userId, taskId, songId = "", localSongId = "" } = {}) {
  const uid = str(userId);
  const tid = str(taskId);
  if (!uid || !tid) return { ok: false, error: "missing_ids" };
  const patch = {};
  if (str(songId)) patch.song_id = str(songId);
  if (str(localSongId)) patch.local_song_id = str(localSongId);
  if (!Object.keys(patch).length) return { ok: false, error: "empty_patch" };
  const res = await svcFetch(
    `song_take_cards?user_id=eq.${encodeURIComponent(uid)}&task_id=eq.${encodeURIComponent(tid)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    },
  );
  if (isTableMissing(res)) return { ok: false, error: "table_missing" };
  if (!res.ok) return { ok: false, error: res.text || `http_${res.status}` };
  const row = Array.isArray(res.data) ? res.data[0] : res.data;
  return { ok: true, card: publicTakeCard(row) };
}

function buildCreateInputsFromBody(body = {}) {
  const raw = body.take2CreateInputs && typeof body.take2CreateInputs === "object"
    ? body.take2CreateInputs
    : null;
  if (raw) return normalizeCreateInputs(raw);
  const idea = Boolean(body.ideaPrompt || body.ideaBrief);
  return normalizeCreateInputs({
    mode: idea ? "idea" : "write",
    prompt: idea ? (body.ideaBrief || body.prompt) : body.prompt,
    style: body.style,
    title: body.title,
    vocalGender: body.vocalGender,
    singerGender: body.vocalGender || body.singerGender,
    personaId: body.personaId,
    dialect: body.dialect,
    dialectHint: body.dialectHint,
    arabicAddress: body.arabicAddress,
    instrumental: body.instrumental,
    songKey: body.songKey,
    durationPreset: body.songDurationPreset || body.duration,
    timing: body.timing,
    groovePace: body.groovePace,
    prosody: body.prosody || body.prosodyStrictness,
    beatStability: body.beatStability,
    avoidTags: body.negativeTags || body.avoidTags,
    artworkStyle: body.artworkStyle,
    voiceProfile: body.voiceProfile,
    lyricsLanguage: body.lyricsLanguage || body.scriptFormat,
    lyricsDialect: body.lyricsDialect,
  });
}

async function resolveTake2Replay({ userId, isAdmin, body } = {}) {
  if (!isAdmin) return { replay: false, previousTake: null };
  const wantReplay = body?.take2Replay === true || body?.take2Replay === "1" || body?.take2Replay === 1;
  const previousTake = compactProducerJson(body?.previousTake || body?.previous_take);
  const parentSongId = str(body?.take2ParentSongId);
  const parentTaskId = str(body?.take2TaskId || body?.take2ParentTaskId);
  let card = null;
  if (parentTaskId) {
    const fetched = await fetchTakeCardByTaskId({ userId, taskId: parentTaskId });
    if (fetched.ok) card = fetched.card;
  }
  if (wantReplay) {
    const finalPrompt = str(card?.finalPrompt || body?.take2FinalPrompt);
    if (!finalPrompt) return { replay: false, previousTake, error: "missing_replay_prompt" };
    return {
      replay: true,
      finalPrompt,
      producerJson: card?.producerJson || previousTake,
      createInputs: card?.createInputs || null,
      parentSongId,
      parentTaskId,
      card,
    };
  }
  return {
    replay: false,
    previousTake: previousTake || card?.producerJson || null,
    parentSongId,
    parentTaskId,
    card,
  };
}

module.exports = {
  CREATE_INPUT_KEYS,
  normalizeCreateInputs,
  createInputsEqual,
  createInputsFingerprint,
  compactProducerJson,
  stripTakeSuffix,
  nextTakeTitle,
  applyTake2Title,
  publicTakeCard,
  insertTakeCard,
  fetchTakeCardByTaskId,
  countChildTakes,
  attachTakeCardSong,
  buildCreateInputsFromBody,
  resolveTake2Replay,
};
