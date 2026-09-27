/**
 * "Nabad Artist Avatar" generation — POST /api/music/artist-avatar-generate
 *
 * Body: { consent: true, photos: string[] } — 3-5 data-URL photos of the
 * user's own face. Runs 3 image-conditioned Gemini calls (see
 * gemini-avatar-image.js) and returns up to 3 stylized options; the user
 * picks one client-side and it's saved to profiles.artist_avatar the same
 * way the regular avatar photo is (direct client upsert — see
 * supabaseUpsertProfile in src/app.js). This endpoint only generates; it
 * never writes to the profile itself.
 *
 * Gemini-only, no fallback provider (see gemini-avatar-image.js for why).
 * One fixed credit charge for the whole 3-option batch; refunded in full
 * if all three attempts fail.
 */

const { applyCors } = require("../_lib/cors");
const { verifyUser, isAdminEmail, callRpc, sendJson, readJsonBody } = require("../_lib/credits-auth");
const { tryGeminiArtistAvatar } = require("../_lib/gemini-avatar-image");
const { queueLogProviderUsage } = require("../_lib/provider-usage-log");

const ARTIST_AVATAR_COST = 15;
const MIN_PHOTOS = 3;
const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 3_500_000; // decoded size per photo — keeps a 5-photo payload sane
const VARIANT_COUNT = 3;

const DATA_URL_RE = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([a-zA-Z0-9+/=]+)$/i;

function parsePhoto(raw) {
  const m = DATA_URL_RE.exec(String(raw || "").trim());
  if (!m) return null;
  const mime = m[1].toLowerCase() === "image/jpg" ? "image/jpeg" : m[1].toLowerCase();
  const data = m[2];
  const bytes = Math.ceil((data.length * 3) / 4);
  if (bytes < 2000 || bytes > MAX_PHOTO_BYTES) return null;
  return { mime, data };
}

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  const auth = await verifyUser(req);
  if (!auth?.userId) return sendJson(res, 401, { error: "Sign in required" });

  const body = await readJsonBody(req);
  if (!body?.consent) {
    return sendJson(res, 400, { error: "Consent is required before generating an avatar.", code: "consent_required" });
  }

  const rawPhotos = Array.isArray(body?.photos) ? body.photos.slice(0, MAX_PHOTOS + 2) : [];
  const referenceImages = rawPhotos.map(parsePhoto).filter(Boolean).slice(0, MAX_PHOTOS);
  if (referenceImages.length < MIN_PHOTOS) {
    return sendJson(res, 400, {
      error: `Add at least ${MIN_PHOTOS} clear photos of your face (JPEG/PNG/WebP).`,
      code: "not_enough_photos",
    });
  }

  const isAdmin = isAdminEmail(auth?.email);
  let balanceAfterDebit = null;
  if (!isAdmin) {
    const debit = await callRpc("consume_credits", {
      p_user_id: auth.userId,
      p_amount: ARTIST_AVATAR_COST,
      p_reason: "artist_avatar",
      p_ref: "artist_avatar_generate",
    });
    if (!debit.ok || !debit.data?.ok) {
      const status = String(debit.data?.status || "");
      if (status === "insufficient") {
        return sendJson(res, 402, {
          error: "Not enough credits",
          code: "insufficient_credits",
          balance: Number(debit.data?.balance || 0),
          needed: ARTIST_AVATAR_COST,
        });
      }
      return sendJson(res, 500, { error: "Credit check failed", details: debit.data || debit.error || null });
    }
    balanceAfterDebit = Number(debit.data?.balance || 0);
  }

  const options = [];
  let lastError = "generation_failed";
  for (let i = 0; i < VARIANT_COUNT; i++) {
    const r = await tryGeminiArtistAvatar({ referenceImages, variantIndex: i });
    if (r.ok) {
      options.push(`data:${r.mime};base64,${r.buf.toString("base64")}`);
      queueLogProviderUsage({ provider: "gemini", kind: "artist_avatar", userId: auth.userId, ref: `variant_${i}` });
    } else {
      lastError = r.error || lastError;
      queueLogProviderUsage({ provider: "gemini", kind: "artist_avatar", userId: auth.userId, ref: `variant_${i}`, status: "failed" });
    }
  }

  if (!options.length) {
    if (!isAdmin) {
      try {
        await callRpc("refund_credits", {
          p_user_id: auth.userId,
          p_amount: ARTIST_AVATAR_COST,
          p_reason: "artist_avatar_failed",
          p_ref: "artist_avatar_generate",
        });
      } catch {}
    }
    return sendJson(res, 502, { ok: false, error: lastError });
  }

  return sendJson(res, 200, { ok: true, options, balance: balanceAfterDebit, cost: isAdmin ? 0 : ARTIST_AVATAR_COST });
};
