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

export function isNativeAppShell() {
  try {
    if (globalThis.Capacitor?.isNativePlatform?.()) return true;
  } catch {}
  try {
    return location.protocol === "capacitor:";
  } catch {
    return false;
  }
}

export function isPushAvailable() {
  if (isNativeAppShell()) return false;
  return pushConfigured() && typeof Notification !== "undefined";
}

export function getPushPermissionState() {
  if (!pushConfigured() || typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export function isIosStandalonePwa() {
  try {
    if (navigator.standalone === true) return true;
    return window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    return false;
  }
}

export function isPushOptedIn() {
  try {
    const OneSignal = getOneSignal();
    return Boolean(OneSignal?.User?.PushSubscription?.optedIn);
  } catch {
    return false;
  }
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

async function ensurePushOptedIn() {
  const OneSignal = getOneSignal();
  if (!OneSignal?.User?.PushSubscription?.optIn) return false;
  if (OneSignal.User.PushSubscription.optedIn) return true;
  try {
    await OneSignal.User.PushSubscription.optIn();
  } catch (e) {
    console.warn("[push] optIn failed", e);
  }
  return Boolean(OneSignal.User.PushSubscription.optedIn);
}

function waitForPushSubscriptionId(timeoutMs = 12000) {
  const OneSignal = getOneSignal();
  const immediate = String(OneSignal?.User?.PushSubscription?.id || "").trim();
  if (immediate) return Promise.resolve(immediate);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (id) => {
      if (settled) return;
      settled = true;
      try {
        clearInterval(poll);
      } catch {}
      try {
        clearTimeout(timer);
      } catch {}
      resolve(String(id || "").trim());
    };
    const timer = setTimeout(() => finish(""), timeoutMs);
    const poll = setInterval(() => {
      const id = String(OneSignal?.User?.PushSubscription?.id || "").trim();
      if (id) finish(id);
    }, 350);
    try {
      OneSignal?.User?.PushSubscription?.addEventListener?.("change", (ev) => {
        const id = String(ev?.current?.id || OneSignal?.User?.PushSubscription?.id || "").trim();
        if (id) finish(id);
      });
    } catch {}
  });
}

export async function initPushNotifications() {
  if (!pushConfigured() || isNativeAppShell()) return false;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    try {
      const OneSignal = await waitForOneSignalReady();
      await OneSignal.init({
        appId: _appId,
        serviceWorkerPath: "/OneSignalSDKWorker.js",
        serviceWorkerUpdaterPath: "/OneSignalSDKUpdaterWorker.js",
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
    const r = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ subscriptionId, platform: "web" }),
    });
    if (!r.ok) console.warn("[push] register HTTP", r.status);
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

function bindPushSubscriptionListener(uid) {
  try {
    const OneSignal = getOneSignal();
    OneSignal.User?.PushSubscription?.addEventListener?.("change", async (ev) => {
      const next = String(ev?.current?.id || OneSignal.User?.PushSubscription?.id || "").trim();
      if (next && _linkedUserId === uid) await registerSubscriptionWithBackend(next);
    });
  } catch {}
}

export async function syncPushAuth(userId) {
  const uid = String(userId || "").trim().toLowerCase();
  if (!uid || !pushConfigured() || isNativeAppShell()) return;
  await initPushNotifications();
  try {
    const OneSignal = getOneSignal();
    if (!OneSignal?.login) return;
    if (_linkedUserId && _linkedUserId !== uid) {
      await logoutPushAuth({ skipBackend: true });
    }
    await OneSignal.login(uid);
    _linkedUserId = uid;
    bindPushSubscriptionListener(uid);
    if (getPushPermissionState() === "granted") {
      await ensurePushOptedIn();
      const subId = String(OneSignal.User?.PushSubscription?.id || "").trim();
      if (subId) await registerSubscriptionWithBackend(subId);
    }
    // iOS home-screen PWAs block permission prompts unless triggered by a user tap.
    const nativePerm = getPushPermissionState();
    if (nativePerm === "default" && !isIosStandalonePwa()) {
      try {
        await OneSignal.Notifications.requestPermission();
      } catch {}
    }
  } catch (e) {
    console.warn("[push] sync auth failed", e);
  }
}

/** Must be called from a user tap (Settings button, etc.). */
export async function enablePushNotifications(userId) {
  const uid = String(userId || _linkedUserId || "").trim().toLowerCase();
  if (!uid || !pushConfigured()) {
    return { ok: false, reason: "not_configured" };
  }
  if (isNativeAppShell()) {
    return { ok: false, reason: "native_app" };
  }
  await initPushNotifications();
  const OneSignal = getOneSignal();
  if (!OneSignal?.Notifications) {
    return { ok: false, reason: "sdk_missing" };
  }
  let pushSupported = true;
  try {
    pushSupported = await OneSignal.Notifications.isPushSupported();
  } catch {}
  if (!pushSupported) {
    return { ok: false, reason: "unsupported" };
  }
  if (_linkedUserId !== uid) {
    await syncPushAuth(uid);
  }
  bindPushSubscriptionListener(uid);

  const nativePerm = getPushPermissionState();
  if (nativePerm === "denied") {
    return { ok: false, state: "denied" };
  }

  if (nativePerm !== "granted") {
    try {
      const accepted = await OneSignal.Notifications.requestPermission();
      if (!accepted && getPushPermissionState() !== "granted") {
        return { ok: false, state: getPushPermissionState(), reason: "permission_declined" };
      }
    } catch (e) {
      console.warn("[push] permission request failed", e);
      return { ok: false, state: getPushPermissionState(), reason: "request_failed" };
    }
  }

  await ensurePushOptedIn();

  const subId = await waitForPushSubscriptionId(12000);
  if (subId) {
    await registerSubscriptionWithBackend(subId);
    return { ok: true, state: "granted", subscriptionId: subId };
  }

  if (isPushOptedIn()) {
    return { ok: true, state: "granted", reason: "subscription_pending" };
  }

  return { ok: false, state: getPushPermissionState(), reason: "subscription_failed" };
}

export async function maybePromptPushAfterLogin(userId) {
  if (!pushConfigured() || !userId || isNativeAppShell()) return;
  if (getPushPermissionState() !== "default") return;
  try {
    if (localStorage.getItem("nabad_push_prompt_v1") === "1") return;
    localStorage.setItem("nabad_push_prompt_v1", "1");
  } catch {}
  const msg = isIosStandalonePwa()
    ? "Tap Settings → Push alerts to enable."
    : "Enable push alerts in Settings.";
  try {
    globalThis.__nabadShowToast?.(msg, { icon: "🔔", durationMs: 5200 });
  } catch {}
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
