/**
 * "Our Music Together" album cover — Gemini only, no Pollinations/Cloudflare fallback.
 *
 * GET /api/music/our-music-cover?userId=<other user's id>&tags=tag1,tag2,...
 *
 * This is a small, low-frequency, cosmetic image (one per friend pair) — the client
 * caches the result (see ourMusicCoverCacheKey in src/app.js) so this only runs once
 * per pair until their shared tags change. Deliberately does NOT fall back to
 * Pollinations/Cloudflare on failure: the caller keeps the gradient placeholder instead.
 */

const { applyCors } = require("../_lib/cors");
const { verifyUser, sendJson } = require("../_lib/credits-auth");
const { tryGeminiCoverImage } = require("../_lib/gemini-cover-image");
const { queueLogProviderUsage } = require("../_lib/provider-usage-log");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TAGS = 6;
const MAX_TAG_LEN = 28;

function cleanUserId(v) {
  const s = String(v || "").trim().toLowerCase();
  return UUID_RE.test(s) ? s : "";
}

function cleanTags(raw) {
  const parts = String(raw || "")
    .split(",")
    .map((t) => t.replace(/[^a-zA-Z0-9\u0600-\u06FF\s'-]/g, "").trim())
    .filter(Boolean)
    .slice(0, MAX_TAGS)
    .map((t) => t.slice(0, MAX_TAG_LEN));
  return [...new Set(parts)];
}

function buildOurMusicCoverPrompt(tags) {
  const moodLine = tags.length
    ? `Inspired by these shared musical moods/genres: ${tags.join(", ")}.`
    : "Inspired by two friends who share a warm, personal music taste.";
  return [
    "Abstract album cover art for a private two-person friendship playlist.",
    moodLine,
    "Two soft intertwined light trails or soundwave ribbons in warm, complementary colors,",
    "gently overlapping to suggest two people in sync — dreamy, atmospheric, painterly light and color grain.",
    "Cinematic, intimate, warm mood lighting, no harsh edges.",
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

  const tags = cleanTags(req.query?.tags);
  const prompt = buildOurMusicCoverPrompt(tags);
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
  });
};
