/**
 * "Our Music Together" album cover — Gemini only, no Pollinations/Cloudflare fallback.
 *
 * GET /api/music/our-music-cover?userId=<other user's id>
 *
 * Duo story still (v3): when BOTH people have a Nabad Artist Avatar, we feed those
 * two portraits into Gemini as reference images and compose them into one Snap-like
 * "story beat" scene (deterministic per pair, richer by tier). When either avatar is
 * missing we skip Gemini entirely — the client keeps the free gradient placeholder.
 * That stops burning credits on generic abstract covers that never felt personal.
 *
 * Cache key on the client includes tier + shared tags; regenerates on tier up or taste
 * change. Deliberately no abstract fallback regen.
 */

const { applyCors } = require("../_lib/cors");
const { verifyUser, sendJson, selectFromTable } = require("../_lib/credits-auth");
const {
  listGeminiGenerateModels,
  pickGeminiImageModels,
  postGeminiGenerateContent,
  extractGeminiImagePart,
  geminiFailureReason,
} = require("../_lib/gemini-cover-image");
const { queueLogProviderUsage } = require("../_lib/provider-usage-log");
const { computeOurMusicStats } = require("../_lib/our-music-stats");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA_URL_RE = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([a-zA-Z0-9+/=]+)$/i;
const MAX_REF_BYTES = 2_200_000;

function cleanUserId(v) {
  const s = String(v || "").trim().toLowerCase();
  return UUID_RE.test(s) ? s : "";
}

function hashPairKey(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Snap-ish duo story beats — one friendship always gets the same scene, different
 *  pairs land on different ones. Tier richness layers on top (see TIER_STORY). */
const STORY_SCENES = [
  "sharing one pair of glowing headphones, heads tilted toward each other, a soft soundwave arc between them",
  "standing side by side under a faint stage spotlight, shoulders almost touching, listening to the same unheard song",
  "leaning on opposite sides of a vinyl booth, looking toward each other across a spinning record of light",
  "sitting on a rooftop at night with city glow behind them, one pointing at the sky while a constellation of music notes faintly forms",
  "walking the same sidewalk in parallel, mid-laugh, a ribbon of teal and violet light trailing between them",
  "framed like a movie still in a late-night car, dashboard glow, the passenger looking over with a knowing half-smile",
  "back-to-back like album-cover legends, calm and confident, a shared pulse/EKG line wrapping around both silhouettes",
  "in a small studio booth together, one at the mic and one listening close, warm intimate space",
];

/** Tier = how far along their shared story feels. Same scene, denser emotion/light. */
const TIER_STORY = {
  spark:
    "Early chapter — quiet first connection. Soft space between them, delicate teal (#22C5A9) and violet (#7752F8) rim light, plenty of dark indigo negative space, like the first listen together.",
  glow:
    "They know this song now — closer composition, warmer eye contact / shared focus, richer color saturation, steadier teal+violet rim light.",
  constellation:
    "Accumulated history — more intricate light, faint constellation or pulse motifs around them, layered cinematic depth, still intimate not crowded.",
  aurora:
    "Fully unlocked friendship poster — most radiant teal+violet rim light, richest painterly grain, confident and warm, like a long story rendered in one still.",
};

function pickStoryScene(pairKey) {
  return STORY_SCENES[hashPairKey(pairKey) % STORY_SCENES.length];
}

function buildDuoStoryPrompt({ tags, tier, matchPct, pairKey }) {
  const scene = pickStoryScene(pairKey);
  const moodLine = tags.length
    ? `Shared musical mood/genres that color the atmosphere (not literal props): ${tags.slice(0, 4).join(", ")}.`
    : "Atmosphere: warm, personal, late-night music friendship.";
  const richness = TIER_STORY[tier] || TIER_STORY.spark;
  const pct = Math.max(0, Math.min(100, Number(matchPct) || 0));
  const chemistry =
    pct >= 70
      ? "Their body language feels closely in sync — mirrored energy, easy closeness."
      : pct <= 25
        ? "Their energy contrasts (different posture/mood) but they still clearly belong in the same frame."
        : "Natural friendly chemistry — different but complementary.";

  return [
    "Create a single square 1:1 album-cover still of TWO people together — a Snapchat-style 'us together' story moment, but rendered as a refined semi-realistic painterly digital illustration (Nabad Artist Avatar house look), NOT a photograph, NOT Bitmoji/cartoon.",
    "REFERENCE IMAGES: Image 1 is Person A. Image 2 is Person B. Preserve each person's real likeness, skin tone, hair, and facial structure from their reference — same identity, just placed into this shared scene.",
    "Compose both as chest-up busts (or three-quarter) clearly readable in frame; neither face tiny; keep clear margins so a center crop still shows both.",
    `Story beat for this friendship: ${scene}.`,
    richness,
    chemistry,
    moodLine,
    "Lighting: cinematic studio rim light — teal (#22C5A9) on one side of the pair and violet-purple (#7752F8) on the other, fading into a near-black to deep indigo background. A single faint glowing soundwave or pulse line may appear as a music hint — no microphones, headphones logos, or readable text unless the scene specifically calls for generic dark headphones as a prop silhouette.",
    "Fine painterly grain, soft cinematic contrast, confident and warm. Absolutely no text, letters, logos, watermarks, or captions.",
  ].join(" ");
}

async function fetchArtistAvatarUrl(userId) {
  const r = await selectFromTable(
    `profiles?user_id=eq.${encodeURIComponent(userId)}&select=artist_avatar&limit=1`,
  );
  if (!r.ok || !Array.isArray(r.data) || !r.data[0]) return "";
  return String(r.data[0].artist_avatar || "").trim();
}

/** Turn a stored artist_avatar (data URL or hosted URL) into a Gemini inline image part. */
async function resolveReferenceImage(raw) {
  const src = String(raw || "").trim();
  if (!src) return null;

  if (src.startsWith("data:")) {
    const m = DATA_URL_RE.exec(src);
    if (!m) return null;
    const mime = m[1].toLowerCase() === "image/jpg" ? "image/jpeg" : m[1].toLowerCase();
    const data = m[2];
    const bytes = Math.ceil((data.length * 3) / 4);
    if (bytes < 2000 || bytes > MAX_REF_BYTES) return null;
    return { mime, data };
  }

  if (!/^https?:\/\//i.test(src)) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 18000);
    const r = await fetch(src, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    const mimeRaw = String(r.headers.get("content-type") || "image/jpeg").split(";")[0].trim().toLowerCase();
    const mime = mimeRaw === "image/jpg" ? "image/jpeg" : mimeRaw;
    if (!/^image\/(jpeg|png|webp)$/.test(mime)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 2000 || buf.length > MAX_REF_BYTES) return null;
    return { mime, data: buf.toString("base64") };
  } catch {
    return null;
  }
}

/**
 * Image-conditioned duo cover — same Gemini stack as Artist Avatar, square 1:1.
 * Kept here (not in gemini-cover-image) so abstract text-only covers stay untouched.
 */
async function tryGeminiDuoStoryCover({ prompt, referenceImages, timeoutMs = 55000 }) {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  if (!geminiKey) return { ok: false, error: "no_gemini_key" };
  if (!Array.isArray(referenceImages) || referenceImages.length < 2) {
    return { ok: false, error: "need_two_references" };
  }

  const imageParts = referenceImages.map((img) => ({
    inlineData: { mimeType: img.mime, data: img.data },
  }));
  const contents = [{ role: "user", parts: [...imageParts, { text: prompt }] }];
  const variants = [
    { contents, generationConfig: { responseModalities: ["TEXT", "IMAGE"], responseFormat: { image: { aspectRatio: "1:1", imageSize: "1K" } } } },
    { contents, generationConfig: { responseModalities: ["TEXT", "IMAGE"] } },
    { contents },
    { contents, generationConfig: { responseModalities: ["IMAGE"] } },
  ];

  const discovered = await listGeminiGenerateModels(geminiKey);
  const models = pickGeminiImageModels(discovered);
  if (!models.length) return { ok: false, error: "no_image_models" };

  const ms = Math.max(8000, Number(timeoutMs) || 55000);
  let lastError = "unknown";
  for (const model of models) {
    for (const apiVersion of ["v1beta", "v1"]) {
      for (const body of variants) {
        const res = await postGeminiGenerateContent({
          geminiKey,
          model,
          apiVersion,
          body,
          timeoutMs: ms,
        });
        if (!res.ok) {
          lastError = geminiFailureReason(res.payload, res.status, res.text);
          continue;
        }
        const imagePart = extractGeminiImagePart(res.payload);
        if (!imagePart?.data) {
          lastError = geminiFailureReason(res.payload, res.status, res.text) || "empty_image";
          continue;
        }
        const buf = Buffer.from(imagePart.data, "base64");
        if (buf.length < 512) {
          lastError = "tiny_image";
          continue;
        }
        return { ok: true, buf, mime: imagePart.mime || "image/png", model: `${apiVersion}/${model}` };
      }
    }
  }
  return { ok: false, error: String(lastError).slice(0, 280) };
}

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });

  const auth = await verifyUser(req);
  if (!auth?.userId) return sendJson(res, 401, { error: "Sign in required" });

  const meId = String(auth.userId).toLowerCase();
  const otherId = cleanUserId(req.query?.userId || req.query?.user_id);
  if (!otherId) return sendJson(res, 400, { error: "Missing or invalid userId" });
  if (otherId === meId) return sendJson(res, 400, { error: "Can't build this with yourself" });

  const stats = await computeOurMusicStats(meId, otherId);
  const pairKey = [meId, otherId].sort().join(":");

  // Ordered A/B so Image 1 / Image 2 stay stable for the same pair.
  const [idA, idB] = [meId, otherId].sort();
  const [urlA, urlB] = await Promise.all([fetchArtistAvatarUrl(idA), fetchArtistAvatarUrl(idB)]);
  if (!urlA || !urlB) {
    return sendJson(res, 200, {
      ok: false,
      skipped: true,
      reason: "need_both_avatars",
      tier: stats.tier,
      tierLabel: stats.tierLabel,
    });
  }

  const [refA, refB] = await Promise.all([resolveReferenceImage(urlA), resolveReferenceImage(urlB)]);
  if (!refA || !refB) {
    return sendJson(res, 200, {
      ok: false,
      skipped: true,
      reason: "avatar_unreadable",
      tier: stats.tier,
      tierLabel: stats.tierLabel,
    });
  }

  const prompt = buildDuoStoryPrompt({
    tags: stats.sharedTags,
    tier: stats.tier,
    matchPct: stats.matchPct,
    pairKey,
  });

  const gem = await tryGeminiDuoStoryCover({
    prompt,
    referenceImages: [refA, refB],
  });

  if (!gem.ok) {
    queueLogProviderUsage({
      provider: "gemini",
      kind: "cover_image",
      userId: meId,
      ref: `our_music_duo:${pairKey}`,
      status: "failed",
    });
    return sendJson(res, 502, { ok: false, error: gem.error || "gemini_failed" });
  }

  queueLogProviderUsage({
    provider: "gemini",
    kind: "cover_image",
    userId: meId,
    ref: `our_music_duo:${pairKey}`,
  });

  return sendJson(res, 200, {
    ok: true,
    mode: "duo_story",
    dataUrl: `data:${gem.mime || "image/png"};base64,${gem.buf.toString("base64")}`,
    model: gem.model || "",
    tier: stats.tier,
    tierLabel: stats.tierLabel,
  });
};
