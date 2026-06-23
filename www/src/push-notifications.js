/**
 * OneSignal web push — privacy-first.
 * Links Supabase auth UUID as external_id; registers subscription ID with our API.
 * Never sends message content to OneSignal.
 */

let _appId = "";
let _initPromise = null;
let _linkedUserId = "";

export function configurePushFromPublicConfig(appId) {
  _appId = String(appId || "").trim();
}

function pushConfigured() {
  return Boolean(_appId);
}

function getOneSignal() {
  return globalThis.OneSignal;
}

function waitForOneSignalReady() {
  return new Promise((resolve) => {
    if (getOneSignal()?.User) {
      resolve(getOneSignal());
      return;
    }
    const deferred = globalThis.OneSignalDeferred || (globalThis.OneSignalDeferred = []);
    deferred.push(async (OneSignal) => resolve(OneSignal));
  });
}

export async function initPushNotifications() {
  if (!pushConfigured()) return false;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    try {
      const OneSignal = await waitForOneSignalReady();
      await OneSignal.init({
        appId: _appId,
        serviceWorkerPath: "./OneSignalSDKWorker.js",
        serviceWorkerUpdaterPath: "./OneSignalSDKUpdaterWorker.js",
        allowLocalhostAsSecureOrigin: true,
        notifyButton: { enable: false },
      });
      OneSignal.Notifications.addEventListener("click", (event) => {
        try {
          const data = event?.notification?.additionalData || event?.notification?.data || {};
          const route = String(data?.nabad_route || "").trim();
          if (!route) return;
          const hash = `#/${route}`;
          if (location.hash !== hash) location.hash = hash;
          try {
            globalThis.__nabadApplyRoute?.();
          } catch {}
        } catch {}
      });
      return true;
    } catch (e) {
      console.warn("[push] init failed", e);
      return false;
    }
  })();
  return _initPromise;
}

async function registerSubscriptionWithBackend(subscriptionId) {
  const token = globalThis.__nabadGetAuthToken?.() || "";
  if (!token || !subscriptionId) return;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  const bypass = globalThis.__VERCEL_PROTECTION_BYPASS__;
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;
  const base = String(globalThis.__nabadApiBase || "").replace(/\/$/, "");
  const url = base ? `${base}/api/push/register` : "/api/push/register";
  try {
    await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ subscriptionId, platform: "web" }),
    });
  } catch (e) {
    console.warn("[push] register failed", e);
  }
}

async function unregisterSubscriptionFromBackend(subscriptionId) {
  const token = globalThis.__nabadGetAuthToken?.() || "";
  if (!token) return;
  const headers = { Authorization: `Bearer ${token}` };
  const bypass = globalThis.__VERCEL_PROTECTION_BYPASS__;
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;
  const base = String(globalThis.__nabadApiBase || "").replace(/\/$/, "");
  const q = subscriptionId ? `?subscriptionId=${encodeURIComponent(subscriptionId)}` : "";
  const url = base ? `${base}/api/push/register${q}` : `/api/push/register${q}`;
  try {
    await fetch(url, { method: "DELETE", headers });
  } catch {}
}

export async function syncPushAuth(userId) {
  const uid = String(userId || "").trim();
  if (!uid || !pushConfigured()) return;
  await initPushNotifications();
  try {
    const OneSignal = getOneSignal();
    if (!OneSignal?.login) return;
    if (_linkedUserId && _linkedUserId !== uid) {
      await logoutPushAuth({ skipBackend: true });
    }
    await OneSignal.login(uid);
    _linkedUserId = uid;
    const subId = OneSignal.User?.PushSubscription?.id;
    if (subId) await registerSubscriptionWithBackend(String(subId));
    OneSignal.User?.PushSubscription?.addEventListener?.("change", async (ev) => {
      const next = String(ev?.current?.id || OneSignal.User?.PushSubscription?.id || "").trim();
      if (next && _linkedUserId === uid) await registerSubscriptionWithBackend(next);
    });
    if (OneSignal.Notifications?.permission === false) {
      try {
        await OneSignal.Notifications.requestPermission();
      } catch {}
    }
  } catch (e) {
    console.warn("[push] sync auth failed", e);
  }
}

export async function logoutPushAuth({ skipBackend = false } = {}) {
  if (!pushConfigured()) return;
  try {
    const OneSignal = getOneSignal();
    const subId = OneSignal?.User?.PushSubscription?.id;
    if (!skipBackend && subId) await unregisterSubscriptionFromBackend(String(subId));
    await OneSignal?.logout?.();
  } catch {}
  _linkedUserId = "";
}
