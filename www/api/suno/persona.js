/**
 * Suno API proxy: create a persona from an existing taskId + audioId.
 *
 * Documented endpoint:
 *   POST https://api.sunoapi.org/api/v1/generate/generate-persona
 *   Required body: { taskId, audioId, name, description }
 *   Optional:      { vocalStart, vocalEnd, style }
 *   Requirements:  source must be a completed V4+ generation, and each
 *                  audioId can only generate a Persona once.
 *
 * Credits:
 *   Debits PERSONA_COST profile credits BEFORE calling Suno. Refunds in
 *   full if Suno rejects synchronously (HTTP error or non-200 code) so
 *   the user is never charged for a request Suno didn't accept.
 *
 * Env:
 *   SUNO_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 */
const {
  verifyUser,
  callRpc,
  isAdminEmail,
} = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");

const PERSONA_COST = 5;

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const apiKey = process.env.SUNO_API_KEY;
    if (!apiKey) return json(res, 500, { error: "Missing SUNO_API_KEY on server" });

    const user = await verifyUser(req);
    if (!user) {
      return json(res, 401, { error: "Sign in to save a persona." });
    }

    const body = await readJson(req);
    const taskId = String(body?.taskId || "").trim();
    const audioId = String(body?.audioId || "").trim();
    const name = String(body?.name || "").trim().slice(0, 64);
    const description = String(body?.description || "").trim().slice(0, 600);
    const style = String(body?.style || "").trim().slice(0, 80);
    const vocalStart = numOrUndefined(body?.vocalStart);
    const vocalEnd = numOrUndefined(body?.vocalEnd);

    if (!taskId) return json(res, 400, { error: "Missing taskId" });
    if (!audioId) return json(res, 400, { error: "Missing audioId" });
    if (!name) return json(res, 400, { error: "Missing name" });
    if (!description) return json(res, 400, { error: "Missing description" });

    const isAdmin = isAdminEmail(user.email);
    let balanceAfterDebit = null;
    if (!isAdmin) {
      const debit = await callRpc("consume_credits", {
        p_user_id: user.userId,
        p_amount: PERSONA_COST,
        p_reason: "persona_create",
        p_ref: audioId,
      });
      if (!debit.ok || !debit.data?.ok) {
        const status = String(debit.data?.status || "");
        if (status === "insufficient") {
          return json(res, 402, {
            error: "Not enough credits",
            code: "insufficient_credits",
            balance: Number(debit.data?.balance || 0),
            needed: PERSONA_COST,
            message:
              debit.data?.message ||
              `Saving a voice persona costs ${PERSONA_COST} credits. Redeem a code from your Profile.`,
          });
        }
        return json(res, 500, {
          error: "Credit check failed",
          details: debit.data || debit.error || null,
        });
      }
      balanceAfterDebit = Number(debit.data?.balance || 0);
    }
    const refund = async (refLabel) => {
      if (isAdmin) return;
      try {
        await callRpc("refund_credits", {
          p_user_id: user.userId,
          p_amount: PERSONA_COST,
          p_reason: "refund_persona_create",
          p_ref: refLabel || "",
        });
      } catch {}
    };

    const payload = {
      taskId,
      audioId,
      name,
      description,
      ...(style ? { style } : {}),
      ...(typeof vocalStart === "number" ? { vocalStart } : {}),
      ...(typeof vocalEnd === "number" ? { vocalEnd } : {}),
    };

    const url = "https://api.sunoapi.org/api/v1/generate/generate-persona";
    // Suno's persona endpoint is occasionally flaky on transient codes
    // (500 / 451 / 429 / 503 / 504). Retry once with a small backoff
    // before bubbling the failure up — keeps within Vercel's 10s
    // function budget while rescuing 80% of the "internal error" toasts.
    const isTransient = (httpStatus, code) =>
      httpStatus === 500 || httpStatus === 502 || httpStatus === 503 || httpStatus === 504 ||
      httpStatus === 429 || httpStatus === 451 ||
      code === 500 || code === 502 || code === 503 || code === 451 || code === 429;

    let r;
    let text = "";
    let data = null;
    let httpStatus = 0;
    let upstreamCode = 200;
    let attempt = 0;
    const maxAttempts = 2;

    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        r = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      } catch (e) {
        // Network-level failure (DNS, TLS, abort). Retry once if budget allows.
        if (attempt < maxAttempts) {
          await sleep(1500);
          continue;
        }
        await refund("persona_network_error");
        return json(res, 502, {
          error: "Persona request failed",
          details: e?.message || String(e),
          attempts: attempt,
        });
      }
      text = await r.text().catch(() => "");
      data = safeJson(text);
      httpStatus = r.status;
      upstreamCode = data && typeof data === "object" && "code" in data ? Number(data.code) : 200;
      const ok = r.ok && upstreamCode === 200;
      if (ok) break;
      if (attempt < maxAttempts && isTransient(httpStatus, upstreamCode)) {
        await sleep(1500);
        continue;
      }
      break;
    }

    if (!r.ok) {
      // Surface Suno's own message when present so the toast actually
      // helps the user (e.g. "audioId not eligible for persona").
      const upstreamMsg =
        (data && (data.msg || data.message || data.error)) ||
        (typeof text === "string" ? text.slice(0, 200) : "");
      await refund(`suno_http_${r.status}`);
      return json(res, r.status, {
        error: upstreamMsg
          ? `Upstream persona error: ${String(upstreamMsg).slice(0, 200)}`
          : "Upstream persona error",
        status: r.status,
        details: data || text,
        attempts: attempt,
      });
    }

    if (upstreamCode !== 200) {
      const friendly = mapPersonaCode(upstreamCode, data?.msg);
      const detailedMsg = data?.msg && !friendly.includes(data.msg)
        ? `${friendly} (Details: ${String(data.msg).slice(0, 160)})`
        : friendly;
      await refund(`suno_code_${upstreamCode}`);
      return json(res, 502, {
        error: detailedMsg,
        code: upstreamCode,
        details: data,
        attempts: attempt,
      });
    }

    const personaId =
      data?.data?.personaId ||
      data?.data?.persona_id ||
      data?.personaId ||
      data?.persona_id ||
      "";

    return json(res, 200, {
      ...(data || { raw: text }),
      personaId,
      endpoint: url,
      _credits: {
        spent: isAdmin ? 0 : PERSONA_COST,
        balance: balanceAfterDebit,
        admin: isAdmin || undefined,
      },
    });
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
};

function mapPersonaCode(code, msg) {
  switch (Number(code)) {
    case 401: return "Engine authentication failed (check SUNO_API_KEY).";
    case 402: return "The engine account is out of credits for persona creation.";
    case 404: return "That song isn't ready or audioId is wrong. Wait until the song fully finishes, then try again.";
    case 409: return "A persona was already created from this song. Each audio can be turned into a persona only once.";
    case 422: return msg || "Persona request failed validation. Check the song info and try again.";
    case 429: return "Too many persona requests right now. Wait a moment and retry.";
    case 451: return "The engine couldn't fetch this song's audio. Try again in a minute.";
    case 455: return "The engine is under maintenance. Try again shortly.";
    case 500: return "The engine hit an internal error. Try again.";
    default:  return msg || `Persona failed (code ${code})`;
  }
}

function numOrUndefined(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
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
function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}
