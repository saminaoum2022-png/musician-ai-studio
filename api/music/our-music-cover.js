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
 * Deliberately does NOT fall back to Pollinations/Cloudflare on failure: the
 * caller keeps the gradient placeholder instead.
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

/** How the cover's composition itself grows richer/more elaborate the longer a
 *  pair has stayed in sync — this is the visual payoff for the streak, distinct
 *  from the mood/genre words below. */
const TIER_VISUALS = {
  spark: "Two soft, faint light trails just beginning to reach toward each other — delicate, minimal, plenty of dark negative space, like the very start of something.",
  glow: "Two warm light trails, now brighter and closely interwoven, richer color saturation and a steady, confident warmth.",
  constellation: "The two intertwined light trails are surrounded by small scattered points of light like a constellation forming around them — a more intricate, layered composition with a sense of accumulated history.",
  aurora: "The two light trails have grown into full, flowing aurora-like bands of color sweeping across the frame — the most elaborate and radiant version, deep and textured, like a long friendship rendered in light.",
};

function buildOurMusicCoverPrompt({ tags, tier, matchPct }) {
  const moodLine = tags.length
    ? `Inspired by these shared musical moods/genres: ${tags.join(", ")}.`
    : "Inspired by two friends who share a warm, personal music taste.";
  const tierLine = TIER_VISUALS[tier] || TIER_VISUALS.spark;
  const pct = Math.max(0, Math.min(100, Number(matchPct) || 0));
  const matchLine = pct >= 70
    ? "Their two light trails move in near mirror unison, matching closely in shape, color, and rhythm."
    : pct <= 25
      ? "Their two light trails contrast sharply in color and rhythm, yet still curve toward and lean into each other."
      : "Their two light trails differ in color and rhythm but blend smoothly wherever they meet.";
  return [
    "Abstract album cover art for a private two-person friendship playlist.",
    moodLine,
    tierLine,
    matchLine,
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
  const prompt = buildOurMusicCoverPrompt({ tags: stats.sharedTags, tier: stats.tier, matchPct: stats.matchPct });
  const pairKey = [meId, otherId].sort().join(":");

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
