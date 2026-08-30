/**
 * Cloudflare Workers AI — Flux Schnell abstract cover images.
 * https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/
 *
 * AI Gateway unified billing: set gateway Workers AI billing → Unified billing in the
 * dashboard, then route requests with cf-aig-gateway-id (defaults to "default").
 * Set CLOUDFLARE_AIG_GATEWAY_ID=direct to skip the gateway and use direct Workers AI
 * (free 10k neurons/day cap applies).
 */

const MODEL_ID = "@cf/black-forest-labs/flux-1-schnell";
const AIG_GATEWAY_DIRECT_ALIASES = /^(off|false|none|direct|0)$/i;

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

/** AI Gateway id for unified prepaid billing; empty = direct Workers AI REST. */
function resolveAigGatewayId() {
  const raw = String(process.env.CLOUDFLARE_AIG_GATEWAY_ID ?? "default").trim();
  if (!raw || AIG_GATEWAY_DIRECT_ALIASES.test(raw)) return "";
  return raw;
}

function usesAigGateway() {
  return Boolean(resolveAigGatewayId());
}

async function fetchCloudflareFluxCover({ prompt, timeoutMs = 65000, steps = resolveFluxSteps() } = {}) {
  const { accountId, token } = getCloudflareCredentials();
  if (!accountId || !token) return { ok: false, error: "cloudflare_not_configured" };

  const text = String(prompt || "").trim();
  if (!text) return { ok: false, error: "empty_prompt" };

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL_ID}`;
  const gatewayId = resolveAigGatewayId();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    if (gatewayId) headers["cf-aig-gateway-id"] = gatewayId;

    const upstream = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt: text, steps }),
      signal: ctrl.signal,
    });

    const mime = String(upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const buf = Buffer.from(await upstream.arrayBuffer());

    // REST API returns JSON { success, result: { image: "<base64>" } } — not raw bytes.
    const looksJson = /json/i.test(mime) || (buf.length > 0 && buf[0] === 0x7b);
    if (looksJson) {
      let data = null;
      try {
        data = JSON.parse(buf.toString("utf8"));
      } catch {
        return { ok: false, error: "cloudflare_invalid_json" };
      }
      if (!data?.success) {
        const detail = data?.errors?.[0]?.message || data?.error || "cloudflare_request_failed";
        return { ok: false, error: detail };
      }
      const b64 = data?.result?.image || data?.result?.data || "";
      if (!b64) return { ok: false, error: "cloudflare_missing_image" };
      const imageBuf = Buffer.from(String(b64), "base64");
      if (imageBuf.length < 512) return { ok: false, error: "empty_image" };
      return { ok: true, buf: imageBuf, mime: "image/jpeg", gatewayId: gatewayId || null };
    }

    if (!upstream.ok) {
      return { ok: false, error: `HTTP ${upstream.status}`, gatewayId: gatewayId || null };
    }
    if (buf.length < 512) {
      return { ok: false, error: "empty_image", gatewayId: gatewayId || null };
    }

    return { ok: true, buf, mime: mime || "image/jpeg", gatewayId: gatewayId || null };
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
  resolveAigGatewayId,
  usesAigGateway,
  fetchCloudflareFluxCover,
};
