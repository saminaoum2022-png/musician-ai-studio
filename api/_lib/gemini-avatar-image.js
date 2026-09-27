/**
 * "Nabad Artist Avatar" — image-conditioned Gemini generation.
 *
 * Unlike cover art (text-only prompt, no reference), this sends 3-5 of the
 * user's own uploaded photos as inline image parts alongside a fixed house-
 * style text prompt, so the model has an actual likeness to draw from
 * (Gemini's flash-image ("Nano Banana") models support multi-image input
 * for exactly this — consistent-subject / identity-preserving generation).
 *
 * Deliberately Gemini-only, same as our-music-cover.js: no Pollinations/
 * Cloudflare fallback, since neither takes reference images the same way
 * and a stylistically-inconsistent fallback would be worse than failing.
 */

const {
  listGeminiGenerateModels,
  pickGeminiImageModels,
  postGeminiGenerateContent,
  extractGeminiImagePart,
  geminiFailureReason,
} = require("./gemini-cover-image");

/**
 * The house style — every generated avatar, for every user, follows this
 * exact recipe so a wall of Artist Avatars reads as "one family" rather
 * than random AI art. Semi-realistic painterly portrait (not photoreal,
 * not Bitmoji/cartoon), brand-colored rim light, no literal music props
 * (mic/headphones) — a faint soundwave line in the light stands in for
 * that instead, per the "music-related but no mic" call on placement.
 */
const HOUSE_STYLE = [
  "Using the attached reference photos of one person's face, create a single semi-realistic painterly digital-illustration portrait of that same person — preserve their real likeness, skin tone, hair, and facial structure faithfully, just rendered in a refined illustrated style, not a photograph and not a cartoon or emoji-style avatar.",
  "Crop from the chest up, shoulders relaxed, plain dark contemporary top with no visible logos or patterns.",
  "Strict square 1:1 canvas. This will later be cropped into BOTH a circular profile photo and a tall rectangular cover cutout, so composition must survive either crop: keep the whole head with clear empty space above the hair (do not let hair or forehead touch the top edge), keep both shoulders fully visible with room to spare below, and keep even margins on the left and right — the face should fill roughly 45-55% of the frame height, centered, never a tight zoomed-in close-up that fills the edges.",
  "Lighting: cinematic studio rim light — a violet-purple (#7752F8) rim light on one side of the face and a teal (#22C5A9) rim light on the other, both fading softly into a near-black to deep indigo gradient background with no scenery, props, or text.",
  "A single faint glowing soundwave line traces along the edge of the rim light, barely visible, the only hint that this is a music artist portrait — no literal microphone, headphones, or instruments anywhere in frame.",
  "Fine painterly grain, soft cinematic contrast, confident and warm mood. Absolutely no text, letters, logos, watermarks, or captions anywhere in the image.",
].join(" ");

/** Three pose/mood variants of the same house style, so "3 options" are
 *  actually 3 different portraits of the same person, not 3 near-duplicates. */
const VARIANTS = [
  "Pose: facing the camera directly, calm and confident expression, minimal head tilt, direct eye contact.",
  "Pose: three-quarter turn, chin very slightly lifted, a subtle knowing half-smile.",
  "Pose: looking slightly upward and just off-camera, introspective mood, a little more hair movement catching the rim light.",
];

function buildArtistAvatarPrompt(variantIndex) {
  const variant = VARIANTS[((variantIndex % VARIANTS.length) + VARIANTS.length) % VARIANTS.length];
  return `${HOUSE_STYLE} ${variant}`;
}

function buildAvatarRequestVariants(prompt, referenceImages) {
  const imageParts = referenceImages.map((img) => ({
    inlineData: { mimeType: img.mime, data: img.data },
  }));
  const contents = [{ role: "user", parts: [...imageParts, { text: prompt }] }];
  return [
    // Explicit square aspect ratio first — the text instruction alone was letting the
    // model return a tighter/taller crop than asked, which then got cover-cropped into
    // the profile hero and cut off foreheads/chins. Falls back to plain requests if the
    // model/API version doesn't support responseFormat.
    { contents, generationConfig: { responseModalities: ["TEXT", "IMAGE"], responseFormat: { image: { aspectRatio: "1:1", imageSize: "1K" } } } },
    { contents, generationConfig: { responseModalities: ["TEXT", "IMAGE"] } },
    { contents },
    { contents, generationConfig: { responseModalities: ["IMAGE"] } },
  ];
}

/**
 * @param {{ referenceImages: {mime:string, data:string}[], variantIndex: number, timeoutMs?: number }} opts
 * @returns {Promise<{ ok: boolean, buf?: Buffer, mime?: string, model?: string, error?: string }>}
 */
async function tryGeminiArtistAvatar(opts = {}) {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  if (!geminiKey) return { ok: false, error: "no_gemini_key" };

  const referenceImages = Array.isArray(opts.referenceImages) ? opts.referenceImages : [];
  if (!referenceImages.length) return { ok: false, error: "no_reference_images" };

  const prompt = buildArtistAvatarPrompt(Number(opts.variantIndex) || 0);
  const timeoutMs = Math.max(8000, Number(opts.timeoutMs) || 55000);

  const discovered = await listGeminiGenerateModels(geminiKey);
  const models = pickGeminiImageModels(discovered);
  if (!models.length) return { ok: false, error: "no_image_models" };

  const variants = buildAvatarRequestVariants(prompt, referenceImages);
  const apiVersions = ["v1beta", "v1"];
  let lastError = "unknown";

  for (const model of models) {
    for (const apiVersion of apiVersions) {
      for (const body of variants) {
        const res = await postGeminiGenerateContent({ geminiKey, model, apiVersion, body, timeoutMs });
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

module.exports = { tryGeminiArtistAvatar, buildArtistAvatarPrompt };
