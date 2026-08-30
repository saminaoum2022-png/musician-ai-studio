/**
 * Provider-neutral full song generation — MiniMax + Lyria + ElevenLabs admin spikes.
 *
 * POST /api/music/generate?provider=minimax|lyria|elevenlabs
 *   Same auth/credits shell as /api/suno/generate; admin-only unless
 *   MINIMAX_GENERATE_ENABLED=1, LYRIA_GENERATE_ENABLED=1, or ELEVENLABS_GENERATE_ENABLED=1.
 *
 * Env:
 * - MINIMAX_API_KEY, MINIMAX_KEY_KIND, MINIMAX_MUSIC_MODEL, MINIMAX_GENERATE_ENABLED
 * - GEMINI_API_KEY / GOOGLE_API_KEY, LYRIA_MUSIC_MODEL, LYRIA_GENERATE_ENABLED
 * - ELEVENLABS_API_KEY, ELEVENLABS_MUSIC_MODEL, ELEVENLABS_MUSIC_LENGTH_MS, ELEVENLABS_FINETUNE_ID, ELEVENLABS_GENERATE_ENABLED
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
  nabadClipEnabled,
  templateSparkClipEnabled,
  resolveLyriaModel,
} = require("../_lib/lyria-upstream");
const { requireProSubscription } = require("../_lib/pro-web-gate");
const {
  buildElevenMusicPrompt,
  buildElevenReferenceCompositionPlan,
  decodeReferenceAudioPayload,
  elevenlabsGenerateEnabled,
  elevenlabsGenerateMusicDetailed,
  elevenlabsUploadMusic,
  estimateReferenceDurationMs,
  resolveElevenMusicLengthMs,
  resolveElevenMusicModel,
  resolveElevenFinetuneId,
  verifyElevenFinetuneAccess,
} = require("../_lib/elevenlabs-music-upstream");
const {
  saveMusicProviderTaskStatus,
  providerFolder,
} = require("../_lib/music-provider-task-store");
const { uploadObject } = require("../_lib/supabase-storage");
const { queueCacheTimestampedLyrics } = require("../_lib/music-timestamped-lyrics-cache");
const {
  queueLogMusicGeneration,
  queueUpdateMusicGenerationByTaskId,
} = require("../_lib/music-generation-log");

const FULL_SONG_COST = 12;
const LYRIA_CLIP_CREDIT_COST = Math.max(
  1,
  Number(process.env.LYRIA_CLIP_CREDIT_COST || process.env.TEMPLATE_SPARK_CLIP_COST || 10),
);
const NABAD_CLIP_COST = LYRIA_CLIP_CREDIT_COST;
const TEMPLATE_SPARK_CLIP_COST = LYRIA_CLIP_CREDIT_COST;
const BUCKET = "song_archive";
const MINIMAX_PROVIDER_COST_USD = Number(process.env.MINIMAX_USD_PER_TRACK || "0");
const LYRIA_PROVIDER_COST_USD = Number(process.env.LYRIA_USD_PER_TRACK || "0.08");
const LYRIA_CLIP_COST_USD = Number(process.env.LYRIA_CLIP_USD || "0.04");
const ELEVENLABS_PROVIDER_COST_USD = Number(process.env.ELEVENLABS_USD_PER_TRACK || "0.45");

function minimaxGenerateEnabled() {
  const v = String(process.env.MINIMAX_GENERATE_ENABLED || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function resolveProvider(req) {
  try {
    const url = new URL(req.url, "http://localhost");
    const p = String(url.searchParams.get("provider") || "minimax").trim().toLowerCase();
    if (p === "lyria") return "lyria";
    if (p === "elevenlabs" || p === "eleven") return "elevenlabs";
    return "minimax";
  } catch {
    return "minimax";
  }
}

function newTaskId(provider) {
  const prefix =
    provider === "lyria" ? "lyr" : provider === "elevenlabs" ? "elv" : "mmx";
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

function buildPendingStatusPayload({ taskId, provider }) {
  return {
    code: 200,
    data: {
      taskId,
      status: "PENDING",
      response: { sunoData: [], suno_data: [] },
    },
    _provider: provider,
  };
}

function buildFailedStatusPayload({ taskId, provider, errorMessage }) {
  return {
    code: 200,
    data: {
      taskId,
      status: "FAILED",
      errorMessage: String(errorMessage || "Generation failed").slice(0, 500),
      response: { sunoData: [], suno_data: [] },
    },
    _provider: provider,
  };
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

async function runLyriaGenerationJob({
  userId,
  isAdmin,
  taskId,
  audioId,
  apiKey,
  model,
  lyriaPrompt,
  title,
  lyrics,
  instrumental = false,
}) {
  const fail = async (msg) => {
    if (!isAdmin) {
      await refund(userId, FULL_SONG_COST, "refund_full_song", "lyria_upstream").catch(() => null);
    }
    const statusPayload = buildFailedStatusPayload({
      taskId,
      provider: "lyria",
      errorMessage: msg,
    });
    await saveMusicProviderTaskStatus({ userId, taskId, statusPayload }).catch(() => null);
    queueUpdateMusicGenerationByTaskId(taskId, {
      status: isAdmin ? "failed" : "refunded",
      error_message: msg,
    });
  };

  try {
    const upstream = await lyriaGenerateMusic({ apiKey, model, prompt: lyriaPrompt });
    if (!upstream.ok) {
      await fail(upstream.userMessage || "Lyria generation failed — try again.");
      return;
    }
    const archived = await persistAudioBuffer({
      userId,
      taskId,
      buffer: upstream.audio.buffer,
      contentType: upstream.audio.mimeType || "audio/mpeg",
    });
    if (!archived.ok || !archived.url) {
      await fail("Lyria audio upload failed — try again.");
      return;
    }
    if (!instrumental && Array.isArray(upstream.alignedWords) && upstream.alignedWords.length) {
      queueCacheTimestampedLyrics({
        audioId,
        taskId,
        provider: "lyria",
        alignedWords: upstream.alignedWords,
      });
    }
    const statusPayload = buildSunoStatusPayload({
      taskId,
      title,
      lyrics,
      audioUrl: archived.url,
      audioId,
      provider: "lyria",
    });
    const stored = await saveMusicProviderTaskStatus({ userId, taskId, statusPayload });
    if (!stored.ok) {
      console.warn("[music/generate] lyria task store failed (song audio ok)", stored.error);
    }
    queueUpdateMusicGenerationByTaskId(taskId, {
      status: "completed",
      provider_cost_usd: LYRIA_PROVIDER_COST_USD,
    });
  } catch (e) {
    console.error("[music/generate] lyria background job failed", taskId, e);
    await fail(e?.message || "Lyria generation failed — try again.");
  }
}

async function runElevenlabsGenerationJob({
  userId,
  isAdmin,
  taskId,
  audioId,
  apiKey,
  model,
  musicLengthMs,
  instrumental,
  finetuneId,
  elevenPrompt,
  compositionPlan,
  title,
  lyrics,
  referenceSongId,
}) {
  const fail = async (msg) => {
    if (!isAdmin) {
      await refund(userId, FULL_SONG_COST, "refund_full_song", "elevenlabs_upstream").catch(() => null);
    }
    const statusPayload = buildFailedStatusPayload({
      taskId,
      provider: "elevenlabs",
      errorMessage: msg,
    });
    await saveMusicProviderTaskStatus({ userId, taskId, statusPayload }).catch(() => null);
    queueUpdateMusicGenerationByTaskId(taskId, {
      status: isAdmin ? "failed" : "refunded",
      error_message: msg,
    });
  };

  try {
    const upstream = await elevenlabsGenerateMusicDetailed({
      apiKey,
      prompt: compositionPlan ? undefined : elevenPrompt,
      compositionPlan: compositionPlan || undefined,
      model,
      musicLengthMs,
      instrumental,
      finetuneId,
      withTimestamps: !instrumental,
    });
    if (!upstream.ok) {
      console.warn("[music/generate] elevenlabs compose failed", taskId, upstream.httpStatus, upstream.userMessage, upstream.text?.slice?.(0, 240));
      await fail(upstream.userMessage || "ElevenLabs generation failed — try again.");
      return;
    }
    const archived = await persistAudioBuffer({
      userId,
      taskId,
      buffer: upstream.audio.buffer,
      contentType: upstream.audio.mimeType || "audio/mpeg",
    });
    if (!archived.ok || !archived.url) {
      await fail("ElevenLabs audio upload failed — try again.");
      return;
    }
    if (!instrumental && Array.isArray(upstream.alignedWords) && upstream.alignedWords.length) {
      queueCacheTimestampedLyrics({
        audioId,
        taskId,
        provider: "elevenlabs",
        alignedWords: upstream.alignedWords,
      });
    }
    const statusPayload = buildSunoStatusPayload({
      taskId,
      title,
      lyrics,
      audioUrl: archived.url,
      audioId,
      provider: "elevenlabs",
    });
    if (finetuneId) {
      statusPayload._finetuneId = finetuneId;
      statusPayload._finetuneApplied = true;
    }
    if (referenceSongId) {
      statusPayload._referenceSongId = referenceSongId;
      statusPayload._referenceApplied = true;
    }
    const stored = await saveMusicProviderTaskStatus({ userId, taskId, statusPayload });
    if (!stored.ok) {
      console.warn("[music/generate] elevenlabs task store failed (song audio ok)", stored.error);
    }
    queueUpdateMusicGenerationByTaskId(taskId, {
      status: "completed",
      provider_cost_usd: ELEVENLABS_PROVIDER_COST_USD,
    });
  } catch (e) {
    console.error("[music/generate] elevenlabs background job failed", taskId, e);
    await fail(e?.message || "ElevenLabs generation failed — try again.");
  }
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

  const pendingPayload = buildPendingStatusPayload({ taskId, provider: "lyria" });
  const pendingStored = await saveMusicProviderTaskStatus({
    userId: user.userId,
    taskId,
    statusPayload: pendingPayload,
  });
  if (!pendingStored.ok) {
    if (!isAdmin) {
      await refund(user.userId, FULL_SONG_COST, "refund_full_song", "lyria_task_store").catch(() => null);
    }
    return sendJson(res, 500, {
      error: "Could not start Lyria generation — try again.",
      details: pendingStored.error || null,
    });
  }

  scheduleBackgroundWork(
    runLyriaGenerationJob({
      userId: user.userId,
      isAdmin,
      taskId,
      audioId,
      apiKey,
      model,
      lyriaPrompt,
      title,
      lyrics,
      instrumental,
    }),
  );

  return sendJson(res, 200, {
    code: 200,
    data: { taskId, audioId, status: "PENDING" },
    _provider: "lyria",
    _model: model,
    _ready: false,
    _variantCount: 1,
    _credits: {
      spent: isAdmin ? 0 : FULL_SONG_COST,
      balance: balanceAfterDebit,
      admin: isAdmin || undefined,
    },
  });
}

function resolveClipCreditCost(body) {
  if (String(body?.templateSparkClip || "").trim() === "1") return TEMPLATE_SPARK_CLIP_COST;
  return NABAD_CLIP_COST;
}

async function handleLyriaClipGenerate(req, res, { user, isAdmin, body }) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  if (!apiKey) return sendJson(res, 500, { error: "Missing GEMINI_API_KEY on server" });

  const templateSpark = String(body?.templateSparkClip || "").trim() === "1";
  const clipCost = resolveClipCreditCost(body);
  if (!isAdmin && templateSpark && !templateSparkClipEnabled()) {
    return sendJson(res, 403, {
      error: "Template and Spark clips are not enabled on this server.",
      code: "template_spark_clip_disabled",
    });
  }
  if (!isAdmin && !templateSpark) {
    if (!nabadClipEnabled()) {
      return sendJson(res, 403, {
        error: "Nabad Clip is not enabled on this server.",
        code: "nabad_clip_disabled",
      });
    }
    const proGate = await requireProSubscription(user.userId);
    if (!proGate.ok) {
      return sendJson(res, proGate.status, {
        error: proGate.error,
        code: proGate.code,
      });
    }
  }

  if (body?.personaId || body?.hasReference) {
    return sendJson(res, 400, {
      error: "Nabad Clip supports photo mood + lyrics only — no persona or audio reference yet.",
      code: "nabad_clip_unsupported",
    });
  }

  let balanceAfterDebit = null;
  if (!isAdmin) {
    const debit = await callRpc("consume_credits", {
      p_user_id: user.userId,
      p_amount: clipCost,
      p_reason: templateSpark ? "template_spark_clip" : "nabad_clip",
      p_ref: templateSpark ? "template_spark_lyria_clip" : "lyria_clip",
    });
    if (!debit.ok || !debit.data?.ok) {
      const status = String(debit.data?.status || "");
      if (status === "insufficient") {
        return sendJson(res, 402, {
          error: "Not enough credits",
          code: "insufficient_credits",
          balance: Number(debit.data?.balance || 0),
          needed: clipCost,
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
  const model = resolveLyriaModel(body?.lyriaModel || "clip");

  if (!instrumental && !lyrics && !stylePrompt) {
    return sendJson(res, 400, {
      error: "Add lyrics, style, or photo mood before generating a clip.",
      code: "nabad_clip_missing_prompt",
    });
  }

  queueLogMusicGeneration({
    userId: user.userId,
    taskId,
    kind: "clip",
    provider: "lyria",
    prompt: buildPromptLabel(lyrics, stylePrompt, title),
    status: "pending",
    creditsUsed: isAdmin ? 0 : clipCost,
    providerCostUsd: LYRIA_CLIP_COST_USD,
  });

  const lyriaPrompt = buildLyriaPrompt({
    stylePrompt,
    lyrics,
    title,
    instrumental,
    clip: true,
  });

  const pendingPayload = buildPendingStatusPayload({ taskId, provider: "lyria" });
  pendingPayload._clip = true;
  const pendingStored = await saveMusicProviderTaskStatus({
    userId: user.userId,
    taskId,
    statusPayload: pendingPayload,
  });
  if (!pendingStored.ok) {
    if (!isAdmin) {
      await refund(user.userId, clipCost, templateSpark ? "refund_template_spark_clip" : "refund_nabad_clip", "lyria_clip_task_store").catch(() => null);
    }
    return sendJson(res, 500, {
      error: "Could not start Nabad Clip generation — try again.",
      details: pendingStored.error || null,
    });
  }

  scheduleBackgroundWork(
    runLyriaGenerationJob({
      userId: user.userId,
      isAdmin,
      taskId,
      audioId,
      apiKey,
      model,
      lyriaPrompt,
      title,
      lyrics,
      instrumental,
    }),
  );

  return sendJson(res, 200, {
    code: 200,
    data: { taskId, audioId, status: "PENDING" },
    _provider: "lyria",
    _model: model,
    _clip: true,
    _templateSparkClip: templateSpark || undefined,
    _ready: false,
    _variantCount: 1,
    _credits: {
      spent: isAdmin ? 0 : clipCost,
      balance: balanceAfterDebit,
      admin: isAdmin || undefined,
    },
  });
}

async function handleElevenlabsGenerate(req, res, { user, isAdmin, body }) {
  const apiKey = process.env.ELEVENLABS_API_KEY || "";
  if (!apiKey) return sendJson(res, 500, { error: "Missing ELEVENLABS_API_KEY on server" });

  if (!isAdmin && !elevenlabsGenerateEnabled()) {
    return sendJson(res, 403, {
      error: "ElevenLabs generation is admin-only on this environment.",
      code: "elevenlabs_admin_only",
    });
  }

  if (body?.personaId) {
    return sendJson(res, 400, {
      error: "ElevenLabs spike does not support persona yet — use a vocal reference or finetune.",
      code: "elevenlabs_unsupported",
    });
  }

  const hasReference = Boolean(body?.hasReference || body?.referenceAudio);
  if (hasReference && Boolean(body?.instrumental) && Boolean(body?.referenceInstrumentalOnly)) {
    return sendJson(res, 400, {
      error: "ElevenLabs reference mode supports vocal hum/sing references — disable instrumental-from-melody for now.",
      code: "elevenlabs_reference_instrumental_unsupported",
    });
  }

  let balanceAfterDebit = null;
  if (!isAdmin) {
    const debit = await callRpc("consume_credits", {
      p_user_id: user.userId,
      p_amount: FULL_SONG_COST,
      p_reason: "full_song",
      p_ref: "elevenlabs",
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
  const taskId = newTaskId("elevenlabs");
  const audioId = `${taskId}_a`;
  const model = resolveElevenMusicModel(body?.elevenlabsModel);
  const musicLengthMs = resolveElevenMusicLengthMs(body?.musicLengthMs);
  let finetuneId = resolveElevenFinetuneId(body?.elevenlabsFinetuneId);
  const finetuneSkippedForReference = Boolean(hasReference && finetuneId);
  if (finetuneSkippedForReference) {
    console.log(
      "[music/generate] elevenlabs reference mode — skipping finetune_id (conditioning_ref drives voice/melody)",
    );
    finetuneId = null;
  }

  if (finetuneId) {
    const finetuneCheck = await verifyElevenFinetuneAccess({ apiKey, finetuneId });
    if (!finetuneCheck.ok) {
      const msg =
        finetuneCheck.error === "finetune_not_found"
          ? "ElevenLabs finetune not found — check ELEVENLABS_FINETUNE_ID matches NabadAi DNA and ELEVENLABS_API_KEY is the same ElevenLabs account."
          : finetuneCheck.error === "finetune_not_ready"
            ? `ElevenLabs finetune "${finetuneCheck.name || finetuneId}" is not ready yet (${finetuneCheck.status || "pending"}).`
            : "ElevenLabs finetune check failed — verify ELEVENLABS_API_KEY and finetune id.";
      console.warn("[music/generate] elevenlabs finetune verify failed", finetuneId, finetuneCheck);
      return sendJson(res, 502, {
        error: msg,
        code: finetuneCheck.error || "elevenlabs_finetune_invalid",
        _finetuneId: finetuneId,
        details: finetuneCheck.detail || finetuneCheck.status || null,
      });
    }
    console.log(
      "[music/generate] elevenlabs finetune",
      finetuneId,
      finetuneCheck.finetune?.name || "NabadAi DNA",
    );
  } else {
    console.warn("[music/generate] elevenlabs generate without finetune_id — set ELEVENLABS_FINETUNE_ID");
  }

  queueLogMusicGeneration({
    userId: user.userId,
    taskId,
    kind: body?.watchKind === "photo" ? "photo" : "song",
    provider: "elevenlabs",
    prompt: buildPromptLabel(lyrics, stylePrompt, title),
    status: "pending",
    creditsUsed: isAdmin ? 0 : FULL_SONG_COST,
    providerCostUsd: ELEVENLABS_PROVIDER_COST_USD,
  });

  const elevenPrompt = buildElevenMusicPrompt({
    stylePrompt,
    lyrics,
    title,
    instrumental,
  });

  let referenceSongId = null;
  let compositionPlan = null;
  if (hasReference) {
    const refAudio = decodeReferenceAudioPayload(body?.referenceAudio);
    if (!refAudio?.buffer?.length) {
      return sendJson(res, 400, {
        error: "Missing or invalid vocal reference audio — record or upload again.",
        code: "elevenlabs_reference_invalid",
      });
    }
    if (refAudio.buffer.length > 15 * 1024 * 1024) {
      return sendJson(res, 400, {
        error: "Reference audio is too large (max 15 MB). Try a shorter hum or clip.",
        code: "elevenlabs_reference_too_large",
      });
    }
    const upload = await elevenlabsUploadMusic({
      apiKey,
      buffer: refAudio.buffer,
      mimeType: refAudio.mimeType,
    });
    if (!upload.ok || !upload.songId) {
      return sendJson(res, upload.httpStatus && upload.httpStatus >= 400 && upload.httpStatus < 500 ? upload.httpStatus : 502, {
        error: upload.userMessage || "ElevenLabs could not store your vocal reference — try again.",
        code: "elevenlabs_reference_upload_failed",
      });
    }
    referenceSongId = upload.songId;
    const refDurationMs = Number(body?.referenceDurationMs) > 0
      ? Number(body.referenceDurationMs)
      : estimateReferenceDurationMs(refAudio.buffer);
    compositionPlan = buildElevenReferenceCompositionPlan({
      lyrics,
      stylePrompt,
      title,
      musicLengthMs,
      instrumental,
      referenceSongId,
      referenceRangeMs: refDurationMs,
      conditionStrength: body?.referenceConditionStrength || "high",
    });
    console.log(
      "[music/generate] elevenlabs reference uploaded",
      referenceSongId.slice(0, 12),
      "rangeMs",
      refDurationMs,
    );
  }

  if (!instrumental && !lyrics && !stylePrompt && !compositionPlan) {
    return sendJson(res, 400, {
      error: "Add lyrics, style, or enable instrumental mode for ElevenLabs.",
      code: "elevenlabs_missing_prompt",
    });
  }

  const pendingPayload = buildPendingStatusPayload({ taskId, provider: "elevenlabs" });
  if (finetuneId) {
    pendingPayload._finetuneId = finetuneId;
    pendingPayload._finetuneApplied = true;
  }
  if (finetuneSkippedForReference) {
    pendingPayload._finetuneSkippedForReference = true;
  }
  if (referenceSongId) {
    pendingPayload._referenceSongId = referenceSongId;
    pendingPayload._referenceApplied = true;
  }
  const pendingStored = await saveMusicProviderTaskStatus({
    userId: user.userId,
    taskId,
    statusPayload: pendingPayload,
  });
  if (!pendingStored.ok) {
    if (!isAdmin) {
      await refund(user.userId, FULL_SONG_COST, "refund_full_song", "elevenlabs_task_store").catch(() => null);
    }
    return sendJson(res, 500, {
      error: "Could not start ElevenLabs generation — try again.",
      details: pendingStored.error || null,
    });
  }

  scheduleBackgroundWork(
    runElevenlabsGenerationJob({
      userId: user.userId,
      isAdmin,
      taskId,
      audioId,
      apiKey,
      model,
      musicLengthMs,
      instrumental,
      finetuneId,
      elevenPrompt,
      compositionPlan,
      title,
      lyrics,
      referenceSongId,
    }),
  );

  return sendJson(res, 200, {
    code: 200,
    data: { taskId, audioId, status: "PENDING" },
    _provider: "elevenlabs",
    _model: model,
    _finetuneId: finetuneId || undefined,
    _finetuneApplied: Boolean(finetuneId),
    _finetuneSkippedForReference: finetuneSkippedForReference || undefined,
    _referenceApplied: Boolean(referenceSongId),
    _referenceSongId: referenceSongId || undefined,
    _ready: false,
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
      const clipModel = resolveLyriaModel(body?.lyriaModel);
      const clipRequested =
        String(body?.lyriaModel || "").trim().toLowerCase() === "clip" ||
        String(body?.nabadClip || "").trim() === "1" ||
        String(body?.templateSparkClip || "").trim() === "1" ||
        clipModel === "lyria-3-clip-preview";
      if (clipRequested) {
        return handleLyriaClipGenerate(req, res, { user, isAdmin, body });
      }
      return handleLyriaGenerate(req, res, { user, isAdmin, body });
    }
    if (provider === "elevenlabs") {
      return handleElevenlabsGenerate(req, res, { user, isAdmin, body });
    }
    return handleMinimaxGenerate(req, res, { user, isAdmin, body });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
