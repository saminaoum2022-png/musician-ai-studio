/**
 * POST /api/songs/instrumental   { url, title?, songId? }
 *
 * Instrumental version of one of the caller's own songs, from any engine (Lyria, Suno, ElevenLabs…),
 * via ElevenLabs stem separation (2 stems). The instrumental is saved to song_archive and returned.
 *
 * Off on production until ELEVENLABS_STEMS_ENABLED=1 (always on for Vercel previews / staging).
 */
const { applyCors } = require("../_lib/cors");
const { verifyUser, callRpc, isAdminEmail, sendJson, readJsonBody } = require("../_lib/credits-auth");
const { requireProForWebApi } = require("../_lib/pro-web-gate");
const { keyFromStorageUrl, fetchStorageObjectBuffer } = require("../_lib/storage-private");
const { uploadObject } = require("../_lib/supabase-storage");
const { readZipEntries } = require("../_lib/zip-read");
const { logProviderUsage } = require("../_lib/provider-usage-log");

const MAX_AUDIO_BYTES = 45 * 1024 * 1024;
const ELEVEN_TIMEOUT_MS = 170000;
const INSTRUMENTAL_CREDITS = Math.max(1, Number(process.env.INSTRUMENTAL_CREDITS || "40") || 40);

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

function pickInstrumentalEntry(entries) {
  const audio = entries.filter((e) => /\.(mp3|wav|flac|ogg|opus|m4a|aac)$/i.test(e.name));
  const byName = (re) => audio.find((e) => re.test(e.name.toLowerCase()));
  return (
    byName(/instrumental|no[_ -]?vocal|accomp|backing|karaoke/) ||
    audio.find((e) => !/vocal|voice|vox|sing/.test(e.name.toLowerCase())) ||
    null
  );
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return sendJson(res, 405, { error: "POST required" });

  if (!stemsEnabled()) {
    return sendJson(res, 503, { error: "Instrumental extraction is not available yet.", code: "stems_disabled" });
  }
  const apiKey = String(process.env.ELEVENLABS_API_KEY || "").trim();
  if (!apiKey) return sendJson(res, 503, { error: "Instrumental service not configured.", code: "stems_disabled" });

  const user = await verifyUser(req);
  if (!user) return sendJson(res, 401, { error: "Sign in to get an instrumental." });

  let body = {};
  try { body = await readJsonBody(req); } catch { body = {}; }
  const srcUrl = unwrapAudioProxy(String(body?.url || "").trim());
  if (!srcUrl || !/^https?:\/\//i.test(srcUrl) || isBlockedFetchUrl(srcUrl)) {
    return sendJson(res, 400, { error: "This song has no usable audio." });
  }

  let isAdmin = isAdminEmail(user.email);
  if (!isAdmin) {
    try {
      const { fetchProfileRole } = require("../_lib/admin-auth");
      isAdmin = (await fetchProfileRole(user.userId)) === "admin";
    } catch {}
  }
  if (!isAdmin) {
    const gate = await requireProForWebApi(req, user.userId);
    if (!gate.ok) return sendJson(res, gate.status, { error: gate.error, code: gate.code });
  }

  // Load the source audio. Archived songs: owner (or admin) only.
  let audio;
  try {
    const archiveKey = /\/storage\/v1\/object\/(?:public\/)?song_archive\//i.test(srcUrl)
      ? keyFromStorageUrl(srcUrl, "song_archive")
      : "";
    if (archiveKey) {
      const owner = archiveKey.split("/")[0] || "";
      if (!isAdmin && owner !== user.userId) {
        return sendJson(res, 403, { error: "You can only get an instrumental for your own songs." });
      }
      audio = (await fetchStorageObjectBuffer("song_archive", archiveKey, MAX_AUDIO_BYTES)).buffer;
    } else {
      audio = await fetchAudio(srcUrl, MAX_AUDIO_BYTES);
    }
  } catch (e) {
    return sendJson(res, 502, { error: `Could not read the song audio (${e?.message || "error"}).` });
  }

  // Charge up front, refund on any failure. Admin/owner accounts are not charged.
  const cost = INSTRUMENTAL_CREDITS;
  let balanceAfter = null;
  if (!isAdmin) {
    const debit = await callRpc("consume_credits", {
      p_user_id: user.userId,
      p_amount: cost,
      p_reason: "instrumental_stems",
      p_ref: "",
    });
    if (!debit.ok || !debit.data?.ok) {
      if (String(debit.data?.status || "") === "insufficient") {
        return sendJson(res, 402, {
          error: "Not enough credits",
          code: "insufficient_credits",
          balance: Number(debit.data?.balance || 0),
          needed: cost,
        });
      }
      return sendJson(res, 500, { error: "Credit check failed" });
    }
    balanceAfter = Number(debit.data?.balance || 0);
  }
  const refund = async () => {
    if (isAdmin) return;
    try {
      await callRpc("refund_credits", { p_user_id: user.userId, p_amount: cost, p_reason: "refund_instrumental_stems", p_ref: "" });
    } catch {}
  };
  const fail = async (status, error, extra = {}) => {
    await refund();
    try { await logProviderUsage({ provider: "elevenlabs", kind: "stem_separation", userId: user.userId, status: "failed" }); } catch {}
    return sendJson(res, status, { error, ...extra });
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
      return await fail(502, "The instrumental service could not process this song. You were not charged.", { code: "stems_failed" });
    }
    const entries = readZipEntries(zipBuf);
    const pick = pickInstrumentalEntry(entries);
    if (!pick) {
      console.warn("[songs/instrumental] no instrumental stem in", entries.map((e) => e.name).join(", "));
      return await fail(502, "No instrumental came back for this song. You were not charged.", { code: "stems_missing" });
    }
    const out = pick.data();
    const key = `${user.userId}/inst-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
    const up = await uploadObject({ bucket: "song_archive", key, body: out, contentType: "audio/mpeg" });
    if (!up.ok) return await fail(502, "Could not save the instrumental. You were not charged.", { code: "stems_save_failed" });
    try { await logProviderUsage({ provider: "elevenlabs", kind: "stem_separation", userId: user.userId, status: "completed" }); } catch {}
    return sendJson(res, 200, {
      ok: true,
      url: up.url,
      key,
      stems: entries.map((e) => e.name),
      creditsSpent: isAdmin ? 0 : cost,
      balance: balanceAfter,
    });
  } catch (e) {
    console.warn("[songs/instrumental] failed", e?.message || e);
    return await fail(502, "The instrumental service timed out. You were not charged.", { code: "stems_failed" });
  }
};
