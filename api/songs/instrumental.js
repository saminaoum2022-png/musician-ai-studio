/**
 * Instrumental version of one of the caller's own songs, from any engine (Lyria, Suno, ElevenLabs…),
 * via ElevenLabs stem separation (2 stems). The result is saved to song_archive.
 *
 *   POST /api/songs/instrumental  { url, title?, jobId, quote? }
 *        quote:true  -> { ok, quote:true, credits, seconds }   (no charge, nothing started)
 *        otherwise   -> charges, runs, and returns { ok, state:"done", url, ... } (or an error + refund)
 *   GET  /api/songs/instrumental?jobId=...  -> the job record { state: processing|done|failed, url? }
 *
 * A job record is written to storage BEFORE the paid call, so if the app is closed mid-wait the
 * client can pick the finished instrumental up later (and a stuck job is refunded exactly once).
 *
 * Off on production until ELEVENLABS_STEMS_ENABLED=1 (always on for Vercel previews / staging).
 * Price: flat INSTRUMENTAL_CREDITS (default 50) for songs up to 4 minutes (every Lyria song: its hard cap is ~3 min);
 * INSTRUMENTAL_CREDITS_LONG (default 75) for longer songs from other engines, up to 8 minutes.
 */
const { applyCors } = require("../_lib/cors");
const { verifyUser, callRpc, isAdminEmail, sendJson, readJsonBody } = require("../_lib/credits-auth");
const { requireProForWebApi } = require("../_lib/pro-web-gate");
const { keyFromStorageUrl, fetchStorageObjectBuffer } = require("../_lib/storage-private");
const { uploadObject, publicObjectUrl, readStorageJson } = require("../_lib/supabase-storage");
const { readZipEntries } = require("../_lib/zip-read");
const { logProviderUsage } = require("../_lib/provider-usage-log");

const BUCKET = "song_archive";
const MAX_AUDIO_BYTES = 45 * 1024 * 1024;
const MAX_SECONDS = 8 * 60;
const ELEVEN_TIMEOUT_MS = 170000;
const STALE_JOB_MS = 8 * 60 * 1000;
const FLAT_CREDITS = Math.max(1, Number(process.env.INSTRUMENTAL_CREDITS || "50") || 50);
const LONG_CREDITS = Math.max(FLAT_CREDITS, Number(process.env.INSTRUMENTAL_CREDITS_LONG || "75") || 75);
const FLAT_UP_TO_SECONDS = 4 * 60;

function stemsEnabled() {
  if (String(process.env.VERCEL_ENV || "").toLowerCase() !== "production") return true;
  return String(process.env.ELEVENLABS_STEMS_ENABLED || "") === "1";
}

function isBlockedFetchUrl(url) {
  let u;
  try { u = new URL(String(url || "")); } catch { return true; }
  if (!/^https?:$/.test(u.protocol)) return true;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (h.includes(":") && (h === "::1" || h === "::" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80") || h.startsWith("::ffff:"))) return true;
  return false;
}

/** Peel our own /api/suno/audio?url= wrapper so we fetch the real file. */
function unwrapAudioProxy(url) {
  let cur = String(url || "").trim();
  for (let i = 0; i < 6; i += 1) {
    if (!/\/api\/suno\/audio/i.test(cur)) break;
    try {
      const u = new URL(cur, "https://www.nabadai.com");
      const inner = u.searchParams.get("url");
      if (!inner) break;
      cur = inner;
    } catch { break; }
  }
  return cur;
}

async function fetchAudio(url, maxBytes) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": "NabadAi-Instrumental/1.0" } });
    if (!r.ok) throw new Error(`audio_fetch_${r.status}`);
    const len = Number(r.headers.get("content-length") || 0);
    if (len && len > maxBytes) throw new Error("audio_too_large");
    const ab = await r.arrayBuffer();
    if (ab.byteLength > maxBytes) throw new Error("audio_too_large");
    if (ab.byteLength < 2048) throw new Error("audio_too_small");
    return Buffer.from(ab);
  } finally {
    clearTimeout(timer);
  }
}

function probeDurationSec(buf) {
  try {
    const fs = require("fs");
    const os = require("os");
    const path = require("path");
    const { spawnSync } = require("child_process");
    const ffmpegPath = require("ffmpeg-static");
    if (!ffmpegPath) return 0;
    const p = path.join(os.tmpdir(), `inst-probe-${Date.now()}-${Math.random().toString(36).slice(2)}.audio`);
    fs.writeFileSync(p, buf);
    try {
      const r = spawnSync(ffmpegPath, ["-hide_banner", "-i", p], { encoding: "utf8" });
      const m = `${r.stderr || ""}\n${r.stdout || ""}`.match(/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
      return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + parseFloat(m[3]) : 0;
    } finally {
      try { fs.unlinkSync(p); } catch {}
    }
  } catch {
    return 0;
  }
}

/** One simple price; only long songs (other engines) cost more because the provider bills per minute. */
function creditsForSeconds(seconds) {
  return (Number(seconds) || 0) > FLAT_UP_TO_SECONDS ? LONG_CREDITS : FLAT_CREDITS;
}

function pickInstrumentalEntry(entries) {
  const audio = entries.filter((e) => /\.(mp3|wav|flac|ogg|opus|m4a|aac)$/i.test(e.name));
  const byName = (re) => audio.find((e) => re.test(e.name.toLowerCase()));
  return (
    byName(/instrumental|no[_ -]?vocal|accomp|backing|karaoke/) ||
    audio.find((e) => !/vocal|voice|vox|sing/.test(e.name.toLowerCase())) ||
    null
  );
}

function jobKey(userId, jobId) {
  return `${userId}/_jobs/inst-${jobId}.json`;
}
async function readJob(userId, jobId) {
  return readStorageJson(publicObjectUrl(BUCKET, jobKey(userId, jobId)));
}
async function writeJob(userId, jobId, rec) {
  const up = await uploadObject({
    bucket: BUCKET,
    key: jobKey(userId, jobId),
    body: Buffer.from(JSON.stringify(rec)),
    contentType: "application/json",
  });
  return up.ok;
}

async function isAdminUser(user) {
  if (isAdminEmail(user.email)) return true;
  try {
    const { fetchProfileRole } = require("../_lib/admin-auth");
    return (await fetchProfileRole(user.userId)) === "admin";
  } catch {
    return false;
  }
}

async function refundOnce(user, rec) {
  if (!rec || rec.refunded || !rec.credits) return rec;
  const next = { ...rec, refunded: true };
  try {
    await callRpc("refund_credits", {
      p_user_id: user.userId,
      p_amount: rec.credits,
      p_reason: "refund_instrumental_stems",
      p_ref: String(rec.jobId || ""),
    });
  } catch {}
  return next;
}

const VALID_JOB_ID = /^[a-z0-9_-]{6,48}$/i;

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST" && req.method !== "GET") return sendJson(res, 405, { error: "POST or GET required" });

  if (!stemsEnabled()) {
    return sendJson(res, 503, { error: "Instrumental extraction is not available yet.", code: "stems_disabled" });
  }
  const user = await verifyUser(req);
  if (!user) return sendJson(res, 401, { error: "Sign in to get an instrumental." });

  // ---- Job status (resume after the app was closed) ----
  if (req.method === "GET") {
    const q = new URL(req.url || "/", "https://x").searchParams;
    const jobId = String(q.get("jobId") || "").trim();
    if (!VALID_JOB_ID.test(jobId)) return sendJson(res, 400, { error: "Bad jobId" });
    let rec = await readJob(user.userId, jobId);
    if (!rec) return sendJson(res, 404, { error: "Job not found", code: "job_not_found" });
    if (rec.state === "processing" && Date.now() - Number(rec.startedAt || 0) > STALE_JOB_MS) {
      rec = await refundOnce(user, { ...rec, state: "failed", error: "The instrumental timed out. Your credits were returned." });
      await writeJob(user.userId, jobId, rec);
    }
    return sendJson(res, 200, { ok: true, ...rec });
  }

  // ---- Start (or quote) ----
  const apiKey = String(process.env.ELEVENLABS_API_KEY || "").trim();
  if (!apiKey) return sendJson(res, 503, { error: "Instrumental service not configured.", code: "stems_disabled" });

  let body = {};
  try { body = await readJsonBody(req); } catch { body = {}; }
  const quoteOnly = body?.quote === true;
  const jobId = String(body?.jobId || "").trim();
  if (!quoteOnly && !VALID_JOB_ID.test(jobId)) return sendJson(res, 400, { error: "Missing jobId" });
  const srcUrl = unwrapAudioProxy(String(body?.url || "").trim());
  if (!srcUrl || !/^https?:\/\//i.test(srcUrl) || isBlockedFetchUrl(srcUrl)) {
    return sendJson(res, 400, { error: "This song has no usable audio." });
  }

  const isAdmin = await isAdminUser(user);
  if (!isAdmin) {
    const gate = await requireProForWebApi(req, user.userId);
    if (!gate.ok) return sendJson(res, gate.status, { error: gate.error, code: gate.code });
  }

  // Same job id again (client retry / resume): never charge twice.
  if (!quoteOnly) {
    const existing = await readJob(user.userId, jobId);
    if (existing) return sendJson(res, 200, { ok: true, ...existing });
  }

  // Load the source audio. Archived songs: owner (or admin) only.
  let audio;
  try {
    const archiveKey = /\/storage\/v1\/object\/(?:public\/)?song_archive\//i.test(srcUrl)
      ? keyFromStorageUrl(srcUrl, BUCKET)
      : "";
    if (archiveKey) {
      const owner = archiveKey.split("/")[0] || "";
      if (!isAdmin && owner !== user.userId) {
        return sendJson(res, 403, { error: "You can only get an instrumental for your own songs." });
      }
      audio = (await fetchStorageObjectBuffer(BUCKET, archiveKey, MAX_AUDIO_BYTES)).buffer;
    } else {
      audio = await fetchAudio(srcUrl, MAX_AUDIO_BYTES);
    }
  } catch (e) {
    return sendJson(res, 502, { error: `Could not read the song audio (${e?.message || "error"}).` });
  }

  const seconds = probeDurationSec(audio);
  if (seconds > MAX_SECONDS) {
    return sendJson(res, 400, { error: "This song is too long for an instrumental (max 8 minutes).", code: "too_long" });
  }
  const credits = isAdmin ? 0 : creditsForSeconds(seconds || 180);
  if (quoteOnly) return sendJson(res, 200, { ok: true, quote: true, credits, seconds: Math.round(seconds) });

  // Charge up front; the job record exists before the paid call so closing the app cannot lose it.
  let balanceAfter = null;
  if (credits > 0) {
    const debit = await callRpc("consume_credits", {
      p_user_id: user.userId,
      p_amount: credits,
      p_reason: "instrumental_stems",
      p_ref: jobId,
    });
    if (!debit.ok || !debit.data?.ok) {
      if (String(debit.data?.status || "") === "insufficient") {
        return sendJson(res, 402, {
          error: "Not enough credits",
          code: "insufficient_credits",
          balance: Number(debit.data?.balance || 0),
          needed: credits,
        });
      }
      return sendJson(res, 500, { error: "Credit check failed" });
    }
    balanceAfter = Number(debit.data?.balance || 0);
  }
  let rec = {
    jobId,
    state: "processing",
    title: String(body?.title || "").slice(0, 160),
    startedAt: Date.now(),
    credits,
    refunded: false,
  };
  await writeJob(user.userId, jobId, rec);

  const fail = async (status, error, code) => {
    rec = await refundOnce(user, { ...rec, state: "failed", error, code });
    await writeJob(user.userId, jobId, rec);
    try { await logProviderUsage({ provider: "elevenlabs", kind: "stem_separation", userId: user.userId, status: "failed", ref: jobId }); } catch {}
    return sendJson(res, status, { error, code, jobId, state: "failed" });
  };

  try {
    const form = new FormData();
    form.append("file", new Blob([audio]), "song.mp3");
    form.append("stem_variation_id", "two_stems_v1");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ELEVEN_TIMEOUT_MS);
    let r;
    try {
      r = await fetch("https://api.elevenlabs.io/v1/music/stem-separation?output_format=mp3_44100_128", {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body: form,
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const zipBuf = Buffer.from(await r.arrayBuffer());
    if (!r.ok) {
      console.warn("[songs/instrumental] elevenlabs", r.status, zipBuf.toString("utf8").slice(0, 300));
      return await fail(502, "The instrumental service could not process this song. You were not charged.", "stems_failed");
    }
    const entries = readZipEntries(zipBuf);
    const pick = pickInstrumentalEntry(entries);
    if (!pick) {
      console.warn("[songs/instrumental] no instrumental stem in", entries.map((e) => e.name).join(", "));
      return await fail(502, "No instrumental came back for this song. You were not charged.", "stems_missing");
    }
    const key = `${user.userId}/inst-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
    const up = await uploadObject({ bucket: BUCKET, key, body: pick.data(), contentType: "audio/mpeg" });
    if (!up.ok) return await fail(502, "Could not save the instrumental. You were not charged.", "stems_save_failed");
    rec = { ...rec, state: "done", url: up.url, key, finishedAt: Date.now(), seconds: Math.round(seconds) };
    await writeJob(user.userId, jobId, rec);
    try { await logProviderUsage({ provider: "elevenlabs", kind: "stem_separation", userId: user.userId, status: "completed", ref: jobId }); } catch {}
    return sendJson(res, 200, { ok: true, ...rec, creditsSpent: credits, balance: balanceAfter });
  } catch (e) {
    console.warn("[songs/instrumental] failed", e?.message || e);
    return await fail(502, "The instrumental service timed out. You were not charged.", "stems_failed");
  }
};
