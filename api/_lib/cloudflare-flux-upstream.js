/**
 * Cloudflare Workers AI — Flux Schnell abstract cover images.
 * https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/
 */

const MODEL_ID = "@cf/black-forest-labs/flux-1-schnell";

function getCloudflareCredentials() {
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const token = String(
    process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_AI_API_TOKEN || "",
  ).trim();
  return { accountId, token };
}

function isCloudflareFluxConfigured() {
  const { accountId, token } = getCloudflareCredentials();
  return Boolean(accountId && token);
}

/** Default abstract cover provider — cloudflare when creds exist, else Pollinations. */
function resolveDefaultCoverImageProvider() {
  const explicit = String(process.env.COVER_IMAGE_PROVIDER || "").trim().toLowerCase();
  if (explicit === "pollinations" || explicit === "cloudflare") return explicit;
  return isCloudflareFluxConfigured() ? "cloudflare" : "pollinations";
}

function resolveFluxSteps() {
  const n = Number(process.env.CLOUDFLARE_FLUX_STEPS || "4");
  if (!Number.isFinite(n)) return 4;
  return Math.min(8, Math.max(1, Math.floor(n)));
}

async function fetchCloudflareFluxCover({ prompt, timeoutMs = 65000, steps = resolveFluxSteps() } = {}) {
  const { accountId, token } = getCloudflareCredentials();
  if (!accountId || !token) return { ok: false, error: "cloudflare_not_configured" };

  const text = String(prompt || "").trim();
  if (!text) return { ok: false, error: "empty_prompt" };

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL_ID}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: text, num_steps: steps }),
      signal: ctrl.signal,
    });

    const mime = String(upstream.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    const buf = Buffer.from(await upstream.arrayBuffer());

    if (/json/i.test(mime)) {
      let detail = "cloudflare_json_error";
      try {
        const data = JSON.parse(buf.toString("utf8"));
        detail = data?.errors?.[0]?.message || data?.error || detail;
      } catch {}
      return { ok: false, error: detail };
    }

    if (!upstream.ok) {
      return { ok: false, error: `HTTP ${upstream.status}` };
    }
    if (buf.length < 512) {
      return { ok: false, error: "empty_image" };
    }

    return { ok: true, buf, mime: mime || "image/jpeg" };
  } catch (e) {
    return {
      ok: false,
      error: e?.name === "AbortError" ? "timeout" : (e?.message || String(e)),
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  MODEL_ID,
  getCloudflareCredentials,
  isCloudflareFluxConfigured,
  resolveDefaultCoverImageProvider,
  resolveFluxSteps,
  fetchCloudflareFluxCover,
};
