/**
 * POST /api/music/cover-art
 * Generates a deterministic mood-rich abstract cover via Pollinations.
 */
const path = require("path");
const { pathToFileURL } = require("url");
const { verifyUser } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");
const { tryGeminiCoverScene } = require("../_lib/gemini-cover-prompt");
const { runVisualDirector } = require("../_lib/visual-director");

const MAX_FIELD = 160;
const MAX_STYLE = 980;
const MAX_ARTWORK = 280;
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
      instrumentId: String(body?.instrumentId || body?.instrument || "").trim().slice(0, 40),
      instrumentLabel: String(body?.instrumentLabel || "").trim().slice(0, 40),
      skipGeminiScene: Boolean(body?.skipGeminiScene || body?.humTrack),
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
      ? String(vdApplied.avoidMerged).slice(0, MAX_FIELD)
      : avoidTagsInput;

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
    const upstream = await fetch(upstreamUrl, {
      headers: { "User-Agent": "NabadAi-CoverArt/1.0" },
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      console.warn("[music/cover-art] pollinations failed", upstream.status, errText.slice(0, 200));
      return sendJson(res, 502, { error: "Cover image generation failed upstream." });
    }

    const mime = String(upstream.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length < 512) {
      return sendJson(res, 502, { error: "Cover image response was empty." });
    }

    const dataUrl = `data:${mime || "image/jpeg"};base64,${buf.toString("base64")}`;

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
      coverWidth: params?.coverWidth || 1024,
      coverHeight: params?.coverHeight || 1024,
      provider: "pollinations",
      abstract: true,
    });
  } catch (e) {
    console.warn("[music/cover-art]", e?.message || e);
    return sendJson(res, 500, { error: e?.message || "Cover art generation failed." });
  }
};
