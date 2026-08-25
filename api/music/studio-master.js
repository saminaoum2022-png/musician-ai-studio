/**
 * Studio Pro Master — RoEx mastering for NabadAi Studio (provider-neutral path).
 *
 * POST /api/music/studio-master
 *   { action: "upload-url", filename?, contentType? }
 *   { action: "preview", trackUrl, finish? }
 *   { action: "poll-preview", masteringTaskId }
 *   { action: "finalize", masteringTaskId, stripeSessionId?, iapTransactionId? }
 *
 * Pro subscribers only. Preview is free; final retrieve costs RoEx credits after payment.
 */
const crypto = require("crypto");
const { verifyUser, sendJson, readJsonBody, isAdminEmail } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");
const { fetchProSubscriptionForUser } = require("../_lib/pro-subscription");
const { requireProForWebApi } = require("../_lib/pro-web-gate");
const {
  STUDIO_PRO_MASTER_PRODUCT_ID,
  STUDIO_PRO_MASTER_EVENT,
} = require("../_lib/billing-config");
const {
  verifyStudioMasterStripeSession,
  verifyStudioMasterIapTransaction,
  recordStudioMasterPayment,
  hasStudioMasterPayment,
  markStudioMasterRedeemed,
} = require("../_lib/studio-master-billing");
const {
  roexConfigured,
  getUploadUrls,
  uploadBufferToRoex,
  createMasteringPreview,
  pollPreviewMaster,
  retrieveFinalMaster,
  downloadRoexAudio,
} = require("../_lib/roex-upstream");

function signingSecret() {
  return String(process.env.STUDIO_MASTER_SIGNING_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}

function signJobToken(payload) {
  const secret = signingSecret();
  if (!secret) return "";
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyJobToken(token, expected) {
  const secret = signingSecret();
  const raw = String(token || "").trim();
  if (!secret || !raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expectedSig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (sig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (expected?.userId && payload.userId !== expected.userId) return null;
    if (expected?.masteringTaskId && payload.masteringTaskId !== expected.masteringTaskId) return null;
    if (payload.exp && Date.now() > Number(payload.exp)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function requireStudioPro(user, req) {
  const proGate = await requireProForWebApi(req, user.userId);
  if (!proGate.ok) return proGate;
  const pro = await fetchProSubscriptionForUser(user.userId);
  if (pro?.active) return { ok: true };
  return {
    ok: false,
    status: 403,
    error: "NabadAi Pro is required for Pro Master.",
    code: "pro_required",
  };
}

async function paymentVerified({ user, masteringTaskId, stripeSessionId, iapTransactionId }) {
  if (isAdminEmail(user.email) && String(process.env.STUDIO_MASTER_ADMIN_BYPASS || "").trim() === "1") {
    return { ok: true, source: "admin_bypass" };
  }
  if (String(process.env.STUDIO_MASTER_DEV_SKIP_PAYMENT || "").trim() === "1") {
    return { ok: true, source: "dev_skip" };
  }

  const taskId = String(masteringTaskId || "").trim();
  if (await hasStudioMasterPayment(user.userId, taskId)) {
    return { ok: true, source: "recorded" };
  }

  const stripeId = String(stripeSessionId || "").trim();
  if (stripeId) {
    const v = await verifyStudioMasterStripeSession({
      sessionId: stripeId,
      userId: user.userId,
      masteringTaskId: taskId,
    });
    if (v.ok) {
      await recordStudioMasterPayment({
        userId: user.userId,
        masteringTaskId: taskId,
        provider: "stripe",
        externalId: stripeId,
      });
      return { ok: true, source: "stripe" };
    }
    return v;
  }

  const txId = String(iapTransactionId || "").trim();
  if (txId) {
    const v = await verifyStudioMasterIapTransaction({
      userId: user.userId,
      transactionId: txId,
      masteringTaskId: taskId,
    });
    if (v.ok) {
      await recordStudioMasterPayment({
        userId: user.userId,
        masteringTaskId: taskId,
        provider: "revenuecat",
        externalId: txId,
      });
      return { ok: true, source: "iap" };
    }
    return v;
  }

  return {
    ok: false,
    status: 402,
    error: "Payment required — unlock Pro Master for $3.99.",
    code: "payment_required",
    priceUsd: 3.99,
    productId: STUDIO_PRO_MASTER_PRODUCT_ID,
  };
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  if (!roexConfigured()) {
    return sendJson(res, 503, {
      error: "Pro Master is not configured yet.",
      code: "roex_not_configured",
    });
  }

  const user = await verifyUser(req);
  if (!user) return sendJson(res, 401, { error: "Sign in to use Pro Master." });

  const proCheck = await requireStudioPro(user, req);
  if (!proCheck.ok) {
    return sendJson(res, proCheck.status || 403, {
      error: proCheck.error,
      code: proCheck.code || "pro_required",
    });
  }

  const body = await readJsonBody(req);
  const action = String(body?.action || "").trim().toLowerCase();

  try {
    if (action === "upload-url") {
      const up = await getUploadUrls({
        filename: body?.filename,
        contentType: body?.contentType || "audio/wav",
      });
      if (!up.ok) return sendJson(res, up.status || 502, { error: up.error, code: up.code });
      return sendJson(res, 200, {
        ok: true,
        signedUrl: up.signedUrl,
        readableUrl: up.readableUrl,
      });
    }

    if (action === "upload-mix") {
      const b64 = String(body?.audioBase64 || "").trim();
      if (!b64) return sendJson(res, 400, { error: "Missing audio data.", code: "missing_audio" });
      const buf = Buffer.from(b64, "base64");
      const maxBytes = 3.5 * 1024 * 1024;
      if (!buf.length) return sendJson(res, 400, { error: "Empty audio upload.", code: "empty_audio" });
      if (buf.length > maxBytes) {
        return sendJson(res, 413, {
          error: "Mix is too large for Pro Master right now — try a shorter take or use local finish.",
          code: "audio_too_large",
        });
      }
      const contentType = String(body?.contentType || "audio/wav").trim() || "audio/wav";
      const up = await uploadBufferToRoex({
        buffer: buf,
        filename: body?.filename || "studio-mix.wav",
        contentType,
      });
      if (!up.ok) return sendJson(res, up.status || 502, { error: up.error, code: up.code });
      return sendJson(res, 200, { ok: true, readableUrl: up.readableUrl });
    }

    if (action === "preview") {
      const trackUrl = String(body?.trackUrl || "").trim();
      const finish = String(body?.finish || "balanced").trim();
      const created = await createMasteringPreview({ trackUrl, finishId: finish });
      if (!created.ok) {
        return sendJson(res, created.status || 502, { error: created.error, code: created.code });
      }

      const polled = await pollPreviewMaster(created.masteringTaskId);
      if (!polled.ok) {
        return sendJson(res, polled.status || 502, {
          error: polled.error,
          code: polled.code,
          masteringTaskId: created.masteringTaskId,
          pending: Boolean(polled.pending),
        });
      }

      const exp = Date.now() + 2 * 60 * 60 * 1000;
      const jobToken = signJobToken({
        userId: user.userId,
        masteringTaskId: created.masteringTaskId,
        finish,
        exp,
      });

      return sendJson(res, 200, {
        ok: true,
        masteringTaskId: created.masteringTaskId,
        previewUrl: polled.downloadUrl,
        previewStartTime: polled.previewStartTime,
        finish,
        jobToken,
        priceUsd: 3.99,
        productId: STUDIO_PRO_MASTER_PRODUCT_ID,
      });
    }

    if (action === "poll-preview") {
      const masteringTaskId = String(body?.masteringTaskId || "").trim();
      const polled = await pollPreviewMaster(masteringTaskId, { attempts: 1, delayMs: 0 });
      if (!polled.ok) {
        return sendJson(res, polled.status || 502, {
          error: polled.error,
          code: polled.code,
          pending: Boolean(polled.pending),
        });
      }
      return sendJson(res, 200, {
        ok: true,
        masteringTaskId,
        previewUrl: polled.downloadUrl,
        previewStartTime: polled.previewStartTime,
      });
    }

    if (action === "finalize") {
      const masteringTaskId = String(body?.masteringTaskId || "").trim();
      const jobToken = String(body?.jobToken || "").trim();
      if (!masteringTaskId) return sendJson(res, 400, { error: "Missing mastering task id." });

      const tokenOk = verifyJobToken(jobToken, { userId: user.userId, masteringTaskId });
      if (!tokenOk && !isAdminEmail(user.email)) {
        return sendJson(res, 403, { error: "Invalid or expired Pro Master session.", code: "invalid_job_token" });
      }

      const paid = await paymentVerified({
        user,
        masteringTaskId,
        stripeSessionId: body?.stripeSessionId,
        iapTransactionId: body?.iapTransactionId,
      });
      if (!paid.ok) {
        return sendJson(res, paid.status || 402, {
          error: paid.error,
          code: paid.code,
          priceUsd: paid.priceUsd,
          productId: paid.productId,
        });
      }

      const finalRes = await retrieveFinalMaster(masteringTaskId);
      if (!finalRes.ok) {
        return sendJson(res, finalRes.status || 502, { error: finalRes.error, code: finalRes.code });
      }

      const dl = await downloadRoexAudio(finalRes.downloadUrl);
      if (!dl.ok) return sendJson(res, dl.status || 502, { error: dl.error });

      await markStudioMasterRedeemed({
        userId: user.userId,
        masteringTaskId,
        provider: paid.source,
      });

      return sendJson(res, 200, {
        ok: true,
        masteringTaskId,
        audioBase64: dl.buffer.toString("base64"),
        contentType: dl.contentType || "audio/wav",
        paymentSource: paid.source,
      });
    }

    return sendJson(res, 400, { error: "Unknown action.", code: "unknown_action" });
  } catch (e) {
    console.warn("[music/studio-master]", action, e?.message || e);
    return sendJson(res, 500, { error: e?.message || "Pro Master failed" });
  }
};
