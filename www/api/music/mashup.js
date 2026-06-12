/**
 * Mashup proxy (provider-neutral path; currently backed by Suno).
 *
 * POST /api/music/mashup
 *   { sourceA, sourceB, prompt?, customMode?, style?, title?, instrumental? }
 *   OR legacy { songIdA, songIdB, prompt? } (library-only)
 *   -> Suno POST /api/v1/generate/mashup
 *
 * Sources: `{ type: "library", songId }` (caller must own row) or
 * `{ type: "public", songId, ownerUserId }` (public_on_profile row).
 */
const { verifyUser, callRpc, isAdminEmail, selectFromTable } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");
const { readJson, sendJson, sunoJsonRequest } = require("../_lib/suno-upstream");

const MASHUP_COST = 12;
const DEFAULT_MODEL = "V5_5";
const DEFAULT_PROMPT = "A dynamic mashup blending two songs together";

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

    const apiKey = process.env.SUNO_API_KEY;
    if (!apiKey) return sendJson(res, 500, { error: "Missing SUNO_API_KEY on server" });

    const user = await verifyUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in to create a mashup." });

    const isAdmin = isAdminEmail(user.email);
    let balanceAfterDebit = null;
    if (!isAdmin) {
      const debit = await callRpc("consume_credits", {
        p_user_id: user.userId,
        p_amount: MASHUP_COST,
        p_reason: "mashup",
        p_ref: "",
      });
      if (!debit.ok || !debit.data?.ok) {
        const status = String(debit.data?.status || "");
        if (status === "insufficient") {
          return sendJson(res, 402, {
            error: "Not enough credits",
            code: "insufficient_credits",
            balance: Number(debit.data?.balance || 0),
            needed: MASHUP_COST,
            message: debit.data?.message || "Not enough credits. Redeem a code from your Profile.",
          });
        }
        return sendJson(res, 500, {
          error: "Credit check failed",
          details: debit.data || debit.error || null,
        });
      }
      balanceAfterDebit = Number(debit.data?.balance || 0);
    }

    const body = await readJson(req);
    const sourceA = parseMashupSource(body?.sourceA, body?.songIdA);
    const sourceB = parseMashupSource(body?.sourceB, body?.songIdB);
    if (!sourceA || !sourceB) {
      if (!isAdmin) await refund(user.userId, MASHUP_COST, "refund_mashup", "missing_ids");
      return sendJson(res, 400, { error: "Pick two songs to mash up." });
    }
    if (sameMashupSource(sourceA, sourceB)) {
      if (!isAdmin) await refund(user.userId, MASHUP_COST, "refund_mashup", "same_song");
      return sendJson(res, 400, { error: "Choose two different songs." });
    }

    const [resolvedA, resolvedB] = await Promise.all([
      resolveMashupSource(user.userId, sourceA, apiKey),
      resolveMashupSource(user.userId, sourceB, apiKey),
    ]);
    if (resolvedA.error) {
      if (!isAdmin) await refund(user.userId, MASHUP_COST, "refund_mashup", "song_a");
      return sendJson(res, 400, { error: resolvedA.error });
    }
    if (resolvedB.error) {
      if (!isAdmin) await refund(user.userId, MASHUP_COST, "refund_mashup", "song_b");
      return sendJson(res, 400, { error: resolvedB.error });
    }

    const customMode = Boolean(body?.customMode);
    const instrumental = Boolean(body?.instrumental);
    const style = String(body?.style || "").trim().slice(0, 1000);
    const title = String(body?.title || "").trim().slice(0, 100);
    let prompt = String(body?.prompt || "").trim();
    if (!prompt) prompt = DEFAULT_PROMPT;
    if (customMode) {
      if (!style) {
        if (!isAdmin) await refund(user.userId, MASHUP_COST, "refund_mashup", "custom_style");
        return sendJson(res, 400, { error: "Custom mashup needs a style." });
      }
      if (!title) {
        if (!isAdmin) await refund(user.userId, MASHUP_COST, "refund_mashup", "custom_title");
        return sendJson(res, 400, { error: "Custom mashup needs a title." });
      }
      if (!instrumental && !prompt) {
        if (!isAdmin) await refund(user.userId, MASHUP_COST, "refund_mashup", "custom_prompt");
        return sendJson(res, 400, { error: "Custom mashup needs lyrics unless instrumental." });
      }
      prompt = prompt.slice(0, 5000);
    } else {
      prompt = prompt.slice(0, 500);
    }

    const uploadUrlList = [resolvedA.song.audioUrl, resolvedB.song.audioUrl];
    const { host, proto } = getHostProto(req);
    const callBackUrl = `${proto}://${host}/api/suno/callback`;

    const payload = {
      uploadUrlList,
      customMode,
      callBackUrl,
      model: String(body?.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
      instrumental,
    };
    if (customMode) {
      payload.style = style;
      payload.title = title;
      if (prompt) payload.prompt = prompt;
    } else {
      payload.prompt = prompt;
    }

    try {
      console.info("[music/mashup] →", {
        model: payload.model,
        customMode: payload.customMode,
        sourceA: resolvedA.song.id,
        sourceB: resolvedB.song.id,
      });
    } catch {}

    const upstream = await sunoJsonRequest("/api/v1/generate/mashup", {
      method: "POST",
      apiKey,
      body: payload,
    });

    const taskId = String(upstream.data?.data?.taskId || "").trim();
    try {
      console.info("[music/mashup] ←", {
        httpStatus: upstream.httpStatus,
        code: upstream.code,
        taskId: taskId || null,
      });
    } catch {}

    if (!upstream.ok || upstream.code !== 200 || !taskId) {
      if (!isAdmin) await refund(user.userId, MASHUP_COST, "refund_mashup", "upstream_fail");
      const msg =
        upstream.data?.msg ||
        upstream.data?.message ||
        upstream.data?.error ||
        "Mashup generation failed to start";
      return sendJson(res, 502, { error: String(msg).slice(0, 240), code: upstream.code });
    }

    return sendJson(res, 200, {
      ok: true,
      taskId,
      sources: {
        a: pickSourceMeta(resolvedA.song),
        b: pickSourceMeta(resolvedB.song),
      },
      _credits: {
        spent: isAdmin ? 0 : MASHUP_COST,
        balance: balanceAfterDebit,
        admin: isAdmin || undefined,
      },
    });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};

function parseMashupSource(raw, legacySongId) {
  if (raw && typeof raw === "object") {
    const type = String(raw.type || "library").trim().toLowerCase();
    const songId = cleanSongId(raw.songId || raw.id);
    if (!songId) return null;
    if (type === "public") {
      const ownerUserId = String(raw.ownerUserId || "").trim();
      if (!ownerUserId) return null;
      return { type: "public", songId, ownerUserId };
    }
    return { type: "library", songId };
  }
  const sid = cleanSongId(legacySongId);
  if (sid) return { type: "library", songId: sid };
  return null;
}

function sameMashupSource(a, b) {
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if (a.songId !== b.songId) return false;
  if (a.type === "public") return a.ownerUserId === b.ownerUserId;
  return true;
}

function pickSourceMeta(song) {
  return {
    songId: song.id,
    title: song.title,
    artUrl: song.artUrl,
    taskId: song.taskId,
    audioId: song.audioId,
    sourceType: song.sourceType || "library",
    ownerUserId: song.ownerUserId || undefined,
    creatorUsername: song.creatorUsername || undefined,
  };
}

function cleanSongId(v) {
  const s = String(v || "").trim();
  if (!s || s.length > 80) return "";
  return s;
}

async function resolveMashupSource(callerUserId, source, apiKey) {
  if (source.type === "public") {
    return resolvePublicSongForMashup(source.songId, source.ownerUserId, apiKey);
  }
  return resolveLibrarySongForMashup(callerUserId, source.songId, apiKey);
}

async function resolveLibrarySongForMashup(userId, songId, apiKey) {
  const sid = cleanSongId(songId);
  const uid = String(userId || "").trim();
  if (!sid || !uid) return { error: "Missing song id" };

  const q =
    `user_songs?select=id,user_id,title,art_url,song_url,task_id,audio_id,kind` +
    `&id=eq.${encodeURIComponent(sid)}&user_id=eq.${encodeURIComponent(uid)}&limit=1`;
  const r = await selectFromTable(q);
  const row = Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
  if (!row) return { error: "Song not found in your library." };

  const urlResult = await resolveSongAudioUrl(row, apiKey);
  if (urlResult.error) return urlResult;

  return {
    song: {
      id: String(row.id || sid),
      title: String(row.title || "Song").trim() || "Song",
      artUrl: String(row.art_url || "").trim(),
      audioUrl: urlResult.url,
      taskId: String(row.task_id || "").trim(),
      audioId: String(row.audio_id || "").trim(),
      sourceType: "library",
    },
  };
}

async function resolvePublicSongForMashup(songId, ownerUserId, apiKey) {
  const sid = cleanSongId(songId);
  const uid = String(ownerUserId || "").trim();
  if (!sid || !uid) return { error: "Missing public song reference." };

  const q =
    `user_songs?select=id,user_id,title,art_url,song_url,task_id,audio_id,kind` +
    `&id=eq.${encodeURIComponent(sid)}&user_id=eq.${encodeURIComponent(uid)}` +
    `&public_on_profile=eq.true&limit=1`;
  const r = await selectFromTable(q);
  const row = Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
  if (!row) return { error: "That public song is not available for mashup." };

  const urlResult = await resolveSongAudioUrl(row, apiKey);
  if (urlResult.error) return urlResult;

  return {
    song: {
      id: String(row.id || sid),
      title: String(row.title || "Song").trim() || "Song",
      artUrl: String(row.art_url || "").trim(),
      audioUrl: urlResult.url,
      taskId: String(row.task_id || "").trim(),
      audioId: String(row.audio_id || "").trim(),
      sourceType: "public",
      ownerUserId: uid,
    },
  };
}

async function resolveSongAudioUrl(row, apiKey) {
  let url = unwrapAudioUrl(row.song_url);
  if (!isHttpUrl(url) && row.task_id) {
    url = await refreshAudioFromSuno(apiKey, row.task_id, row.audio_id);
  }
  if (!isHttpUrl(url)) {
    const label = String(row.title || "Song").trim() || "Song";
    return {
      error: `${label} needs a fresh audio link — open it once to refresh, then try again.`,
    };
  }
  return { url };
}

async function refreshAudioFromSuno(apiKey, taskId, audioId) {
  const tid = String(taskId || "").trim();
  if (!tid) return "";
  const upstream = await sunoJsonRequest("/api/v1/generate/record-info", {
    apiKey,
    query: { taskId: tid },
  });
  if (!upstream.ok) return "";
  const st = String(upstream.data?.data?.status || "").toUpperCase();
  if (st !== "SUCCESS") return "";
  const arr = upstream.data?.data?.response?.sunoData || upstream.data?.data?.response?.suno_data || [];
  const clips = Array.isArray(arr) ? arr : [];
  const wantAid = String(audioId || "").trim();
  const pick = (clip) =>
    String(
      clip?.sourceAudioUrl ||
        clip?.source_audio_url ||
        clip?.sourceStreamAudioUrl ||
        clip?.source_stream_audio_url ||
        clip?.audioUrl ||
        clip?.audio_url ||
        clip?.streamAudioUrl ||
        clip?.stream_audio_url ||
        "",
    ).trim();
  if (wantAid) {
    for (const c of clips) {
      const cid = String(c?.id || c?.audioId || c?.audio_id || "").trim();
      if (cid && cid === wantAid) return pick(c);
    }
  }
  return clips.length ? pick(clips[0]) : "";
}

function unwrapAudioUrl(url) {
  let cur = String(url || "").trim();
  if (!cur) return "";
  for (let i = 0; i < 8; i++) {
    if (!cur.toLowerCase().includes("api/suno/audio")) break;
    try {
      const base = cur.includes("://") ? cur : `https://nabadai.com${cur.startsWith("/") ? cur : `/${cur}`}`;
      const u = new URL(base);
      const inner = u.searchParams.get("url");
      if (!inner) break;
      cur = inner.includes("%") ? decodeURIComponent(inner) : inner;
    } catch {
      break;
    }
  }
  return cur.trim();
}

function isHttpUrl(s) {
  return /^https?:\/\//i.test(String(s || "").trim());
}

async function refund(userId, amount, reason, ref) {
  if (!userId || !amount) return;
  try {
    await callRpc("refund_credits", {
      p_user_id: userId,
      p_amount: amount,
      p_reason: reason,
      p_ref: ref || "",
    });
  } catch {}
}

function getHostProto(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const proto = req.headers["x-forwarded-proto"] || "https";
  return { host, proto };
}
