/**
 * Suno API proxy: Generate full songs (2 variations).
 *
 * Env:
 * - SUNO_API_KEY
 * - SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *   (used by ../_lib/credits-auth to verify the user and debit credits)
 *
 * Credit handling:
 *  - Debits FULL_SONG_COST (10 credits) BEFORE calling Suno.
 *  - Refunds the full amount if Suno rejects the request synchronously.
 *  - Per-task callback failures are NOT auto-refunded here (the response
 *    from Suno was 200 — the song could still arrive). We rely on the
 *    /api/suno/callback path or admin tooling to refund those.
 */

const {
  verifyUser,
  callRpc,
  sendJson,
} = require("../_lib/credits-auth");

const FULL_SONG_COST = 12;

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const apiKey = process.env.SUNO_API_KEY;
    if (!apiKey) return json(res, 500, { error: "Missing SUNO_API_KEY on server" });

    const user = await verifyUser(req);
    if (!user) {
      return json(res, 401, { error: "Sign in to generate songs." });
    }

    const debit = await callRpc("consume_credits", {
      p_user_id: user.userId,
      p_amount: FULL_SONG_COST,
      p_reason: "full_song",
      p_ref: "",
    });
    if (!debit.ok || !debit.data?.ok) {
      const status = String(debit.data?.status || "");
      if (status === "insufficient") {
        return json(res, 402, {
          error: "Not enough credits",
          code: "insufficient_credits",
          balance: Number(debit.data?.balance || 0),
          needed: FULL_SONG_COST,
          message: debit.data?.message || "Not enough credits. Redeem a code from your Profile.",
        });
      }
      return json(res, 500, {
        error: "Credit check failed",
        details: debit.data || debit.error || null,
      });
    }
    const balanceAfterDebit = Number(debit.data?.balance || 0);

    const body = await readJson(req);
    const {
      prompt = "",
      style = "",
      instruments = "",
      songKey = "",
      voiceTimbre = "",
      title = "",
      customMode = true,
      instrumental = false,
      model = "V5_5",
      negativeTags = "",
      vocalGender,
      styleWeight,
      weirdnessConstraint,
      personaId,
    } = body || {};

    const { host, proto } = getHostProto(req);
    const callBackUrl = `${proto}://${host}/api/suno/callback`;

    const styleBits = [String(style || "").trim()];
    if (songKey) styleBits.push(`Key: ${String(songKey).trim()}`);
    if (instruments) styleBits.push(`Instruments: ${String(instruments).trim()}`);
    if (voiceTimbre) styleBits.push(`Voice timbre: ${String(voiceTimbre).trim()}`);
    const mergedStyle = styleBits.filter(Boolean).join(", ");

    const payload = {
      customMode: Boolean(customMode),
      instrumental: Boolean(instrumental),
      callBackUrl,
      model: "V5_5",
      ...(prompt ? { prompt: String(prompt) } : {}),
      ...(mergedStyle ? { style: mergedStyle } : {}),
      ...(title ? { title: String(title) } : {}),
      ...(negativeTags ? { negativeTags: String(negativeTags) } : {}),
      ...(vocalGender === "m" || vocalGender === "f" ? { vocalGender } : {}),
      ...(personaId ? { personaId: String(personaId).trim() } : {}),
      ...(Number.isFinite(Number(styleWeight)) ? { styleWeight: clamp01(Number(styleWeight)) } : {}),
      ...(Number.isFinite(Number(weirdnessConstraint))
        ? { weirdnessConstraint: clamp01(Number(weirdnessConstraint)) }
        : {}),
    };

    const r = await fetch("https://api.sunoapi.org/api/v1/generate", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await r.text().catch(() => "");
    const data = safeJson(text);
    if (!r.ok) {
      await refund(user.userId, FULL_SONG_COST, "refund_full_song", "suno_http_error").catch(() => null);
      return json(res, 502, { error: "Upstream Suno error", status: r.status, details: data || text });
    }
    const sunoCode = data && typeof data === "object" && "code" in data ? Number(data.code) : 200;
    if (Number.isFinite(sunoCode) && sunoCode !== 200) {
      await refund(user.userId, FULL_SONG_COST, "refund_full_song", `suno_code_${sunoCode}`).catch(() => null);
      const msg = data?.msg || data?.message || data?.error || "Suno rejected request";
      return json(res, 502, { error: msg, details: data });
    }

    return json(res, 200, {
      ...(data || { raw: text }),
      _credits: {
        spent: FULL_SONG_COST,
        balance: balanceAfterDebit,
      },
    });
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
};

async function refund(userId, amount, reason, ref) {
  if (!userId || !amount) return;
  try {
    await callRpc("refund_credits", {
      p_user_id: userId,
      p_amount: amount,
      p_reason: reason,
      p_ref: ref || "",
    });
  } catch {}
}

function getHostProto(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const proto = req.headers["x-forwarded-proto"] || "https";
  return { host, proto };
}

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function safeJson(txt) {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
