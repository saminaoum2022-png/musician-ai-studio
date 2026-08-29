/**
 * POST /api/music/cover-art
 * Default abstract covers via Cloudflare Flux Schnell; Pollinations fallback; user artwork via Gemini.
 */
const path = require("path");
const { pathToFileURL } = require("url");
const { verifyUser, isAdminEmail } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");
const { normalizeCoverPortraitBuffer, COVER_PORTRAIT_W, COVER_PORTRAIT_H } = require("../_lib/cover-portrait-normalize");
const { tryGeminiCoverScene } = require("../_lib/gemini-cover-prompt");
const {
  resolveCoverRegenImageProvider,
  geminiRegenFallbackEnabled,
  tryGeminiCoverImage,
} = require("../_lib/gemini-cover-image");
const {
  fetchCloudflareFluxCover,
  resolveDefaultCoverImageProvider,
} = require("../_lib/cloudflare-flux-upstream");
const { runVisualDirector } = require("../_lib/visual-director");
const { queueLogProviderUsage, logProviderUsage } = require("../_lib/provider-usage-log");

const MAX_FIELD = 160;
const MAX_STYLE = 980;
const MAX_ARTWORK = 280;
const MAX_AVOID = 900;
const MAX_CLIENT_PROMPT = 4500;
let _promptMod = null;

async function getPromptModule() {
  if (!_promptMod) {
    const p = path.join(__dirname, "../../src/cover-art/prompt.js");
    _promptMod = await import(pathToFileURL(p).href);
  }
  return _promptMod;
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return await new Promise((resolve, reject) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => {
      try {
        resolve(s ? JSON.parse(s) : {});
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, code, data) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

async function fetchPollinationsCover(upstreamUrl, { attempts = 2, timeoutMs = 24000 } = {}) {
  let lastError = "unknown";
  for (let i = 0; i < attempts; i += 1) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 900 * i));
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const upstream = await fetch(upstreamUrl, {
        headers: { "User-Agent": "NabadAi-CoverArt/1.0" },
        signal: ctrl.signal,
      });
      const mime = String(upstream.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
      const buf = Buffer.from(await upstream.arrayBuffer());
      if (!upstream.ok) {
        lastError = `HTTP ${upstream.status}`;
        continue;
      }
      if (/json/i.test(mime) || buf.length < 512) {
        lastError = buf.length < 512 ? "empty_image" : "upstream_json";
        continue;
      }
      return { ok: true, buf, mime: mime || "image/jpeg" };
    } catch (e) {
      lastError = e?.name === "AbortError" ? "timeout" : (e?.message || String(e));
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, error: lastError };
}

async function normalizeCoverResponseBuffer(buf, { preferCenter = false } = {}) {
  let outBuf = buf;
  let outMime = "image/jpeg";
  try {
    const normalized = await normalizeCoverPortraitBuffer(buf, { preferCenter });
    outBuf = normalized.buf;
    outMime = normalized.mime || "image/jpeg";
  } catch (e) {
    console.warn("[music/cover-art] portrait normalize skipped", e?.message || e);
  }
  return { outBuf, outMime };
}

function coverDataUrlFromBuffer(outBuf, outMime) {
  return `data:${outMime || "image/jpeg"};base64,${outBuf.toString("base64")}`;
}

async function recordCoverUsage(entry) {
  try {
    await logProviderUsage(entry);
  } catch (e) {
    console.warn("[music/cover-art] usage log skipped", e?.message || e);
  }
}

async function fetchAbstractCoverImage({
  prompt,
  seed,
  avoidTags = "",
  storyTheme = "",
  userArtwork = "",
  buildPollinationsUrl,
  buildFluxCoverPrompt,
  preferredProvider,
} = {}) {
  const provider = preferredProvider || resolveDefaultCoverImageProvider();

  if (provider === "cloudflare") {
    const fluxPrompt = buildFluxCoverPrompt(prompt, { avoidTags, storyTheme, userArtwork });
    let cf = await fetchCloudflareFluxCover({ prompt: fluxPrompt });
    if (!cf.ok && fluxPrompt.length > 1800) {
      const retryPrompt = buildFluxCoverPrompt(prompt, { avoidTags: "", storyTheme: "", userArtwork: "" });
      if (retryPrompt.length < fluxPrompt.length) {
        cf = await fetchCloudflareFluxCover({ prompt: retryPrompt });
      }
    }
    if (cf.ok) {
      return {
        ok: true,
        buf: cf.buf,
        mime: cf.mime || "image/jpeg",
        provider: "cloudflare",
        attemptedProvider: "cloudflare",
      };
    }
    console.warn("[music/cover-art] cloudflare flux failed", cf.error);
    const upstreamUrl = buildPollinationsUrl(prompt, seed, { avoidTags, storyTheme, userArtwork });
    const polled = await fetchPollinationsCover(upstreamUrl);
    if (!polled.ok) {
      return {
        ok: false,
        error: polled.error || "pollinations_failed",
        attemptedProvider: "cloudflare",
        fallbackReason: cf.error || "cloudflare_failed",
      };
    }
    return {
      ok: true,
      buf: polled.buf,
      mime: polled.mime || "image/jpeg",
      provider: "pollinations",
      attemptedProvider: "cloudflare",
      fallbackReason: cf.error || "cloudflare_failed",
    };
  }

  const upstreamUrl = buildPollinationsUrl(prompt, seed, { avoidTags, storyTheme, userArtwork });
  const polled = await fetchPollinationsCover(upstreamUrl);
  if (!polled.ok) {
    return { ok: false, error: polled.error || "pollinations_failed", attemptedProvider: "pollinations" };
  }
  return {
    ok: true,
    buf: polled.buf,
    mime: polled.mime || "image/jpeg",
    provider: "pollinations",
    attemptedProvider: "pollinations",
  };
}

/** Regen — Flux/Pollinations by default; Gemini only when COVER_REGEN_IMAGE_PROVIDER=gemini. Hints shape the prompt, not the provider. */
async function fetchRegenCoverImage({
  prompt,
  seed,
  avoidTags,
  storyTheme = "",
  userArtwork = "",
  buildPollinationsUrl,
  buildFluxCoverPrompt,
  allowHumans = false,
}) {
  const pollOpts = { avoidTags, storyTheme: storyTheme || "", userArtwork: userArtwork || "" };
  const regenProvider = resolveCoverRegenImageProvider();
  if (regenProvider === "gemini") {
    const gem = await tryGeminiCoverImage({
      prompt,
      allowHumans: allowHumans || Boolean(String(userArtwork || "").trim()),
    });
    if (gem.ok) {
      return {
        ok: true,
        buf: gem.buf,
        mime: gem.mime || "image/png",
        provider: "gemini",
        geminiModel: gem.model || "",
        regenAttemptedProvider: "gemini",
      };
    }
    console.warn("[music/cover-art] gemini regen failed", gem.error);
    if (!geminiRegenFallbackEnabled()) {
      return { ok: false, error: gem.error || "gemini_failed", regenAttemptedProvider: "gemini" };
    }
    const rendered = await fetchAbstractCoverImage({
      prompt,
      seed,
      ...pollOpts,
      buildPollinationsUrl,
      buildFluxCoverPrompt,
    });
    if (!rendered.ok) {
      return {
        ok: false,
        error: rendered.error || "abstract_cover_failed",
        regenAttemptedProvider: "gemini",
        regenFallbackReason: gem.error || "gemini_failed",
      };
    }
    return {
      ok: true,
      buf: rendered.buf,
      mime: rendered.mime || "image/jpeg",
      provider: rendered.provider,
      geminiModel: "",
      regenAttemptedProvider: "gemini",
      regenFallbackReason: gem.error || "gemini_failed",
      ...(rendered.fallbackReason ? { abstractFallbackReason: rendered.fallbackReason } : {}),
    };
  }

  const rendered = await fetchAbstractCoverImage({
    prompt,
    seed,
    ...pollOpts,
    buildPollinationsUrl,
    buildFluxCoverPrompt,
  });
  if (!rendered.ok) {
    return {
      ok: false,
      error: rendered.error || "abstract_cover_failed",
      regenAttemptedProvider: rendered.attemptedProvider || "pollinations",
    };
  }
  return {
    ok: true,
    buf: rendered.buf,
    mime: rendered.mime || "image/jpeg",
    provider: rendered.provider,
    geminiModel: "",
    regenAttemptedProvider: rendered.attemptedProvider || rendered.provider,
    ...(rendered.fallbackReason ? { regenFallbackReason: rendered.fallbackReason } : {}),
  };
}

async function sendRegenCoverJson(res, {
  buf,
  mime,
  seed,
  provider,
  geminiModel = "",
  regenAttemptedProvider = "",
  regenFallbackReason = "",
  bucket = "default",
  visualMode = "user_directed",
  storyTheme = "user_regen",
  artworkSource = "user_artwork",
  params = {},
  userId = "",
  songId = "",
  preferCenter = false,
}) {
  const { outBuf, outMime } = await normalizeCoverResponseBuffer(buf, { preferCenter });
  const imageProvider =
    provider === "gemini" ? "gemini" : provider === "cloudflare" ? "cloudflare" : "pollinations";
  const usageRef = String(songId || params?.songId || "cover_regen").slice(0, 120);
  await recordCoverUsage({
    provider: imageProvider,
    kind: "cover_image_regen",
    userId,
    ref: usageRef,
  });
  return sendJson(res, 200, {
    ok: true,
    dataUrl: coverDataUrlFromBuffer(outBuf, outMime),
    seed,
    bucket,
    visualMode,
    storyTheme,
    artworkSource,
    params: {
      ...params,
      ...(geminiModel ? { geminiImageModel: geminiModel } : {}),
      ...(regenAttemptedProvider ? { regenAttemptedProvider } : {}),
      ...(regenFallbackReason ? { regenFallbackReason } : {}),
    },
    coverWidth: COVER_PORTRAIT_W,
    coverHeight: COVER_PORTRAIT_H,
    provider,
    regenAttemptedProvider: regenAttemptedProvider || provider,
    ...(regenFallbackReason ? { regenFallbackReason } : {}),
    abstract: true,
    coverRegenerate: true,
  });
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

    const user = await verifyUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in to generate cover art." });

    const body = await readJson(req);
    const songId = String(body?.songId || body?.id || "").trim();
    if (!songId) return sendJson(res, 400, { error: "songId is required." });

    const {
      buildAbstractCoverPrompt,
      buildPollinationsUrl,
      buildFluxCoverPrompt,
      moodPaletteForBucket,
      classifyVisualBucket,
      sanitizeArtworkPrompt,
      resolveStoryTheme,
    } = await getPromptModule();

    const avoidTagsInput = String(body?.avoidTagsInput || body?.avoidTags || "").trim().slice(0, MAX_FIELD);
    const coverRegenerate = Boolean(body?.coverRegenerate);
    if (coverRegenerate && !isAdminEmail(user.email)) {
      const { requireProSubscription } = require("../_lib/pro-web-gate");
      const proGate = await requireProSubscription(user.userId);
      if (!proGate.ok) {
        return sendJson(res, proGate.status, { error: proGate.error, code: proGate.code });
      }
    }
    const regenUserHint = String(body?.regenUserHint || "").trim().slice(0, MAX_ARTWORK);
    const clientPrompt = String(body?.clientPrompt || "").trim().slice(0, MAX_CLIENT_PROMPT);
    const clientSeedRaw = Number(body?.clientSeed);

    const coverInput = {
      songId,
      title: String(body?.title || "").trim().slice(0, MAX_FIELD),
      genre: String(body?.genre || body?.style || "").trim().slice(0, MAX_FIELD),
      mood: String(body?.mood || "").trim().slice(0, MAX_FIELD),
      tempo: body?.tempo,
      energy: body?.energy,
      brightness: body?.brightness,
      sonicProfile: String(body?.sonicProfile || "").trim().slice(0, 40),
      style: String(body?.style || body?.styleInput || "").trim().slice(0, MAX_STYLE),
      styleInput: String(body?.styleInput || body?.style || "").trim().slice(0, MAX_STYLE),
      styleSent: String(body?.styleSent || "").trim().slice(0, MAX_STYLE),
      lyrics: String(body?.lyrics || body?.lyricsInput || "").trim().slice(0, 800),
      finalPrompt: String(body?.finalPrompt || "").trim().slice(0, MAX_FIELD),
      artworkStyle: String(body?.artworkStyle || "").trim().slice(0, MAX_ARTWORK),
      artworkHint: String(body?.artworkHint || "").trim().slice(0, MAX_ARTWORK),
      humTrack: Boolean(body?.humTrack),
      instrumentLabel: String(body?.instrumentLabel || "").trim().slice(0, 40),
      instrument: String(body?.instrument || body?.instrumentId || "").trim().slice(0, 40),
      skipGeminiScene: Boolean(body?.skipGeminiScene || body?.humTrack || coverRegenerate),
      searchTemplateTitle: String(body?.searchTemplateTitle || "").trim().slice(0, MAX_FIELD),
      occasionLabel: String(body?.occasionLabel || "").trim().slice(0, MAX_FIELD),
    };

    const bucketKey = classifyVisualBucket(coverInput);
    const brandPalette = moodPaletteForBucket(bucketKey);
    const artworkHint = String(coverInput.artworkHint || coverInput.artworkStyle || "").trim();
    const userDirectedArtwork = Boolean(artworkHint);
    const { theme, storyScore } = resolveStoryTheme(coverInput);

    const vd = await runVisualDirector(coverInput, {
      bucketKey,
      storyThemeId: storyScore > 0 && theme?.id ? theme.id : undefined,
      storyScene: theme?.scene || "",
      visualModeHint: theme?.visualMode || "",
    });
    const vdApplied = vd.applied;
    const promptInput = vd.mode === "apply" && vdApplied?.coverInput ? vdApplied.coverInput : coverInput;
    const effectiveAvoidTags = vd.mode === "apply" && vdApplied?.avoidMerged
      ? String(vdApplied.avoidMerged).slice(0, MAX_AVOID)
      : avoidTagsInput.slice(0, MAX_AVOID);

    /** Regen: client bundle (Visual Director + Nabad DNA + mood palette) — Gemini or Pollinations. */
    if (coverRegenerate && clientPrompt) {
      const seed = Number.isFinite(clientSeedRaw) && clientSeedRaw > 0
        ? Math.floor(clientSeedRaw) % 2147483646
        : Math.floor(Math.random() * 2147483645) + 1;
      const regenUserArt = String(regenUserHint || body?.artworkHint || body?.artworkStyle || "").trim().slice(0, MAX_ARTWORK);
      const rendered = await fetchRegenCoverImage({
        prompt: clientPrompt,
        seed,
        avoidTags: String(body?.clientAvoidTags || effectiveAvoidTags || "").slice(0, MAX_AVOID),
        storyTheme: String(body?.clientStoryTheme || "").trim(),
        userArtwork: regenUserArt,
        buildPollinationsUrl,
        buildFluxCoverPrompt,
        allowHumans: Boolean(regenUserArt),
      });
      if (!rendered.ok) {
        console.warn("[music/cover-art] regen failed (client prompt)", rendered.error);
        return sendJson(res, 502, { error: "Cover image generation failed upstream." });
      }
      if (
        rendered.regenAttemptedProvider === "gemini" &&
        rendered.provider !== "gemini"
      ) {
        await recordCoverUsage({
          provider: "gemini",
          kind: "cover_image_regen",
          userId: user.userId,
          ref: songId,
          status: "failed",
        });
      }
      if (rendered.fallbackReason && rendered.regenAttemptedProvider === "cloudflare") {
        await recordCoverUsage({
          provider: "cloudflare",
          kind: "cover_image_regen",
          userId: user.userId,
          ref: songId,
          status: "failed",
        });
      }
      return sendRegenCoverJson(res, {
        buf: rendered.buf,
        mime: rendered.mime,
        seed,
        provider: rendered.provider,
        geminiModel: rendered.geminiModel,
        regenAttemptedProvider: rendered.regenAttemptedProvider,
        regenFallbackReason: rendered.regenFallbackReason,
        bucket: String(body?.clientBucket || "default"),
        visualMode: String(body?.clientVisualMode || "still_life"),
        storyTheme: String(body?.clientStoryTheme || "regen"),
        artworkSource: String(body?.clientArtworkSource || "client_regen"),
        userId: user.userId,
        songId,
        preferCenter: rendered.provider === "gemini",
        params: {
          ...(body?.clientParams && typeof body.clientParams === "object" ? body.clientParams : {}),
          ...(regenUserHint ? { regenUserHint } : {}),
        },
      });
    }

    let nabadBriefLine = "";
    if (vd.mode === "apply" && vdApplied?.identityPhrases) {
      nabadBriefLine = `Nabad look: ${String(vdApplied.identityPhrases).trim()}.`;
    }

    let geminiScene = "";
    let geminiModel = "";
    if (!coverInput.skipGeminiScene && !userDirectedArtwork) {
      try {
        const gem = await tryGeminiCoverScene(promptInput, {
          bucketKey,
          palette: brandPalette,
          artworkHint,
          occasionLabel: coverInput.occasionLabel,
          visualDirection: vd.mode === "apply" ? vd.direction : null,
          nabadBriefLine: vd.mode === "apply" ? nabadBriefLine : "",
        });
        if (gem?.ok && gem.scene) {
          geminiScene = sanitizeArtworkPrompt(gem.scene, { title: coverInput.title });
          geminiModel = gem.model || "";
          queueLogProviderUsage({
            provider: "gemini",
            kind: "cover_scene",
            userId: user.userId,
            ref: songId,
          });
        }
      } catch (e) {
        console.warn("[music/cover-art] gemini scene skipped", e?.message || e);
      }
    }

    const promptOpts = {
      ...(geminiScene
        ? { sceneOverride: geminiScene, artworkSourceOverride: "gemini_scene", geminiModel }
        : {}),
      ...(vd.mode === "apply" && vdApplied?.sceneHint
        ? { directorSceneHint: vdApplied.sceneHint }
        : {}),
      ...(vd.mode === "apply" && vdApplied?.identityPhrases
        ? { nabadIdentityPhrases: vdApplied.identityPhrases }
        : {}),
      ...(vd.mode === "apply" && vd.direction ? { visualDirection: vd.direction } : {}),
    };

    const { prompt, seed, bucket, visualMode, storyTheme, artworkSource, params } = buildAbstractCoverPrompt(
      promptInput,
      { ...promptOpts, creativeMode: true },
    );

    const rendered = await fetchAbstractCoverImage({
      prompt,
      seed,
      avoidTags: effectiveAvoidTags,
      storyTheme,
      userArtwork: params?.userArtwork || params?.userArtworkRaw || artworkHint || "",
      buildPollinationsUrl,
      buildFluxCoverPrompt,
    });
    if (!rendered.ok) {
      console.warn("[music/cover-art] abstract cover failed", rendered.error);
      return sendJson(res, 502, { error: "Cover image generation failed upstream." });
    }

    const { outBuf, outMime } = await normalizeCoverResponseBuffer(rendered.buf);

    if (rendered.fallbackReason && rendered.attemptedProvider === "cloudflare") {
      await recordCoverUsage({
        provider: "cloudflare",
        kind: "cover_image",
        userId: user.userId,
        ref: songId,
        status: "failed",
      });
    }

    await recordCoverUsage({
      provider: rendered.provider === "cloudflare" ? "cloudflare" : "pollinations",
      kind: "cover_image",
      userId: user.userId,
      ref: songId,
    });

    return sendJson(res, 200, {
      ok: true,
      dataUrl: coverDataUrlFromBuffer(outBuf, outMime),
      seed,
      bucket,
      visualMode,
      storyTheme,
      artworkSource,
      params: {
        ...params,
        visualDirectorMode: vd.mode,
        ...(vd.direction ? { visualDirection: vd.direction } : {}),
        ...(rendered.fallbackReason ? { abstractFallbackReason: rendered.fallbackReason } : {}),
      },
      coverWidth: params?.coverWidth || COVER_PORTRAIT_W,
      coverHeight: params?.coverHeight || COVER_PORTRAIT_H,
      provider: rendered.provider,
      ...(rendered.attemptedProvider && rendered.provider !== rendered.attemptedProvider
        ? { regenAttemptedProvider: rendered.attemptedProvider, regenFallbackReason: rendered.fallbackReason }
        : {}),
      abstract: true,
    });
  } catch (e) {
    console.warn("[music/cover-art]", e?.message || e);
    return sendJson(res, 500, { error: e?.message || "Cover art generation failed." });
  }
};
