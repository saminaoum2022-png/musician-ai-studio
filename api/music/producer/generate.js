/**
 * POST /api/music/producer/generate
 * Body: { session, blueprint }
 *
 * Debits NABAD_PRODUCER_CREDIT_COST (50) and runs Lyria Pro full song.
 */
const crypto = require("crypto");
const { verifyUser, sendJson, readJsonBody, callRpc, refund } = require("../../_lib/credits-auth");
const { applyCors } = require("../../_lib/cors");
const { userIsAdmin } = require("../../_lib/admin-auth");
const {
  buildLyriaPrompt,
  lyriaGenerateMusic,
  resolveLyriaModel,
} = require("../../_lib/lyria-upstream");
const {
  saveMusicProviderTaskStatus,
  providerFolder,
} = require("../../_lib/music-provider-task-store");
const { uploadObject } = require("../../_lib/supabase-storage");
const { queueCacheTimestampedLyrics } = require("../../_lib/music-timestamped-lyrics-cache");
const {
  queueLogMusicGeneration,
  queueUpdateMusicGenerationByTaskId,
} = require("../../_lib/music-generation-log");
const {
  nabadProducerEnabled,
  NABAD_PRODUCER_CREDIT_COST,
  normalizeSession,
  sessionToGenerateBody,
  buildProducerBlueprint,
  explainReferenceStyle,
  producerDisplayTitle,
  producerSafeGenreLabel,
} = require("../../_lib/nabad-producer-lib");

const BUCKET = "song_archive";
const LYRIA_PROVIDER_COST_USD = Number(process.env.LYRIA_USD_PER_TRACK || "0.08");

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
      response: { sunoData: [clip], suno_data: [clip] },
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

function newTaskId() {
  return `lyr_${crypto.randomUUID().replace(/-/g, "")}`;
}

async function persistAudioBuffer({ userId, taskId, buffer, contentType }) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 128) {
    return { ok: false, error: "missing_audio_bytes" };
  }
  const ext = String(contentType || "").includes("wav") ? "wav" : "mp3";
  const folder = providerFolder(taskId);
  const key = `${userId}/${folder}/${taskId}.${ext}`;
  const uploaded = await uploadObject({
    bucket: BUCKET,
    key,
    body: buffer,
    contentType: String(contentType || "").includes("audio") ? contentType : "audio/mpeg",
  });
  if (!uploaded.ok) return { ok: false, error: uploaded.error || "upload_failed" };
  return { ok: true, url: uploaded.url };
}

async function runProducerGenerationJob({
  userId,
  isAdmin,
  taskId,
  audioId,
  apiKey,
  model,
  lyriaPrompt,
  title,
  lyrics,
  instrumental,
  creditCost,
  adminDetail,
}) {
  const fail = async (msg) => {
    if (!isAdmin) {
      await refund(userId, creditCost, "refund_nabad_producer", "lyria_producer_upstream").catch(() => null);
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
    await saveMusicProviderTaskStatus({ userId, taskId, statusPayload }).catch(() => null);
    queueUpdateMusicGenerationByTaskId(taskId, {
      status: "completed",
      provider_cost_usd: LYRIA_PROVIDER_COST_USD,
      request_detail: adminDetail,
    });
  } catch (e) {
    console.error("[music/producer/generate] background job failed", taskId, e);
    await fail(e?.message || "Lyria generation failed — try again.");
  }
}

module.exports = async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user?.userId) return sendJson(res, 401, { error: "Unauthorized" });

  if (!nabadProducerEnabled()) {
    return sendJson(res, 403, {
      error: "Nabad Producer is not enabled on this server.",
      code: "nabad_producer_disabled",
    });
  }

  const isAdmin = await userIsAdmin(user);
  if (!isAdmin) {
    return sendJson(res, 403, {
      error: "Nabad Producer is admin-only on this environment.",
      code: "nabad_producer_admin_only",
    });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  if (!apiKey) return sendJson(res, 500, { error: "Missing GEMINI_API_KEY on server" });

  try {
    const body = await readJsonBody(req);
    let session = normalizeSession(body?.session);
    if (session.referenceText && !session.referenceSkipped && !session.referenceNote) {
      session.referenceNote = await explainReferenceStyle({
        apiKey,
        referenceText: session.referenceText,
      });
    }
    let blueprint = body?.blueprint && typeof body.blueprint === "object" ? body.blueprint : null;

    if (!blueprint?.master_style_prompt) {
      const built = await buildProducerBlueprint({ apiKey, session });
      if (!built.ok) {
        return sendJson(res, 502, {
          error: "Could not build production blueprint.",
          code: "blueprint_failed",
          details: built.error || null,
        });
      }
      blueprint = {
        structured_lyrics: built.structured_lyrics,
        master_style_prompt: built.master_style_prompt,
      };
    }

    const genBody = sessionToGenerateBody(session, blueprint);
    const lyrics = String(genBody.prompt || blueprint.structured_lyrics || "").trim();
    const title = String(genBody.title || producerDisplayTitle(session)).trim();
    const instrumental = Boolean(genBody.instrumental);
    const creditCost = NABAD_PRODUCER_CREDIT_COST;

    if (!instrumental && !lyrics) {
      return sendJson(res, 400, {
        error: "Add lyrics before generating.",
        code: "producer_missing_lyrics",
      });
    }

    let balanceAfterDebit = null;
    if (!isAdmin) {
      const debit = await callRpc("consume_credits", {
        p_user_id: user.userId,
        p_amount: creditCost,
        p_reason: "nabad_producer",
        p_ref: "lyria_producer",
      });
      if (!debit.ok || !debit.data?.ok) {
        const status = String(debit.data?.status || "");
        if (status === "insufficient") {
          return sendJson(res, 402, {
            error: "Not enough credits",
            code: "insufficient_credits",
            balance: Number(debit.data?.balance || 0),
            needed: creditCost,
          });
        }
        return sendJson(res, 500, { error: "Credit check failed", details: debit.data || debit.error || null });
      }
      balanceAfterDebit = Number(debit.data?.balance || 0);
    }

    const stylePrompt = [
      producerSafeGenreLabel(session),
      session.mood,
      session.instruments,
      session.bpm ? `${session.bpm} BPM` : session.tempo,
    ].filter(Boolean).join(", ");

    const lyriaPrompt = buildLyriaPrompt({
      stylePrompt,
      lyrics,
      title,
      instrumental,
      clip: false,
      vocalGender: session.vocalGender,
      clipVocalProfileId: session.clipVocalProfileId,
      enhancedStylePrompt: blueprint.master_style_prompt,
      structuredLyrics: blueprint.structured_lyrics || lyrics,
    });

    const taskId = newTaskId();
    const audioId = `${taskId}_a`;
    const model = resolveLyriaModel("lyria-3-pro-preview");

    const adminDetail = [
      "flow: nabad_producer",
      `genre: ${producerSafeGenreLabel(session) || "Arabic Pop"}`,
      `mood: ${session.mood}`,
      `bpm: ${session.bpm || session.tempo}`,
      `gemini_producer: applied`,
      session.referenceText && !session.referenceSkipped
        ? `reference_style_note: ${String(session.referenceNote || "abstract style only").slice(0, 280)}`
        : "",
      `master_style_prompt: ${String(blueprint.master_style_prompt || "").slice(0, 600)}`,
      `structured_lyrics: ${String(blueprint.structured_lyrics || "").slice(0, 400)}`,
    ].filter(Boolean).join("\n");

    queueLogMusicGeneration({
      userId: user.userId,
      taskId,
      kind: "song",
      provider: "lyria",
      prompt: `${title} · ${producerSafeGenreLabel(session) || "Producer"}`.slice(0, 500),
      requestDetail: adminDetail,
      status: "pending",
      creditsUsed: isAdmin ? 0 : creditCost,
      providerCostUsd: LYRIA_PROVIDER_COST_USD,
    });

    const pendingPayload = buildPendingStatusPayload({ taskId, provider: "lyria" });
    pendingPayload._producer = true;
    const pendingStored = await saveMusicProviderTaskStatus({
      userId: user.userId,
      taskId,
      statusPayload: pendingPayload,
    });

    if (!pendingStored.ok) {
      if (!isAdmin) {
        await refund(user.userId, creditCost, "refund_nabad_producer", "lyria_producer_task_store").catch(() => null);
      }
      return sendJson(res, 500, {
        error: "Could not start generation — try again.",
        details: pendingStored.error || null,
      });
    }

    scheduleBackgroundWork(
      runProducerGenerationJob({
        userId: user.userId,
        isAdmin,
        taskId,
        audioId,
        apiKey,
        model,
        lyriaPrompt,
        title,
        lyrics: blueprint.structured_lyrics || lyrics,
        instrumental,
        creditCost,
        adminDetail,
      }),
    );

    return sendJson(res, 200, {
      code: 200,
      data: { taskId, audioId, status: "PENDING" },
      _provider: "lyria",
      _model: model,
      _producer: true,
      _ready: false,
      _credits: {
        spent: isAdmin ? 0 : creditCost,
        balance: balanceAfterDebit,
        admin: isAdmin || undefined,
      },
    });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
