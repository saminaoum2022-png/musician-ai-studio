/**
 * Suno API proxy: Generate full songs (2 variations).
 *
 * Env:
 * - SUNO_API_KEY
 * - SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *   (used by ../_lib/credits-auth to verify the user and debit credits)
 *
 * Credit handling:
 *  - Debits FULL_SONG_COST (12 credits) BEFORE calling Suno.
 *  - Refunds the full amount if Suno rejects the request synchronously.
 *  - Per-task callback failures are NOT auto-refunded here (the response
 *    from Suno was 200 — the song could still arrive). We rely on the
 *    /api/suno/callback path or admin tooling to refund those.
 */

const {
  verifyUser,
  callRpc,
  isAdminEmail,
  sendJson,
} = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");

const FULL_SONG_COST = 12;

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const apiKey = process.env.SUNO_API_KEY;
    if (!apiKey) return json(res, 500, { error: "Missing SUNO_API_KEY on server" });

    const user = await verifyUser(req);
    if (!user) {
      return json(res, 401, { error: "Sign in to generate songs." });
    }

    // Admin bypass: owner accounts (ADMIN_EMAILS env) skip the per-user
    // balance deduction entirely. The Suno API call below still hits the
    // master Suno account, so usage shows up there directly.
    const isAdmin = isAdminEmail(user.email);
    let balanceAfterDebit = null;
    if (!isAdmin) {
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
      balanceAfterDebit = Number(debit.data?.balance || 0);
    }

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
      model: requestedModel,
      negativeTags = "",
      vocalGender,
      styleWeight,
      weirdnessConstraint,
      personaId,
      personaModel: requestedPersonaModel,
    } = body || {};

    const { host, proto } = getHostProto(req);
    const callBackUrl = `${proto}://${host}/api/suno/callback`;

    const styleBits = [String(style || "").trim()];
    if (songKey) styleBits.push(`Key: ${String(songKey).trim()}`);
    if (instruments) styleBits.push(`Instruments: ${String(instruments).trim()}`);
    if (voiceTimbre) styleBits.push(`Voice timbre: ${String(voiceTimbre).trim()}`);
    const mergedStyle = styleBits.filter(Boolean).join(", ");

    // Persona / model coercion. Per Suno's docs:
    //   - personaId is only honored when customMode is true.
    //   - personaModel selects which dimension of the persona to apply:
    //       style_persona (default): IDs from generate-persona (saved from a song).
    //       voice_persona: voiceId from Suno Voice wizard (recorded voice).
    //   - voice_persona is supported on V5 and V5_5.
    const cleanPersonaId = personaId ? String(personaId).trim() : "";
    let personaModel = "";
    if (cleanPersonaId) {
      personaModel = String(requestedPersonaModel || "style_persona").trim();
      if (personaModel !== "style_persona" && personaModel !== "voice_persona") {
        personaModel = "style_persona";
      }
    }
    let chosenModel = String(requestedModel || "V5_5").trim() || "V5_5";
    if (cleanPersonaId && personaModel === "voice_persona") {
      const voiceOk = chosenModel === "V5" || chosenModel === "V5_5";
      if (!voiceOk) chosenModel = "V5_5";
    }

    const payload = {
      customMode: Boolean(customMode),
      instrumental: Boolean(instrumental),
      callBackUrl,
      model: chosenModel,
      ...(prompt ? { prompt: String(prompt) } : {}),
      ...(mergedStyle ? { style: mergedStyle } : {}),
      ...(title ? { title: String(title) } : {}),
      ...(negativeTags ? { negativeTags: String(negativeTags) } : {}),
      ...(vocalGender === "m" || vocalGender === "f" ? { vocalGender } : {}),
      ...(cleanPersonaId ? { personaId: cleanPersonaId } : {}),
      ...(cleanPersonaId && personaModel ? { personaModel } : {}),
      ...(Number.isFinite(Number(styleWeight)) ? { styleWeight: clamp01(Number(styleWeight)) } : {}),
      ...(Number.isFinite(Number(weirdnessConstraint))
        ? { weirdnessConstraint: clamp01(Number(weirdnessConstraint)) }
        : {}),
    };

    try {
      console.info("[suno/generate] →", {
        model: payload.model,
        personaId: payload.personaId || null,
        personaModel: payload.personaModel || null,
        vocalGender: payload.vocalGender || null,
        customMode: payload.customMode,
        instrumental: payload.instrumental,
        promptLen: payload.prompt?.length || 0,
        styleLen: payload.style?.length || 0,
      });
    } catch {}

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
    try {
      console.info("[suno/generate] ←", {
        httpStatus: r.status,
        sunoCode: data?.code,
        sunoMsg: data?.msg,
        taskId: data?.data?.taskId || null,
      });
    } catch {}
    if (!r.ok) {
      if (!isAdmin) {
        await refund(user.userId, FULL_SONG_COST, "refund_full_song", "suno_http_error").catch(() => null);
      }
      return json(res, 502, { error: "Upstream engine error", status: r.status, details: data || text });
    }
    const sunoCode = data && typeof data === "object" && "code" in data ? Number(data.code) : 200;
    if (Number.isFinite(sunoCode) && sunoCode !== 200) {
      if (!isAdmin) {
        await refund(user.userId, FULL_SONG_COST, "refund_full_song", `suno_code_${sunoCode}`).catch(() => null);
      }
      const msg = data?.msg || data?.message || data?.error || "Request was rejected upstream";
      return json(res, 502, { error: msg, details: data });
    }

    return json(res, 200, {
      ...(data || { raw: text }),
      _credits: {
        spent: isAdmin ? 0 : FULL_SONG_COST,
        balance: balanceAfterDebit,
        admin: isAdmin || undefined,
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
