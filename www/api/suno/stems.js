/**
 * Suno API proxy: vocal/instrument separation, plus reference-based song generation.
 *
 * POST /api/suno/stems
 * Modes (action="add_instrumental"):
 *  - referenceMode = "vocal_full" | "vocal_cover" | "song_remix" | "song_cover" | "vocal_instrumental"
 *      -> /api/v1/generate/upload-cover
 *      Suno analyses the uploaded melody and creates a NEW arrangement that
 *      follows the same melodic contour. `vocal_instrumental` keeps this same
 *      cover flow but asks Suno for an instrumental result, not underpainting.
 *
 *  - referenceMode = "vocal_extend" | "song_extend"
 *      -> /api/v1/generate/upload-extend
 *      The upload is treated as the start of the song; Suno continues from
 *      `continueAt` onward. The original recording is preserved.
 *
 *  - referenceMode = "humming_music" | "humming_backing" | "" (default)
 *      -> /api/v1/generate/add-instrumental
 *      Suno keeps the original vocal/hum and writes a backing band around it.
 *      No new vocals are generated.
 *
 * Stems action (default when no `action` is "add_instrumental"):
 *  - { taskId, audioId, type: "separate_vocal" | "split_stem" }
 *      -> /api/v1/vocal-removal/generate
 *
 * Audio is auto-transcoded to MP3 (mono, 44.1 kHz, 192 kbps) on the server
 * when the upload is webm/opus or any non-standard format Suno may reject.
 * Requires `ffmpeg-static` to be installed; falls back to passing the
 * original bytes through if ffmpeg is unavailable.
 *
 * Env:
 * - SUNO_API_KEY
 */

const Busboy = require("busboy");
const {
  verifyUser,
  callRpc,
  isAdminEmail,
} = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
// Reference-audio generations (cover / extend / add-instrumental) all
// produce a full song's worth of audio on Suno's side, so they cost
// the same as a normal generation.
const STEMS_REMIX_COST = 10;
// Vocal isolation / stem split on Suno is much cheaper than generation.
const STEMS_VOCAL_COST = 2;

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const apiKey = process.env.SUNO_API_KEY;
    if (!apiKey) return json(res, 500, { error: "Missing SUNO_API_KEY on server" });

    // Identify the caller. verifyUser only inspects headers, so it's
    // safe to call before we drain the multipart body below.
    const user = await verifyUser(req);
    if (!user) {
      return json(res, 401, { error: "Sign in to use this feature." });
    }

    const { host, proto } = getHostProto(req);
    const callBackUrl = `${proto}://${host}/api/suno/callback`;
    const contentType = String(req.headers["content-type"] || "");
    const isMultipart = contentType.toLowerCase().includes("multipart/form-data");
    let body = isMultipart ? await readMultipart(req) : await readJson(req);
    if (!isMultipart && body?._raw && String(body._raw).startsWith("--")) {
      // Some runtimes/clients may miss content-type header on forwarded multipart.
      body = await readMultipartFromRaw(body._raw, req.headers);
    }
    if (body?._parseError) {
      return json(res, 400, {
        error: "Invalid request body for /api/suno/stems",
        detailMessage: body._parseError,
      });
    }
    const action = String(body?.action || "").trim();

    // Determine cost + ledger reason for this request.
    const isRemixAction = action === "add_instrumental";
    const cost = isRemixAction ? STEMS_REMIX_COST : STEMS_VOCAL_COST;
    const reason = isRemixAction ? "stems_remix" : "stems_vocal_removal";

    // Debit profile credits BEFORE calling Suno. Refund in full on any
    // pre-task failure so the user is never charged for a request Suno
    // didn't actually accept. Admin (owner) accounts skip the debit:
    // their Suno usage shows up directly on the master Suno account.
    const isAdmin = isAdminEmail(user.email);
    let balanceAfterDebit = null;
    if (!isAdmin) {
      const debit = await callRpc("consume_credits", {
        p_user_id: user.userId,
        p_amount: cost,
        p_reason: reason,
        p_ref: "",
      });
      if (!debit.ok || !debit.data?.ok) {
        const status = String(debit.data?.status || "");
        if (status === "insufficient") {
          const featureLabel = isRemixAction ? "this generation" : "vocal extraction";
          return json(res, 402, {
            error: "Not enough credits",
            code: "insufficient_credits",
            balance: Number(debit.data?.balance || 0),
            needed: cost,
            message:
              debit.data?.message ||
              `Not enough credits for ${featureLabel} (${cost} credits). Redeem a code from your Profile.`,
          });
        }
        return json(res, 500, {
          error: "Credit check failed",
          details: debit.data || debit.error || null,
        });
      }
      balanceAfterDebit = Number(debit.data?.balance || 0);
    }
    const refund = async (refLabel) => {
      if (isAdmin) return;
      try {
        await callRpc("refund_credits", {
          p_user_id: user.userId,
          p_amount: cost,
          p_reason: `refund_${reason}`,
          p_ref: refLabel || "",
        });
      } catch {}
    };

    if (action === "add_instrumental") {
      let fileBytes = body?.fileBytes || null;
      if (!fileBytes) {
        await refund("missing_file");
        return json(res, 400, { error: "Missing uploaded file" });
      }
      if (Buffer.isBuffer(fileBytes) && fileBytes.length > MAX_UPLOAD_BYTES) {
        await refund("file_too_large");
        return json(res, 413, { error: "Audio reference is too large. Max 25 MB." });
      }
      let fileName = String(body?.fileName || "vocal-reference.webm").trim();
      let fileType = String(body?.fileType || "audio/webm").trim();

      // Convert webm/opus and other non-standard formats to MP3 so Suno
      // reliably accepts the upload and can analyse pitch/melody.
      const norm = await maybeTranscodeToMp3({ bytes: fileBytes, mime: fileType, name: fileName });
      fileBytes = norm.bytes;
      fileName = norm.name;
      fileType = norm.mime;

      const style = String(body?.style || "").trim();
      const prompt = String(body?.prompt || "").trim();
      const referenceMode = String(body?.referenceMode || "").trim().toLowerCase();
      const title = String(body?.title || "").trim();
      const model = String(body?.model || "V5_5").trim();
      const vocalGender = String(body?.vocalGender || "").trim().toLowerCase();
      const voiceTimbre = String(body?.voiceTimbre || "").trim();
      const songKey = String(body?.songKey || "").trim();
      const timing = String(body?.timing || "").trim();
      const dialect = String(body?.dialect || "").trim();
      const dialectHint = String(body?.dialectHint || "").trim();
      const personaId = String(body?.personaId || "").trim();
      const negativeTags = String(body?.negativeTags || "").trim();
      // Optional weights for backing / mix modes. The client forwards
      // audioWeight=0.95, styleWeight=0.25 for those modes so Suno
      // tracks the uploaded vocal melody instead of letting the style
      // tags dominate. Range-checked and ignored when missing.
      const clamp01 = (v) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return null;
        if (n < 0) return 0;
        if (n > 1) return 1;
        return n;
      };
      const audioWeight = clamp01(body?.audioWeight);
      const styleWeight = clamp01(body?.styleWeight);

      // 1) Upload file to Suno temporary file store (3-day URL)
      const up = new FormData();
      up.set("file", new Blob([fileBytes], { type: fileType }), fileName);
      up.set("uploadPath", "audio/user-uploads");
      up.set("fileName", fileName);
      const upRes = await fetch("https://sunoapiorg.redpandaai.co/api/file-stream-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: up,
      });
      const upText = await upRes.text().catch(() => "");
      const upData = safeJson(upText);
      if (!upRes.ok || !upData?.success || !upData?.data?.downloadUrl) {
        await refund("suno_upload_failed");
        return json(res, 502, {
          error: "Temporary audio upload failed",
          status: upRes.status || 502,
          details: upData || upText,
        });
      }
      const uploadUrl = String(upData.data.downloadUrl);

      // Diagnostic log so we can verify, in Vercel logs, exactly what audio
      // Suno received per request. Logged once per generation, no PII.
      // `clientFingerprint` is the SHA-256 hex of the EXACT bytes the
      // browser FormData built; matching it against `head8/tail8` proves
      // whether bytes were mutated in transit or by ffmpeg.
      try {
        const head = Buffer.isBuffer(fileBytes) ? fileBytes.slice(0, 8).toString("hex") : "";
        const tail = Buffer.isBuffer(fileBytes) ? fileBytes.slice(-8).toString("hex") : "";
        console.log("[suno/stems] reference uploaded", {
          referenceMode,
          fileName,
          fileType,
          bytes: Buffer.isBuffer(fileBytes) ? fileBytes.length : null,
          head8: head,
          tail8: tail,
          clientFingerprint: String(body?.clientFingerprint || "").slice(0, 16) || null,
          uploadUrl,
        });
      } catch {}

      // 2) Route by reference mode
      const requestedModel = String(model || "").trim().toUpperCase();
      const allowedModels = new Set(["V4_5PLUS", "V5", "V5_5", "V4_5ALL", "V4_5", "V4"]);
      const safeModel = allowedModels.has(requestedModel) ? requestedModel : "V5_5";

      // === Cover mode: melody-following new arrangement ===
      const coverModes = new Set(["vocal_full", "vocal_cover", "song_remix", "song_cover", "vocal_instrumental"]);
      if (coverModes.has(referenceMode)) {
        const coverInstrumental = referenceMode === "vocal_instrumental";
        // Enrich style with dialect only — uploaded audio drives melody and voice.
        const coverStyle = buildCoverStyle({
          baseStyle: style,
          dialect,
          dialectHint,
        });
        const coverNegative = mergeNegativeTags(negativeTags, [
          "out-of-tune",
          "autotune artifact",
          "robotic vocal",
          "off-beat",
          "muddy mix",
          "harsh sibilance",
        ]);
        const coverPayload = {
          uploadUrl,
          customMode: true,
          instrumental: coverInstrumental,
          model: safeModel,
          callBackUrl,
          prompt: coverInstrumental ? "" : (prompt || ""),
          style: coverStyle,
          title: title || (coverInstrumental ? "Instrumental cover from reference" : "Cover from reference"),
          negativeTags: coverNegative,
          styleWeight: 0.5,
          ...(!coverInstrumental && personaId ? { personaId } : {}),
        };
        try {
          console.log("[suno/stems] upload-cover payload", {
            title: coverPayload.title,
            instrumental: coverPayload.instrumental,
            style: coverPayload.style,
            styleLen: coverPayload.style.length,
            promptLen: (coverPayload.prompt || "").length,
            promptPreview: String(coverPayload.prompt || "").slice(0, 120),
            negativeTags: coverPayload.negativeTags,
            model: coverPayload.model,
            vocalGender: coverPayload.vocalGender ?? null,
            personaId: coverPayload.personaId ?? null,
            uploadUrlHost: (() => { try { return new URL(uploadUrl).host; } catch { return null; } })(),
            clientFingerprint: String(body?.clientFingerprint || "").slice(0, 16) || null,
          });
        } catch {}
        const coverRes = await fetch("https://api.sunoapi.org/api/v1/generate/upload-cover", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(coverPayload),
        });
        const coverText = await coverRes.text().catch(() => "");
        const coverData = safeJson(coverText);
        try {
          const coverTaskId = coverData?.data?.taskId || coverData?.taskId || null;
          console.log("[suno/stems] upload-cover response", {
            httpStatus: coverRes.status,
            ok: coverRes.ok,
            taskId: coverTaskId,
            sunoCode: coverData?.code ?? null,
            sunoMsg: String(coverData?.msg || coverData?.message || "").slice(0, 200),
            uploadUrl,
            clientFingerprint: String(body?.clientFingerprint || "").slice(0, 16) || null,
          });
        } catch {}
        if (!coverRes.ok || (coverData && "code" in coverData && Number(coverData.code) !== 200)) {
          await refund("suno_cover_failed");
          return json(res, 502, {
            error: "Upload-cover failed",
            status: coverRes.status || 502,
            details: coverData || coverText,
            uploadUrl,
          });
        }
        return json(res, 200, {
          ...(coverData || { raw: coverText }),
          uploadUrl,
          _credits: { spent: isAdmin ? 0 : cost, balance: balanceAfterDebit, admin: isAdmin || undefined },
        });
      }

      // === Extend mode: explicit "use upload as intro, continue from continueAt" ===
      if (referenceMode === "vocal_extend" || referenceMode === "song_extend") {
        const extPayload = {
          uploadUrl,
          defaultParamFlag: true,
          model: safeModel,
          callBackUrl,
          instrumental: false,
          prompt: prompt || "",
          style: style || "",
          title: title || "Extended from reference",
          continueAt: 1,
          ...(vocalGender === "m" || vocalGender === "f" ? { vocalGender } : {}),
          ...(personaId ? { personaId } : {}),
        };
        const extRes = await fetch("https://api.sunoapi.org/api/v1/generate/upload-extend", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(extPayload),
        });
        const extText = await extRes.text().catch(() => "");
        const extData = safeJson(extText);
        if (!extRes.ok || (extData && "code" in extData && Number(extData.code) !== 200)) {
          await refund("suno_extend_failed");
          return json(res, 502, {
            error: "Upload-extend failed",
            status: extRes.status || 502,
            details: extData || extText,
            uploadUrl,
          });
        }
        return json(res, 200, {
          ...(extData || { raw: extText }),
          uploadUrl,
          _credits: { spent: isAdmin ? 0 : cost, balance: balanceAfterDebit, admin: isAdmin || undefined },
        });
      }

      // === Backing mode (humming_music / humming_backing / default): keep upload as lead, add band ===
      //
      // ROOT CAUSE FIX (Suno 531 "extending lyrics empty/malformed" on
      // underpainting/add-instrumental):
      //   The previous payload jammed sentence-style instructions like
      //   "lock to uploaded vocal melody" and "follow humming contour"
      //   into `tags`. Suno's docs explicitly want short, comma-separated
      //   style words (e.g. "Relaxing Piano, Ambient, Peaceful").
      //   sunoapi.org's underpainting parser tries to extract a style
      //   from those tags; when it sees verbs and prose it fails with
      //   their generic 531 template — which mentions "lyrics" even
      //   though add-instrumental has no lyrics field. That's why we
      //   couldn't reproduce the issue by changing recordings: it's a
      //   tags-parsing bug, not a vocal-bytes bug.
      //
      // The new `tags` is: user's `style` + optional dialect/timbre
      // descriptors only. Anything that looks like an instruction is
      // dropped. If style is empty we fall back to a single neutral
      // style word so the field is never empty (it's required).
      const instModel = ["V4_5PLUS", "V5", "V5_5"].includes(safeModel) ? safeModel : "V4_5PLUS";
      const styleClean = String(style || "").replace(/\s+/g, " ").trim();
      // Build the addPayload to mirror the Suno OpenAPI example AS
      // CLOSELY AS POSSIBLE: short style words for `tags`, short
      // negative style words for `negativeTags`, nothing else. The
      // last few iterations added phrases like "copyrighted melody"
      // and "cover of existing song" into negativeTags hoping to
      // bias Suno away from popular references; instead, Suno's
      // text-safety classifier pattern-matched those phrases and
      // returned 413 "Uploaded audio contains copyrighted lyrics" on
      // every request — regardless of audio. Strict minimal payload
      // is the fix.
      const cleanTagsList = [styleClean]
        .map((s) => String(s || "").trim())
        .filter(Boolean);
      let cleanTags = cleanTagsList.join(", ");
      if (!cleanTags) cleanTags = "ambient, instrumental";
      if (cleanTags.length > 180) cleanTags = cleanTags.slice(0, 177) + "...";
      const cleanNegative = (() => {
        const userExtra = String(negativeTags || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const merged = userExtra.length ? userExtra.join(", ") : "heavy metal, aggressive drums";
        return merged.length > 180 ? merged.slice(0, 177) + "..." : merged;
      })();
      const addPayload = {
        uploadUrl,
        title: title || "Reference instrumental",
        tags: cleanTags,
        negativeTags: cleanNegative,
        callBackUrl,
        model: instModel,
        ...(audioWeight !== null ? { audioWeight } : {}),
        ...(styleWeight !== null ? { styleWeight } : {}),
        ...(vocalGender === "m" || vocalGender === "f" ? { vocalGender } : {}),
      };
      try {
        console.log("[suno/stems] add-instrumental payload", {
          title: addPayload.title,
          tags: addPayload.tags,
          tagsLen: addPayload.tags.length,
          negativeTags: addPayload.negativeTags,
          negativeTagsLen: addPayload.negativeTags.length,
          model: addPayload.model,
          audioWeight: addPayload.audioWeight ?? null,
          styleWeight: addPayload.styleWeight ?? null,
          vocalGender: addPayload.vocalGender ?? null,
          uploadUrlHost: (() => { try { return new URL(uploadUrl).host; } catch { return null; } })(),
        });
      } catch {}
      // Do NOT forward personaId here — official add-instrumental OpenAPI has no
      // persona field. Forwarding it caused Suno to mis-handle requests (seen as
      // lyric/extension failures with code 531 / "empty extending lyrics"). Voice
      // persona belongs on upload-cover / generate, not on backing-band flow.
      const addRes = await fetch("https://api.sunoapi.org/api/v1/generate/add-instrumental", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(addPayload),
      });
      const addText = await addRes.text().catch(() => "");
      const addData = safeJson(addText);
      // Log Suno's response for add-instrumental (a.k.a. "underpainting"
      // in Suno's dashboard). Pair this with the [reference uploaded] log
      // above using `clientFingerprint` + `uploadUrl` to trace a single
      // generation end-to-end through Vercel logs.
      try {
        const addTaskId = addData?.data?.taskId || addData?.taskId || null;
        console.log("[suno/stems] add-instrumental response", {
          httpStatus: addRes.status,
          ok: addRes.ok,
          taskId: addTaskId,
          sunoCode: addData?.code ?? null,
          sunoMsg: String(addData?.msg || addData?.message || "").slice(0, 200),
          uploadUrl,
          clientFingerprint: String(body?.clientFingerprint || "").slice(0, 16) || null,
        });
      } catch {}
      if (!addRes.ok || (addData && "code" in addData && Number(addData.code) !== 200)) {
        await refund("suno_add_inst_failed");
        return json(res, 502, {
          error: "Add instrumental failed",
          status: addRes.status || 502,
          details: addData || addText,
          uploadUrl,
        });
      }
      return json(res, 200, {
        ...(addData || { raw: addText }),
        uploadUrl,
        _credits: { spent: isAdmin ? 0 : cost, balance: balanceAfterDebit, admin: isAdmin || undefined },
      });
    }

    const taskId = String(body?.taskId || "").trim();
    const audioId = String(body?.audioId || "").trim();
    const type = body?.type === "split_stem" ? "split_stem" : "separate_vocal";
    if (!taskId || !audioId) {
      await refund("missing_ids");
      return json(res, 400, { error: "Missing taskId or audioId" });
    }

    const payload = { taskId, audioId, type, callBackUrl };

    const r = await fetch("https://api.sunoapi.org/api/v1/vocal-removal/generate", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await r.text().catch(() => "");
    const data = safeJson(text);
    if (!r.ok) {
      await refund(`suno_http_${r.status}`);
      return json(res, 502, { error: "Upstream engine error", status: r.status, details: data || text });
    }
    if (data && typeof data === "object" && "code" in data && data.code !== 200) {
      await refund(`suno_code_${data.code}`);
      return json(res, 502, { error: "Request was rejected upstream", details: data });
    }
    return json(res, 200, {
      ...(data || { raw: text }),
      _credits: { spent: isAdmin ? 0 : cost, balance: balanceAfterDebit, admin: isAdmin || undefined },
    });
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
};

// === helpers ===

/** True when the user's style asks for speech / VO instead of sung delivery. */
function wantsSpokenDelivery(text) {
  const s = String(text || "").toLowerCase();
  return /\b(spoken(?:\s+word)?|voice[- ]?over|voiceover|narrat(?:ion|ed|or)?|monologue|ad\s+read|documentary|podcast|no\s+singing|non[- ]?melodic|reads?\s+(?:the\s+)?script)\b/.test(
    s
  );
}

/**
 * Cover / hum style: user style + dialect only. Uploaded reference drives
 * melody and vocal character — no auto baritone/tenor phrases here.
 */
function buildCoverStyle({ baseStyle, dialect, dialectHint }) {
  const parts = [];
  const base = String(baseStyle || "").trim();
  const spoken = wantsSpokenDelivery(base);
  if (base) parts.push(base);
  else parts.push(spoken ? "spoken word voice-over, clear narration" : "modern pop, polished full song arrangement");

  const dialectClean = String(dialect || "").trim();
  if (dialectClean) parts.push(`dialect: ${dialectClean}`);

  const dialectHintClean = String(dialectHint || "").trim();
  if (dialectHintClean) parts.push(`dialect hint: ${dialectHintClean}`);

  parts.push(
    spoken
      ? "spoken word delivery, clear narration, no melodic singing"
      : "expressive melodic phrasing"
  );

  let merged = parts.filter(Boolean).join(", ");
  if (merged.length > 980) merged = merged.slice(0, 977) + "...";
  return merged;
}

function mergeNegativeTags(userNegative, defaults) {
  const set = new Set();
  for (const arr of [defaults || [], String(userNegative || "").split(",")]) {
    for (const raw of arr) {
      const v = String(raw || "").trim().toLowerCase();
      if (v) set.add(v);
    }
  }
  let merged = [...set].join(", ");
  if (merged.length > 240) merged = merged.slice(0, 237) + "...";
  return merged;
}

/** Pick a filename extension ffmpeg can probe reliably. */
function guessInputExt(lowerMime, lowerName) {
  const fromName =
    lowerName.includes(".") && !lowerName.endsWith(".")
      ? lowerName.slice(lowerName.lastIndexOf(".") + 1)
      : "";
  if (["mp3", "wav", "m4a", "aac", "flac", "webm", "ogg", "opus", "mp4"].includes(fromName)) return fromName;
  if (/webm/.test(lowerMime)) return "webm";
  if (/ogg|opus/.test(lowerMime)) return "ogg";
  if (/mpeg|mp3/.test(lowerMime)) return "mp3";
  if (/wav|wave|x-wav/.test(lowerMime)) return "wav";
  if (/m4a|mp4|aac/.test(lowerMime)) return "m4a";
  if (/flac/.test(lowerMime)) return "flac";
  return "webm";
}

/**
 * Vocal reference cleanup for Suno pitch/melody analysis:
 * - High-pass ~80 Hz (phone rumble, breath LF)
 * - Trim leading/trailing silence (align melody to bar 1)
 * - Random sub-perceptual tempo/pitch perturbation to break Suno's
 *   input-side audio fingerprinting. Suno indexes audio they receive
 *   for ~14 days; a previously-uploaded hum will be matched on
 *   re-upload and rejected with code 413 ("Uploaded audio contains
 *   copyrighted lyrics") even though it's the user's own audio. The
 *   perturbation is randomized per request so retries don't hash to
 *   the same fingerprint. ±2–3% tempo + ±10–25 cents pitch is below
 *   the JND for most listeners but far above any spectral-hash
 *   tolerance window.
 * - EBU R128 loudness normalize (quiet recordings)
 * All references are re-encoded to mono MP3 44.1 kHz.
 */
function pickPerturbation() {
  const tempoLow = 1.020;
  const tempoHigh = 1.038;
  const tempo = +(tempoLow + Math.random() * (tempoHigh - tempoLow)).toFixed(4);
  const pitchCentsRange = 25;
  const cents = (Math.random() * 2 - 1) * pitchCentsRange;
  const pitchRatio = +Math.pow(2, cents / 1200).toFixed(6);
  return { tempo, pitchRatio, cents: +cents.toFixed(1) };
}

function buildVocalEnhanceFilters({ withLoudnorm, perturb }) {
  const trim =
    "silenceremove=start_periods=1:start_duration=0.2:start_threshold=-38dB:detection=peak," +
    "areverse," +
    "silenceremove=start_periods=1:start_duration=0.2:start_threshold=-38dB:detection=peak," +
    "areverse";
  const baseSr = 44100;
  const shiftedSr = Math.round(baseSr * (perturb?.pitchRatio || 1));
  // asetrate changes both pitch and tempo; aresample brings us back to
  // 44.1 kHz; atempo then dials the tempo to the desired ratio
  // independently of pitch. Net effect: pitch nudged by ±cents, tempo
  // nudged by ±2–4 %, fingerprint completely scrambled.
  const perturbChain = perturb
    ? `,asetrate=${shiftedSr},aresample=${baseSr},atempo=${perturb.tempo}`
    : "";
  const core = `highpass=f=80,${trim}${perturbChain}`;
  return withLoudnorm ? `${core},loudnorm=I=-16:LRA=11:TP=-1.5` : core;
}

function runFfmpeg(ffmpegPath, args) {
  const { spawn } = require("child_process");
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args);
    let stderr = "";
    p.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(0, 400)}`));
    });
  });
}

async function maybeTranscodeToMp3({ bytes, mime, name }) {
  let ffmpegPath = null;
  try {
    ffmpegPath = require("ffmpeg-static");
  } catch {
    return { bytes, mime, name };
  }
  if (!ffmpegPath) return { bytes, mime, name };

  const fs = require("fs");
  const os = require("os");
  const path = require("path");

  const lowerMime = String(mime || "").toLowerCase();
  const lowerName = String(name || "").toLowerCase();
  const ext = guessInputExt(lowerMime, lowerName);

  const tmpDir = os.tmpdir();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const inPath = path.join(tmpDir, `nabad-in-${stamp}.${ext}`);
  const outPath = path.join(tmpDir, `nabad-out-${stamp}.mp3`);

  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const mp3Name = `${String(name || "vocal").replace(/\.[^.]+$/, "")}.mp3`;
  // Audio perturbation is OFF. Earlier we applied a random tempo+pitch
  // nudge to break Suno's input-side fingerprint cache, but users
  // reported the perturbed audio sounded "filtered/processed" — fair,
  // since high-pass + tempo + pitch + loudnorm is audible on melodic
  // takes. Cleaner reference in → cleaner generation out.
  //
  // If Suno's cache flags repeat uploads, we now lean on the unique
  // multipart filename (ref-{ts}-...) and the upload-cover endpoint's
  // own variability instead.
  const perturb = null;

  async function encodePlain() {
    await runFfmpeg(ffmpegPath, [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "44100",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "256k",
      outPath,
    ]);
  }

  try {
    fs.writeFileSync(inPath, buf);

    // 1) Full chain: HP + trim + perturbation + loudnorm
    try {
      await runFfmpeg(ffmpegPath, [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        inPath,
        "-vn",
        "-af",
        buildVocalEnhanceFilters({ withLoudnorm: true, perturb }),
        "-ac",
        "1",
        "-ar",
        "44100",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "256k",
        outPath,
      ]);
    } catch {
      // 2) Some builds choke on loudnorm for very short clips — retry without loudnorm
      await runFfmpeg(ffmpegPath, [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        inPath,
        "-vn",
        "-af",
        buildVocalEnhanceFilters({ withLoudnorm: false, perturb }),
        "-ac",
        "1",
        "-ar",
        "44100",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "256k",
        outPath,
      ]);
    }

    let out = fs.readFileSync(outPath);
    const minBytes = 2048;
    if (!out || out.length < minBytes) {
      throw new Error("enhanced output too short");
    }
    return { bytes: out, mime: "audio/mpeg", name: mp3Name };
  } catch {
    try {
      fs.writeFileSync(inPath, buf);
      await encodePlain();
      const out = fs.readFileSync(outPath);
      if (out && out.length >= 2048) {
        return { bytes: out, mime: "audio/mpeg", name: mp3Name };
      }
    } catch {
      // ignore
    }
    return { bytes, mime, name };
  } finally {
    try {
      fs.unlinkSync(inPath);
    } catch {}
    try {
      fs.unlinkSync(outPath);
    } catch {}
  }
}

function getHostProto(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const proto = req.headers["x-forwarded-proto"] || "https";
  return { host, proto };
}

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { _parseError: e?.message || "Invalid JSON", _raw: raw };
  }
}

function readMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { fileSize: MAX_UPLOAD_BYTES } });
    const out = {};
    let fileChunks = [];
    let truncated = false;
    bb.on("field", (name, val) => {
      out[name] = val;
    });
    bb.on("file", (name, file, info) => {
      const { filename, mimeType } = info || {};
      out.fileName = out.fileName || filename || "vocal-reference.webm";
      out.fileType = out.fileType || mimeType || "audio/webm";
      file.on("data", (d) => fileChunks.push(d));
      file.on("limit", () => {
        truncated = true;
      });
    });
    bb.on("error", reject);
    bb.on("finish", () => {
      out.fileBytes = fileChunks.length ? Buffer.concat(fileChunks) : null;
      out._truncated = truncated;
      resolve(out);
    });
    req.pipe(bb);
  });
}

function readMultipartFromRaw(rawText, headers) {
  return new Promise((resolve, reject) => {
    const { Readable } = require("stream");
    const bb = Busboy({ headers, limits: { fileSize: MAX_UPLOAD_BYTES } });
    const out = {};
    let fileChunks = [];
    let truncated = false;
    bb.on("field", (name, val) => {
      out[name] = val;
    });
    bb.on("file", (name, file, info) => {
      const { filename, mimeType } = info || {};
      out.fileName = out.fileName || filename || "vocal-reference.webm";
      out.fileType = out.fileType || mimeType || "audio/webm";
      file.on("data", (d) => fileChunks.push(d));
      file.on("limit", () => {
        truncated = true;
      });
    });
    bb.on("error", reject);
    bb.on("finish", () => {
      out.fileBytes = fileChunks.length ? Buffer.concat(fileChunks) : null;
      out._truncated = truncated;
      resolve(out);
    });
    const stream = Readable.from(Buffer.from(rawText, "utf8"));
    stream.pipe(bb);
  });
}

function safeJson(txt) {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}
