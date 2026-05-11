/**
 * Suno API: Generate Sounds (loops / ambience / SFX).
 * POST /api/suno/sounds
 *
 * Mirrors Suno credit cost (default 2.5). Requires DB migration
 * `supabase/credits_decimal.sql` so balances support fractional credits.
 *
 * Env: SUNO_API_KEY, SUPABASE_* for credits-auth.
 */

const {
  verifyUser,
  callRpc,
} = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");

const SOUND_COST = 2.5;

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const apiKey = process.env.SUNO_API_KEY;
    if (!apiKey) return json(res, 500, { error: "Missing SUNO_API_KEY on server" });

    const user = await verifyUser(req);
    if (!user) {
      return json(res, 401, { error: "Sign in to generate sounds." });
    }

    const debit = await callRpc("consume_credits", {
      p_user_id: user.userId,
      p_amount: SOUND_COST,
      p_reason: "sound_generate",
      p_ref: "",
    });
    if (!debit.ok || !debit.data?.ok) {
      const status = String(debit.data?.status || "");
      if (status === "insufficient") {
        return json(res, 402, {
          error: "Not enough credits",
          code: "insufficient_credits",
          balance: Number(debit.data?.balance || 0),
          needed: SOUND_COST,
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
    const prompt = String(body?.prompt || "").trim();
    if (!prompt) {
      await refund(user.userId, SOUND_COST, "refund_sound_generate", "empty_prompt").catch(() => null);
      return json(res, 400, { error: "Missing prompt" });
    }

    const soundLoop = Boolean(body?.soundLoop);
    const grabLyrics = Boolean(body?.grabLyrics);
    const soundTempo = body?.soundTempo;
    const soundKey = String(body?.soundKey || "Any").trim() || "Any";

    const { host, proto } = getHostProto(req);
    const callBackUrl = `${proto}://${host}/api/suno/callback`;

    const payload = {
      prompt: prompt.slice(0, 500),
      model: "V5",
      soundLoop,
      grabLyrics,
      soundKey,
      callBackUrl,
    };
    if (soundTempo != null && soundTempo !== "" && Number.isFinite(Number(soundTempo))) {
      const t = Math.max(1, Math.min(300, Math.floor(Number(soundTempo))));
      payload.soundTempo = t;
    }

    const r = await fetch("https://api.sunoapi.org/api/v1/generate/sounds", {
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
      await refund(user.userId, SOUND_COST, "refund_sound_generate", "suno_http_error").catch(() => null);
      return json(res, 502, { error: "Upstream Suno error", status: r.status, details: data || text });
    }
    const sunoCode = data && typeof data === "object" && "code" in data ? Number(data.code) : 200;
    if (Number.isFinite(sunoCode) && sunoCode !== 200) {
      await refund(user.userId, SOUND_COST, "refund_sound_generate", `suno_code_${sunoCode}`).catch(() => null);
      const msg = data?.msg || data?.message || data?.error || "Suno rejected request";
      return json(res, 502, { error: msg, details: data });
    }

    return json(res, 200, {
      ...(data || { raw: text }),
      _credits: {
        spent: SOUND_COST,
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
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function safeJson(txt) {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}
