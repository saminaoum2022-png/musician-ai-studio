/**
 * POST /api/gifts/send
 * Body: { targetKind: "song"|"status", targetId, amount: 1|3|5, recipientUserId? }
 *
 * Paid + promo credits can be gifted (testing). gift_balance is never sent.
 * Recipient receives gift_balance (create-only, not re-giftable).
 */
const {
  verifyUser,
  callRpc,
  selectFromTable,
  sendJson,
  setCors,
  readJsonBody,
} = require("../_lib/credits-auth");
const { notifyGiftReceived } = require("../_lib/gift-notifications");

const ALLOWED = new Set([1, 3, 5]);

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user) return sendJson(res, 401, { error: "Sign in to send a gift." });

  let body = {};
  try {
    body = (await readJsonBody(req)) || {};
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body." });
  }

  const targetKind = String(body?.targetKind || body?.target_kind || "").trim();
  const targetId = String(body?.targetId || body?.target_id || "").trim();
  const amount = Number(body?.amount);
  let recipientUserId = String(body?.recipientUserId || body?.recipient_user_id || "").trim();

  if (!targetId || !ALLOWED.has(amount)) {
    return sendJson(res, 400, { error: "Choose 1, 3, or 5 credits for a published post." });
  }

  let targetTitle = "";
  let targetArtUrl = "";

  if (targetKind === "song") {
    const songRes = await selectFromTable(
      `user_songs?select=id,user_id,title,art_url,public_on_profile&id=eq.${encodeURIComponent(targetId)}&limit=1`,
    );
    const song = Array.isArray(songRes.data) ? songRes.data[0] : null;
    if (!song?.id) return sendJson(res, 404, { error: "Song not found." });
    if (song.public_on_profile !== true) {
      return sendJson(res, 400, { error: "Gifts are only for published posts." });
    }
    recipientUserId = String(song.user_id || recipientUserId || "").trim();
    targetTitle = String(song.title || "").trim();
    targetArtUrl = String(song.art_url || "").trim();
    if (!recipientUserId) return sendJson(res, 400, { error: "Missing recipient." });
    if (recipientUserId === user.userId) {
      return sendJson(res, 400, { error: "You cannot gift your own post." });
    }
  } else if (targetKind === "status") {
    if (!recipientUserId) return sendJson(res, 400, { error: "Missing recipient." });
    if (recipientUserId === user.userId) {
      return sendJson(res, 400, { error: "You cannot gift yourself." });
    }
  } else {
    return sendJson(res, 400, { error: "Invalid target kind." });
  }

  const rpc = await callRpc("send_gift", {
    p_sender_id: user.userId,
    p_recipient_id: recipientUserId,
    p_target_kind: targetKind,
    p_target_id: targetId,
    p_amount: amount,
  });

  if (rpc.skipped || rpc.status === 404) {
    return sendJson(res, 503, {
      error: "Gifts are not enabled yet — run supabase/gifts.sql in Supabase.",
      code: "gifts_not_migrated",
    });
  }

  const out = rpc.data || {};
  if (!rpc.ok || out.ok === false) {
    const status =
      out.status === "insufficient_giftable" || out.status === "insufficient_paid" ? 402 :
      out.status === "rate_limited" ? 429 :
      400;
    return sendJson(res, status, {
      error: out.message || "Could not send gift.",
      code: out.status || "gift_failed",
      paidBalance: out.paid_balance,
      giftable: out.giftable,
    });
  }

  // Must await — Vercel kills the lambda after the response; fire-and-forget never ran.
  try {
    const notified = await notifyGiftReceived({
      giftId: out.gift_id || out.giftId,
      senderUserId: user.userId,
      recipientUserId,
      amount: out.amount || amount,
      targetKind,
      targetId,
      targetTitle,
      targetArtUrl,
    });
    if (!notified) {
      console.warn("[gift] notification not created", {
        giftId: out.gift_id || out.giftId,
        recipientUserId,
      });
    }
  } catch (e) {
    console.warn("[gift] notify failed", e?.message || e);
  }

  return sendJson(res, 200, {
    ok: true,
    giftId: out.gift_id,
    amount: out.amount,
    balance: out.sender_balance,
    paidBalance: out.sender_paid_balance,
  });
};
