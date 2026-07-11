/**
 * POST /api/music/cover-art
 * Generates a deterministic mood-rich abstract cover via Pollinations.
 */
const path = require("path");
const { pathToFileURL } = require("url");
const { verifyUser } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");
const { normalizeCoverPortraitBuffer, COVER_PORTRAIT_W, COVER_PORTRAIT_H } = require("../_lib/cover-portrait-normalize");
const { tryGeminiCoverScene } = require("../_lib/gemini-cover-prompt");
const { runVisualDirector } = require("../_lib/visual-director");

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
      moodPaletteForBucket,
      classifyVisualBucket,
      sanitizeArtworkPrompt,
      resolveStoryTheme,
    } = await getPromptModule();

    const avoidTagsInput = String(body?.avoidTagsInput || body?.avoidTags || "").trim().slice(0, MAX_FIELD);
    const coverRegenerate = Boolean(body?.coverRegenerate);
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

    /** Regen: client bundle builds prompt locally (latest policy) — skip Gemini + server prompt rewrite. */
    if (coverRegenerate && clientPrompt) {
      const seed = Number.isFinite(clientSeedRaw) && clientSeedRaw > 0
        ? Math.floor(clientSeedRaw) % 2147483646
        : Math.floor(Math.random() * 2147483645) + 1;
      const upstreamUrl = buildPollinationsUrl(clientPrompt, seed, {
        avoidTags: String(body?.clientAvoidTags || effectiveAvoidTags || "").slice(0, MAX_AVOID),
      });
      const polled = await fetchPollinationsCover(upstreamUrl);
      if (!polled.ok) {
        console.warn("[music/cover-art] pollinations failed (client regen prompt)", polled.error);
        return sendJson(res, 502, { error: "Cover image generation failed upstream." });
      }
      let outBuf = polled.buf;
      let outMime = polled.mime || "image/jpeg";
      try {
        const normalized = await normalizeCoverPortraitBuffer(polled.buf);
        outBuf = normalized.buf;
        outMime = normalized.mime || "image/jpeg";
      } catch (e) {
        console.warn("[music/cover-art] portrait normalize skipped", e?.message || e);
      }
      const dataUrl = `data:${outMime || "image/jpeg"};base64,${outBuf.toString("base64")}`;
      return sendJson(res, 200, {
        ok: true,
        dataUrl,
        seed,
        bucket: String(body?.clientBucket || "default"),
        visualMode: String(body?.clientVisualMode || "still_life"),
        storyTheme: String(body?.clientStoryTheme || "regen"),
        artworkSource: String(body?.clientArtworkSource || "client_regen"),
        params: body?.clientParams && typeof body.clientParams === "object" ? body.clientParams : {},
        coverWidth: COVER_PORTRAIT_W,
        coverHeight: COVER_PORTRAIT_H,
        provider: "pollinations",
        abstract: true,
        coverRegenerate: true,
      });
    }

    let nabadBriefLine = "";
    if (vd.mode === "apply" && vdApplied?.identityPhrases) {
      nabadBriefLine = `Nabad look: ${String(vdApplied.identityPhrases).trim()}.`;
    }

    let geminiScene = "";
    let geminiModel = "";
    if (!coverInput.skipGeminiScene) {
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
      promptOpts,
    );

    const upstreamUrl = buildPollinationsUrl(prompt, seed, { avoidTags: effectiveAvoidTags });
    const polled = await fetchPollinationsCover(upstreamUrl);
    if (!polled.ok) {
      console.warn("[music/cover-art] pollinations failed", polled.error);
      return sendJson(res, 502, { error: "Cover image generation failed upstream." });
    }

    let outBuf = polled.buf;
    let outMime = polled.mime || "image/jpeg";
    try {
      const normalized = await normalizeCoverPortraitBuffer(polled.buf);
      outBuf = normalized.buf;
      outMime = normalized.mime || "image/jpeg";
    } catch (e) {
      console.warn("[music/cover-art] portrait normalize skipped", e?.message || e);
    }

    const dataUrl = `data:${outMime || "image/jpeg"};base64,${outBuf.toString("base64")}`;

    return sendJson(res, 200, {
      ok: true,
      dataUrl,
      seed,
      bucket,
      visualMode,
      storyTheme,
      artworkSource,
      params: {
        ...params,
        visualDirectorMode: vd.mode,
        ...(vd.direction ? { visualDirection: vd.direction } : {}),
      },
      coverWidth: params?.coverWidth || COVER_PORTRAIT_W,
      coverHeight: params?.coverHeight || COVER_PORTRAIT_H,
      provider: "pollinations",
      abstract: true,
    });
  } catch (e) {
    console.warn("[music/cover-art]", e?.message || e);
    return sendJson(res, 500, { error: e?.message || "Cover art generation failed." });
  }
};
