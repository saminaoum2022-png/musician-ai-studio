/**
 * RevenueCat / App Store billing on iOS (Capacitor).
 */

import { PRO_PRODUCT_IDS } from "../pro-plan-config.js";

let _apiKey = "";
let _configuredFor = "";
let _offeringsCache = null;
let _offeringsCacheAt = 0;
let _warmInFlight = null;
const OFFERINGS_CACHE_TTL_MS = 5 * 60 * 1000;

export function setRevenueCatApiKey(key) {
  _apiKey = String(key || "").trim();
}

export function isBillingConfigured() {
  return Boolean(_apiKey);
}

async function purchasesModule() {
  return import("../../vendor/revenuecat/index.js");
}

export async function ensureRevenueCat(userId) {
  const uid = String(userId || "").trim();
  if (!_apiKey) throw new Error("Billing is not configured yet.");
  if (!uid) throw new Error("Sign in to subscribe.");
  if (_configuredFor === uid) return;
  const { Purchases, LOG_LEVEL } = await purchasesModule();
  try {
    await Purchases.setLogLevel({ level: LOG_LEVEL.WARN });
  } catch {}
  await Purchases.configure({ apiKey: _apiKey, appUserID: uid });
  _configuredFor = uid;
}

function findPackageForProduct(offerings, productId) {
  const current = offerings?.current;
  const packages = current?.availablePackages || [];
  return (
    packages.find((p) => String(p?.product?.identifier || "") === productId) ||
    packages.find((p) => String(p?.identifier || "").toLowerCase() === productId.toLowerCase()) ||
    null
  );
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

function purchaseError(err) {
  const e = err && typeof err === "object" ? err : {};
  const code = String(e.code || e.errorCode || "").toUpperCase();
  const msg = String(e.message || e.errorMessage || "").trim();
  if (code.includes("CANCEL") || msg.toLowerCase().includes("cancel")) {
    const out = new Error("Purchase cancelled");
    out.userCancelled = true;
    return out;
  }
  return new Error(msg || "Purchase failed");
}

export async function purchaseProPlan(planId, opts = {}) {
  const pid = String(planId || "").trim();
  const productId = PRO_PRODUCT_IDS[pid];
  if (!productId) throw new Error("Unknown plan");

  await ensureRevenueCat(opts.userId);
  const { Purchases } = await purchasesModule();

  try {
    const offerings = await loadOfferings();
    const pkg = findPackageForProduct(offerings, productId);
    if (pkg) {
      await Purchases.purchasePackage({ aPackage: pkg });
    } else {
      const { products } = await Purchases.getProducts({ productIdentifiers: [productId] });
      const product = Array.isArray(products) ? products[0] : null;
      if (!product) {
        throw new Error(
          "Product not found. Set up App Store Connect + RevenueCat offerings first.",
        );
      }
      await Purchases.purchaseStoreProduct({ product });
    }
  } catch (err) {
    throw purchaseError(err);
  }

  return syncBillingWithServer(opts);
}

export async function restoreProPurchases(opts = {}) {
  await ensureRevenueCat(opts.userId);
  const { Purchases } = await purchasesModule();
  try {
    await Purchases.restorePurchases();
  } catch (err) {
    throw purchaseError(err);
  }
  return syncBillingWithServer(opts);
}

async function loadOfferings({ force = false } = {}) {
  const now = Date.now();
  if (!force && _offeringsCache && now - _offeringsCacheAt < OFFERINGS_CACHE_TTL_MS) {
    return _offeringsCache;
  }
  const { Purchases } = await purchasesModule();
  const offerings = await Purchases.getOfferings();
  _offeringsCache = offerings;
  _offeringsCacheAt = Date.now();
  return offerings;
}

/** Pre-configure RevenueCat + cache offerings so the App Store sheet opens faster. */
export async function warmBilling(userId) {
  const uid = String(userId || "").trim();
  if (!_apiKey || !uid) return;
  if (_warmInFlight) return _warmInFlight;
  _warmInFlight = (async () => {
    try {
      await ensureRevenueCat(uid);
      await loadOfferings();
    } catch (e) {
      console.warn("[billing] warm failed", e?.message || e);
    } finally {
      _warmInFlight = null;
    }
  })();
  return _warmInFlight;
}

export function resetRevenueCatSession() {
  _configuredFor = "";
  _offeringsCache = null;
  _offeringsCacheAt = 0;
  _warmInFlight = null;
}
