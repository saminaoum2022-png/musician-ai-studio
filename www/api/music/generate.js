/**
 * Provider-neutral full song generation — MiniMax + Lyria admin spikes.
 *
 * POST /api/music/generate?provider=minimax|lyria
 *   Same auth/credits shell as /api/suno/generate; admin-only unless
 *   MINIMAX_GENERATE_ENABLED=1 or LYRIA_GENERATE_ENABLED=1 (Preview/staging).
 *
 * Env:
 * - MINIMAX_API_KEY, MINIMAX_KEY_KIND, MINIMAX_MUSIC_MODEL, MINIMAX_GENERATE_ENABLED
 * - GEMINI_API_KEY / GOOGLE_API_KEY, LYRIA_MUSIC_MODEL, LYRIA_GENERATE_ENABLED
 */
const crypto = require("crypto");
const {
  verifyUser,
  callRpc,
} = require("../_lib/credits-auth");
const { userIsAdmin } = require("../_lib/admin-auth");
const { applyCors } = require("../_lib/cors");
const { readJson, sendJson } = require("../_lib/suno-upstream");
const {
  minimaxGenerateMusic,
  minimaxUserMessage,
  extractMinimaxAudio,
  resolveMinimaxMusicModel,
  minimaxKeyKind,
} = require("../_lib/minimax-upstream");
const {
  buildLyriaPrompt,
  lyriaGenerateMusic,
  lyriaGenerateEnabled,
  resolveLyriaModel,
} = require("../_lib/lyria-upstream");
const {
  saveMusicProviderTaskStatus,
  providerFolder,
} = require("../_lib/music-provider-task-store");
const { uploadObject } = require("../_lib/supabase-storage");
const {
  queueLogMusicGeneration,
  queueUpdateMusicGenerationByTaskId,
} = require("../_lib/music-generation-log");

const FULL_SONG_COST = 12;
const BUCKET = "song_archive";
const MINIMAX_PROVIDER_COST_USD = Number(process.env.MINIMAX_USD_PER_TRACK || "0");
const LYRIA_PROVIDER_COST_USD = Number(process.env.LYRIA_USD_PER_TRACK || "0.08");

function minimaxGenerateEnabled() {
  const v = String(process.env.MINIMAX_GENERATE_ENABLED || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function resolveProvider(req) {
  try {
    const url = new URL(req.url, "http://localhost");
    const p = String(url.searchParams.get("provider") || "minimax").trim().toLowerCase();
    if (p === "lyria") return "lyria";
    return "minimax";
  } catch {
    return "minimax";
  }
}

function newTaskId(provider) {
  const prefix = provider === "lyria" ? "lyr" : "mmx";
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function buildMusicPrompt(body) {
  const style = String(body?.style || "").trim();
  const instruments = String(body?.instruments || "").trim();
  const songKey = String(body?.songKey || "").trim();
  const voiceTimbre = String(body?.voiceTimbre || "").trim();
  const bits = [style];
  if (songKey) bits.push(`Key: ${songKey}`);
  if (instruments) bits.push(`Instruments: ${instruments}`);
  if (voiceTimbre) bits.push(`Voice timbre: ${voiceTimbre}`);
  return bits.filter(Boolean).join(", ").slice(0, 2000);
}

function buildPromptLabel(prompt, style, title) {
  const bits = [String(title || "").trim(), String(prompt || "").trim(), String(style || "").trim()]
    .filter(Boolean);
  return bits.join(" · ").slice(0, 500);
}

async function persistAudioBuffer({ userId, taskId, buffer, contentType = "audio/mpeg" }) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 128) {
    return { ok: false, error: "missing_audio_bytes" };
  }
  const ext = String(contentType).includes("wav") ? "wav" : "mp3";
  const folder = providerFolder(taskId);
  const key = `${userId}/${folder}/${taskId}.${ext}`;
  const up = await uploadObject({
    bucket: BUCKET,
    key,
    body: buffer,
    contentType: String(contentType).includes("audio") ? contentType : "audio/mpeg",
  });
  if (!up.ok) return { ok: false, error: up.error || "upload_failed" };
  return { ok: true, url: up.url };
}

async function persistRemoteAudio({ userId, taskId, remoteUrl }) {
  const source = String(remoteUrl || "").trim();
  if (!source) return { ok: false, error: "missing_audio_url" };
  try {
    const r = await fetch(source, { method: "GET", redirect: "follow" });
    if (!r.ok) {
      return { ok: false, error: `audio_fetch_${r.status}` };
    }
    const ab = await r.arrayBuffer();
    const buffer = Buffer.from(ab);
    const ct = String(r.headers.get("content-type") || "audio/mpeg").split(";")[0];
    const folder = providerFolder(taskId);
    const ext = ct.includes("wav") ? "wav" : "mp3";
    const key = `${userId}/${folder}/${taskId}.${ext}`;
    const up = await uploadObject({
      bucket: BUCKET,
      key,
      body: buffer,
      contentType: ct.includes("audio") ? ct : "audio/mpeg",
    });
    if (!up.ok) return { ok: false, error: up.error || "upload_failed" };
    return { ok: true, url: up.url };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

function buildSunoStatusPayload({ taskId, title, lyrics, audioUrl, audioId, provider }) {
  const clip = {
    id: audioId,
    audioId,
    audio_url: audioUrl,
    audioUrl,
    title: String(title || "").trim() || "Generated song",
    prompt: String(lyrics || "").trim(),
  };
  return {
    code: 200,
    data: {
      taskId,
      status: "SUCCESS",
      response: {
        sunoData: [clip],
        suno_data: [clip],
      },
    },
    _provider: provider,
  };
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

async function handleMinimaxGenerate(req, res, { user, isAdmin, body }) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) return sendJson(res, 500, { error: "Missing MINIMAX_API_KEY on server" });

  if (!isAdmin && !minimaxGenerateEnabled()) {
    return sendJson(res, 403, {
      error: "MiniMax generation is admin-only on this environment.",
      code: "minimax_admin_only",
    });
  }

  if (body?.personaId || body?.hasReference) {
    return sendJson(res, 400, {
      error: "MiniMax spike does not support persona or reference uploads yet.",
      code: "minimax_unsupported",
    });
  }

  let balanceAfterDebit = null;
  if (!isAdmin) {
    const debit = await callRpc("consume_credits", {
      p_user_id: user.userId,
      p_amount: FULL_SONG_COST,
      p_reason: "full_song",
      p_ref: "minimax",
    });
    if (!debit.ok || !debit.data?.ok) {
      const status = String(debit.data?.status || "");
      if (status === "insufficient") {
        return sendJson(res, 402, {
          error: "Not enough credits",
          code: "insufficient_credits",
          balance: Number(debit.data?.balance || 0),
          needed: FULL_SONG_COST,
        });
      }
      return sendJson(res, 500, { error: "Credit check failed", details: debit.data || debit.error || null });
    }
    balanceAfterDebit = Number(debit.data?.balance || 0);
  }

  const lyrics = String(body?.prompt || "").trim();
  const stylePrompt = buildMusicPrompt(body);
  const title = String(body?.title || "").trim();
  const instrumental = Boolean(body?.instrumental);
  const taskId = newTaskId("minimax");
  const audioId = `${taskId}_a`;

  queueLogMusicGeneration({
    userId: user.userId,
    taskId,
    kind: body?.watchKind === "photo" ? "photo" : "song",
    provider: "minimax",
    prompt: buildPromptLabel(lyrics, stylePrompt, title),
    status: "pending",
    creditsUsed: isAdmin ? 0 : FULL_SONG_COST,
    providerCostUsd: MINIMAX_PROVIDER_COST_USD || null,
  });

  const model = resolveMinimaxMusicModel(body?.minimaxModel);
  const keyKind = minimaxKeyKind();
  if (!instrumental && !lyrics) {
    return sendJson(res, 400, {
      error: "Add lyrics or enable instrumental mode for MiniMax.",
      code: "minimax_missing_lyrics",
    });
  }

  const upstream = await minimaxGenerateMusic({
    apiKey,
    model,
    prompt: instrumental ? stylePrompt || lyrics || "Instrumental track" : stylePrompt || "Modern pop song",
    lyrics: instrumental ? "" : lyrics,
    isInstrumental: instrumental,
    lyricsOptimizer: false,
  });

  if (!upstream.ok) {
    if (!isAdmin) {
      await refund(user.userId, FULL_SONG_COST, "refund_full_song", "minimax_upstream").catch(() => null);
    }
    const msg = minimaxUserMessage(upstream.statusCode, upstream.statusMsg, { model, keyKind });
    queueUpdateMusicGenerationByTaskId(taskId, {
      status: isAdmin ? "failed" : "refunded",
      error_message: msg,
    });
    return sendJson(res, 502, {
      error: msg,
      code: upstream.statusCode || upstream.httpStatus,
      _model: model,
      _keyKind: keyKind,
      details: upstream.data || upstream.text?.slice(0, 400) || null,
    });
  }

  const parsedAudio = upstream.audioBuffer
    ? { kind: "hex", buffer: upstream.audioBuffer }
    : extractMinimaxAudio(upstream.data);
  let audioUrl = "";
  if (parsedAudio?.kind === "url") {
    const archived = await persistRemoteAudio({ userId: user.userId, taskId, remoteUrl: parsedAudio.url });
    audioUrl = archived.ok && archived.url ? archived.url : parsedAudio.url;
  } else if (parsedAudio?.kind === "hex") {
    const archived = await persistAudioBuffer({ userId: user.userId, taskId, buffer: parsedAudio.buffer });
    if (!archived.ok || !archived.url) {
      return sendJson(res, 502, {
        error: "MiniMax audio upload failed — try again.",
        details: { traceId: upstream.data?.trace_id || null, upload: archived.error || null },
      });
    }
    audioUrl = archived.url;
  } else {
    return sendJson(res, 502, {
      error: "MiniMax returned no audio — try again in a minute.",
      details: {
        traceId: upstream.data?.trace_id || null,
        status: upstream.data?.data?.status ?? null,
        baseResp: upstream.data?.base_resp || null,
      },
    });
  }

  const statusPayload = buildSunoStatusPayload({
    taskId,
    title,
    lyrics,
    audioUrl,
    audioId,
    provider: "minimax",
  });
  const stored = await saveMusicProviderTaskStatus({ userId: user.userId, taskId, statusPayload });
  if (!stored.ok) {
    console.warn("[music/generate] task store failed (song audio ok)", stored.error);
  }

  queueUpdateMusicGenerationByTaskId(taskId, {
    status: "completed",
    provider_cost_usd: MINIMAX_PROVIDER_COST_USD || null,
  });

  return sendJson(res, 200, {
    code: 200,
    data: { taskId, audioId, audioUrl, audio_url: audioUrl, status: "SUCCESS" },
    _provider: "minimax",
    _model: model,
    _keyKind: keyKind,
    _ready: true,
    _variantCount: 1,
    _credits: {
      spent: isAdmin ? 0 : FULL_SONG_COST,
      balance: balanceAfterDebit,
      admin: isAdmin || undefined,
    },
  });
}

async function handleLyriaGenerate(req, res, { user, isAdmin, body }) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  if (!apiKey) return sendJson(res, 500, { error: "Missing GEMINI_API_KEY on server" });

  if (!isAdmin && !lyriaGenerateEnabled()) {
    return sendJson(res, 403, {
      error: "Lyria generation is admin-only on this environment.",
      code: "lyria_admin_only",
    });
  }

  if (body?.personaId || body?.hasReference) {
    return sendJson(res, 400, {
      error: "Lyria spike does not support persona or reference uploads yet.",
      code: "lyria_unsupported",
    });
  }

  let balanceAfterDebit = null;
  if (!isAdmin) {
    const debit = await callRpc("consume_credits", {
      p_user_id: user.userId,
      p_amount: FULL_SONG_COST,
      p_reason: "full_song",
      p_ref: "lyria",
    });
    if (!debit.ok || !debit.data?.ok) {
      const status = String(debit.data?.status || "");
      if (status === "insufficient") {
        return sendJson(res, 402, {
          error: "Not enough credits",
          code: "insufficient_credits",
          balance: Number(debit.data?.balance || 0),
          needed: FULL_SONG_COST,
        });
      }
      return sendJson(res, 500, { error: "Credit check failed", details: debit.data || debit.error || null });
    }
    balanceAfterDebit = Number(debit.data?.balance || 0);
  }

  const lyrics = String(body?.prompt || "").trim();
  const stylePrompt = buildMusicPrompt(body);
  const title = String(body?.title || "").trim();
  const instrumental = Boolean(body?.instrumental);
  const taskId = newTaskId("lyria");
  const audioId = `${taskId}_a`;
  const model = resolveLyriaModel(body?.lyriaModel);

  queueLogMusicGeneration({
    userId: user.userId,
    taskId,
    kind: body?.watchKind === "photo" ? "photo" : "song",
    provider: "lyria",
    prompt: buildPromptLabel(lyrics, stylePrompt, title),
    status: "pending",
    creditsUsed: isAdmin ? 0 : FULL_SONG_COST,
    providerCostUsd: LYRIA_PROVIDER_COST_USD,
  });

  const lyriaPrompt = buildLyriaPrompt({
    stylePrompt,
    lyrics,
    title,
    instrumental,
  });

  const upstream = await lyriaGenerateMusic({ apiKey, model, prompt: lyriaPrompt });

  if (!upstream.ok) {
    if (!isAdmin) {
      await refund(user.userId, FULL_SONG_COST, "refund_full_song", "lyria_upstream").catch(() => null);
    }
    const msg = upstream.userMessage || "Lyria generation failed — try again.";
    queueUpdateMusicGenerationByTaskId(taskId, {
      status: isAdmin ? "failed" : "refunded",
      error_message: msg,
    });
    return sendJson(res, 502, {
      error: msg,
      code: upstream.httpStatus,
      _model: model,
      details: upstream.data || upstream.text?.slice(0, 400) || null,
    });
  }

  const archived = await persistAudioBuffer({
    userId: user.userId,
    taskId,
    buffer: upstream.audio.buffer,
    contentType: upstream.audio.mimeType || "audio/mpeg",
  });
  if (!archived.ok || !archived.url) {
    return sendJson(res, 502, {
      error: "Lyria audio upload failed — try again.",
      details: { upload: archived.error || null },
    });
  }

  const audioUrl = archived.url;
  const statusPayload = buildSunoStatusPayload({
    taskId,
    title,
    lyrics,
    audioUrl,
    audioId,
    provider: "lyria",
  });
  const stored = await saveMusicProviderTaskStatus({ userId: user.userId, taskId, statusPayload });
  if (!stored.ok) {
    console.warn("[music/generate] task store failed (song audio ok)", stored.error);
  }

  queueUpdateMusicGenerationByTaskId(taskId, {
    status: "completed",
    provider_cost_usd: LYRIA_PROVIDER_COST_USD,
  });

  return sendJson(res, 200, {
    code: 200,
    data: { taskId, audioId, audioUrl, audio_url: audioUrl, status: "SUCCESS" },
    _provider: "lyria",
    _model: model,
    _ready: true,
    _variantCount: 1,
    _credits: {
      spent: isAdmin ? 0 : FULL_SONG_COST,
      balance: balanceAfterDebit,
      admin: isAdmin || undefined,
    },
  });
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

    const user = await verifyUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in to generate songs." });

    const isAdmin = await userIsAdmin(user);
    const body = await readJson(req);
    const provider = resolveProvider(req);

    if (provider === "lyria") {
      return handleLyriaGenerate(req, res, { user, isAdmin, body });
    }
    return handleMinimaxGenerate(req, res, { user, isAdmin, body });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
