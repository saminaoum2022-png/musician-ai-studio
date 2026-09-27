/**
 * "Our Music Together" album cover — Gemini only, no Pollinations/Cloudflare fallback.
 *
 * GET /api/music/our-music-cover?userId=<other user's id>
 *
 * This is a small, low-frequency, cosmetic image (one per friend pair, per "tier") —
 * the client caches the result (see OUR_MUSIC_COVER_CACHE_PREFIX in src/app.js) so
 * this only re-runs when their shared tags change OR they cross a new tier. The
 * tier — and every other number that shapes the prompt — is recomputed here from
 * real listen_sessions rows via computeOurMusicStats(), never trusted from the
 * client, since it's the whole "stay in sync, the cover grows with you" hook.
 *
 * Two layers make each pair's cover actually distinct instead of "the same image,
 * recolored": (1) a VISUAL_CONCEPT deterministically picked per pair — one friendship
 * always gets vinyl records, another always gets soundwave mountains, etc. — and
 * (2) a TIER_RICHNESS layer on top that makes that same concept grow more elaborate
 * the longer they stay in sync. Deliberately does NOT fall back to Pollinations/
 * Cloudflare on failure: the caller keeps the gradient placeholder instead.
 */

const { applyCors } = require("../_lib/cors");
const { verifyUser, sendJson } = require("../_lib/credits-auth");
const { tryGeminiCoverImage } = require("../_lib/gemini-cover-image");
const { queueLogProviderUsage } = require("../_lib/provider-usage-log");
const { computeOurMusicStats } = require("../_lib/our-music-stats");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanUserId(v) {
  const s = String(v || "").trim().toLowerCase();
  return UUID_RE.test(s) ? s : "";
}

/** Deterministic per-pair hash — same pair always gets the same concept below,
 *  different pairs land on different concepts, no state to store. */
function hashPairKey(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** The actual subject of the cover — this is what was missing before: every pair
 *  got "two light trails" forever, just recolored. Now each pair is deterministically
 *  assigned one of these as ITS visual identity (stable across regens), so two
 *  different friendships never look like the same image with a different tint. */
const VISUAL_CONCEPTS = [
  "two long ribbons of light spiraling gently around each other",
  "two overlapping vinyl records mid-spin, their grooves glowing like soundwaves",
  "a pair of soundwave mountains rising from a shared horizon, their peaks overlapping",
  "two trails of floating light-particles converging into a shared constellation shape",
  "two ribbons of color unraveling from opposite corners of the frame and knotting together at the center",
  "a pair of glowing thread-like paths weaving through a soft night sky, crossing at several points",
  "two overlapping beams of prism light refracting into a shared pool of color at the center",
  "two floating cassette-tape ribbons twisting into a single braid of light",
  "a pair of orbiting light rings circling closer together toward a shared center point",
  "two rivers of color flowing from opposite edges of the frame, merging into one current in the middle",
];

function pickOurMusicConcept(pairKey) {
  return VISUAL_CONCEPTS[hashPairKey(pairKey) % VISUAL_CONCEPTS.length];
}

/** How richly-rendered the concept is — this is the tier payoff (grows with time
 *  in sync), kept generic so it layers onto ANY concept above, not just one subject. */
const TIER_RICHNESS = {
  spark: "Keep it minimal and delicate — faint, with plenty of dark negative space, like the very start of something.",
  glow: "Render it brighter and more tightly composed, with richer color saturation and a steady, confident warmth.",
  constellation: "Scatter small points of light around the scene, like a constellation forming — a more intricate, layered composition with a sense of accumulated history.",
  aurora: "Make it the most elaborate and radiant version — full, flowing, and richly textured, like a long friendship rendered in light.",
};

function buildOurMusicCoverPrompt({ tags, tier, matchPct, pairKey }) {
  const concept = pickOurMusicConcept(pairKey);
  const moodLine = tags.length
    ? `Inspired by these shared musical moods/genres: ${tags.join(", ")}.`
    : "Inspired by two friends who share a warm, personal music taste.";
  const richness = TIER_RICHNESS[tier] || TIER_RICHNESS.spark;
  const pct = Math.max(0, Math.min(100, Number(matchPct) || 0));
  const matchLine = pct >= 70
    ? `The two halves of the scene move in near mirror unison — matching closely in shape, color, and rhythm.`
    : pct <= 25
      ? `The two halves of the scene contrast sharply in color and rhythm, yet still lean toward each other.`
      : `The two halves of the scene differ in color and rhythm but blend smoothly wherever they meet.`;
  return [
    "Abstract album cover art for a private two-person friendship playlist.",
    `The central image is ${concept}.`,
    moodLine,
    matchLine,
    richness,
    "Dreamy, atmospheric, painterly light and color grain, cinematic and intimate, warm mood lighting, no harsh edges.",
  ].join(" ");
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
  const prompt = buildOurMusicCoverPrompt({ tags: stats.sharedTags, tier: stats.tier, matchPct: stats.matchPct, pairKey });

  const gem = await tryGeminiCoverImage({ prompt, allowHumans: false });
  if (!gem.ok) {
    queueLogProviderUsage({ provider: "gemini", kind: "cover_image", userId: meId, ref: `our_music:${pairKey}`, status: "failed" });
    return sendJson(res, 502, { ok: false, error: gem.error || "gemini_failed" });
  }

  queueLogProviderUsage({ provider: "gemini", kind: "cover_image", userId: meId, ref: `our_music:${pairKey}` });

  return sendJson(res, 200, {
    ok: true,
    dataUrl: `data:${gem.mime || "image/png"};base64,${gem.buf.toString("base64")}`,
    model: gem.model || "",
    tier: stats.tier,
    tierLabel: stats.tierLabel,
  });
};
