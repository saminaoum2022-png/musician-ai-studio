/**
 * Stripe Checkout + Customer Portal on web (nabadai.com).
 */

let _stripeWebEnabled = false;

export function setStripeWebBillingEnabled(enabled) {
  _stripeWebEnabled = Boolean(enabled);
}

export function isStripeWebBillingConfigured() {
  return _stripeWebEnabled;
}

/** Stripe Checkout / Portal on native iOS opens in Capacitor Browser, not the WKWebView shell. */
async function openExternalBillingUrl(url) {
  const target = String(url || "").trim();
  if (!target) throw new Error("Missing billing URL.");
  try {
    const cap = typeof window !== "undefined" ? window.Capacitor : null;
    const Browser = cap?.Plugins?.Browser;
    if (cap?.isNativePlatform?.() && Browser?.open) {
      await Browser.open({ url: target, presentationStyle: "fullscreen" });
      return;
    }
  } catch {}
  window.location.href = target;
}

async function syncBillingWithServer({ getAuthToken, apiBase = "" }) {
  const token = typeof getAuthToken === "function" ? getAuthToken() : "";
  if (!token) return null;
  const base = String(apiBase || "").replace(/\/$/, "");
  const url = base ? `${base}/api/billing/sync` : "/api/billing/sync";
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(data?.error || `Billing sync failed (${r.status})`);
  }
  return data;
}

export async function startStripeCheckout(planId, opts = {}) {
  const pid = String(planId || "").trim();
  if (pid !== "weekly" && pid !== "monthly") throw new Error("Unknown plan");

  const token = typeof opts.getAuthToken === "function" ? opts.getAuthToken() : "";
  if (!token) throw new Error("Sign in to subscribe.");

  const base = String(opts.apiBase || "").replace(/\/$/, "");
  const url = base ? `${base}/api/billing/checkout` : "/api/billing/checkout";
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ planId: pid }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data?.error || `Checkout failed (${r.status})`);
    err.code = data?.code || "";
    throw err;
  }
  if (!data?.url) throw new Error("Checkout did not return a payment URL.");
  await openExternalBillingUrl(data.url);
  return data;
}

export async function openStripeBillingPortal(opts = {}) {
  const token = typeof opts.getAuthToken === "function" ? opts.getAuthToken() : "";
  if (!token) throw new Error("Sign in to manage your subscription.");

  const base = String(opts.apiBase || "").replace(/\/$/, "");
  const url = base ? `${base}/api/billing/portal` : "/api/billing/portal";
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(data?.error || `Could not open billing portal (${r.status})`);
  }
  if (!data?.url) throw new Error("Billing portal did not return a URL.");
  await openExternalBillingUrl(data.url);
  return data;
}

export async function syncStripeBillingWithServer(opts = {}) {
  return syncBillingWithServer(opts);
}

export function clearStripeCheckoutQueryFromHash() {
  try {
    const raw = String(location.hash || "");
    const hashPath = raw.split("?")[0] || "#/settings/pro";
    if (raw.includes("checkout=")) {
      location.replace(`${location.pathname}${location.search}${hashPath}`);
    }
  } catch {}
}

export function readStripeCheckoutResultFromHash() {
  try {
    const q = String(location.hash || "").split("?")[1] || "";
    const params = new URLSearchParams(q);
    const checkout = String(params.get("checkout") || "").trim();
    if (!checkout) return null;
    return {
      checkout,
      sessionId: String(params.get("session_id") || "").trim(),
    };
  } catch {
    return null;
  }
}
