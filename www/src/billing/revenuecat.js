/**
 * RevenueCat / App Store billing on iOS (Capacitor).
 */

import { PRO_PLANS, PRO_PRODUCT_IDS } from "../pro-plan-config.js";

let _apiKey = "";
let _configuredFor = "";
let _offeringsCache = null;
let _offeringsCacheAt = 0;
let _warmInFlight = null;
const OFFERINGS_CACHE_TTL_MS = 5 * 60 * 1000;
const MS_DAY = 24 * 60 * 60 * 1000;

function planIdForProductId(productId) {
  const pid = String(productId || "").trim();
  if (pid === PRO_PRODUCT_IDS.weekly) return "weekly";
  if (pid === PRO_PRODUCT_IDS.monthly) return "monthly";
  return null;
}

function weeklyTrialDays() {
  const plan = PRO_PLANS.find((p) => p.id === "weekly");
  return Number(plan?.trialDays) > 0 ? Number(plan.trialDays) : 7;
}

function trialEndStorageKey(userId) {
  return `nabad_trial_end_${String(userId || "").trim()}`;
}

function pinClientTrialEnd(userId, iso, status) {
  if (String(status || "").toLowerCase() !== "trialing" || !iso) return iso;
  const key = trialEndStorageKey(userId);
  try {
    const prev = localStorage.getItem(key);
    if (prev) {
      const prevMs = Date.parse(prev);
      const nextMs = Date.parse(iso);
      if (Number.isFinite(prevMs) && Number.isFinite(nextMs) && prevMs <= nextMs) {
        return prev;
      }
    }
    localStorage.setItem(key, iso);
  } catch {}
  return iso;
}

function clearClientTrialEnd(userId) {
  try { localStorage.removeItem(trialEndStorageKey(userId)); } catch {}
}

/** Parse Pro subscription from RevenueCat CustomerInfo (iOS source of truth). */
export function parseProStateFromCustomerInfo(customerInfo, userId = "") {
  const info = customerInfo && typeof customerInfo === "object" ? customerInfo : null;
  if (!info) return null;

  const activeEntitlements = info.entitlements?.active || {};
  const pro =
    activeEntitlements.pro ||
    activeEntitlements.Pro ||
    Object.values(activeEntitlements).find((e) => e?.isActive) ||
    null;
  if (!pro?.isActive) return null;

  const productId = String(pro.productIdentifier || pro.identifier || "").trim();
  const planId = planIdForProductId(productId);
  if (!planId) return null;

  const subs = info.subscriptionsByProductIdentifier || {};
  const sub = subs[productId] || {};
  const periodType = String(sub.periodType || sub.period_type || "").toUpperCase();
  const rcExpiration = pro.expirationDate || sub.expiresDate || sub.expirationDate || null;
  const originalPurchase =
    sub.originalPurchaseDate ||
    sub.original_purchase_date ||
    info.allPurchaseDates?.[productId] ||
    info.originalPurchaseDate ||
    null;

  let status = "active";
  let currentPeriodEnd = rcExpiration ? new Date(rcExpiration).toISOString() : null;

  if (periodType === "TRIAL") {
    status = "trialing";
  } else if (planId === "weekly" && originalPurchase) {
    const startMs = Date.parse(String(originalPurchase));
    const trialDays = weeklyTrialDays();
    const trialEndMs = startMs + trialDays * MS_DAY;
    if (Number.isFinite(startMs) && Date.now() < trialEndMs && periodType !== "NORMAL") {
      status = "trialing";
      currentPeriodEnd = new Date(trialEndMs).toISOString();
    }
  } else if (planId === "weekly" && periodType !== "NORMAL") {
    status = "trialing";
  }

  if (status === "trialing") {
    currentPeriodEnd = pinClientTrialEnd(userId, currentPeriodEnd, status);
  } else {
    clearClientTrialEnd(userId);
  }

  return {
    active: true,
    planId,
    status,
    currentPeriodEnd,
  };
}

export async function readLocalProSubscriptionState(userId) {
  const uid = String(userId || "").trim();
  if (!_apiKey || !uid) return null;
  await ensureRevenueCat(uid);
  const { Purchases } = await purchasesModule();
  const { customerInfo } = await Purchases.getCustomerInfo();
  return parseProStateFromCustomerInfo(customerInfo, uid);
}

function mergeProSubscriptionState(serverPro, localPro, userId = "") {
  const server = serverPro && typeof serverPro === "object" ? serverPro : {};
  const local = localPro && typeof localPro === "object" ? localPro : {};
  const active = Boolean(server.active || local.active);
  if (!active) return normalizeProRow(server, userId);

  const planId = local.planId || server.planId || null;
  let status = local.status || server.status || null;
  let currentPeriodEnd = local.currentPeriodEnd || server.currentPeriodEnd || null;

  if (local.status === "trialing") {
    status = "trialing";
    currentPeriodEnd = local.currentPeriodEnd || currentPeriodEnd;
  } else if (local.status && local.planId) {
    status = local.status;
    currentPeriodEnd = local.currentPeriodEnd || currentPeriodEnd;
  }

  if (String(status || "").toLowerCase() === "trialing") {
    currentPeriodEnd = pinClientTrialEnd(userId, currentPeriodEnd, status);
  } else {
    clearClientTrialEnd(userId);
  }

  return { active: true, planId, status, currentPeriodEnd };
}

function normalizeProRow(row, userId) {
  const active = Boolean(row?.active);
  if (!active) {
    clearClientTrialEnd(userId);
    return { active: false, planId: null, status: null, currentPeriodEnd: null };
  }
  return {
    active: true,
    planId: row.planId || null,
    status: row.status || null,
    currentPeriodEnd: row.currentPeriodEnd || null,
  };
}

/** Sync server with RevenueCat, then return merged Pro state for UI. */
export async function reconcileProSubscription(opts = {}) {
  const uid = String(opts.userId || "").trim();
  if (!uid || !_apiKey) return null;

  let local = null;
  try {
    local = await readLocalProSubscriptionState(uid);
  } catch (e) {
    console.warn("[billing] local pro read failed", e?.message || e);
  }

  let serverPro = null;
  try {
    const sync = await syncBillingWithServer(opts);
    serverPro = sync?.pro || null;
  } catch (e) {
    console.warn("[billing] server sync failed", e?.message || e);
  }

  if (local?.active || serverPro?.active) {
    return mergeProSubscriptionState(serverPro, local, uid);
  }
  return normalizeProRow(serverPro, uid);
}

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
