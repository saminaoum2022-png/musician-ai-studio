/**
 * RevenueCat / App Store billing on iOS (Capacitor).
 */

import { PRO_PRODUCT_IDS } from "../pro-plan-config.js";

let _apiKey = "";
let _configuredFor = "";

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
    const offerings = await Purchases.getOfferings();
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

export function resetRevenueCatSession() {
  _configuredFor = "";
}
