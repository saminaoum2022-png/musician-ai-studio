/**
 * OneSignal push — privacy-first (web + native Capacitor).
 * Links Supabase auth UUID as external_id; registers subscription ID with our API.
 * Never sends message content to OneSignal.
 */

let _appId = "";
let _initPromise = null;
let _linkedUserId = "";
let _nativeOneSignal = null;
let _nativePermState = "default";
let _nativeOptedIn = false;

const PENDING_PUSH_ROUTE_KEY = "nabad_pending_push_route:v1";
const PENDING_PUSH_TASK_KEY = "nabad_pending_push_task:v1";

export const GENERATION_PUSH_CATEGORIES = new Set([
  "generation_ready",
  "photo_ready",
  "hum_track_ready",
  "sound_ready",
  "music_video_ready",
  "instrumental_ready",
]);

let _appIsActive = typeof document !== "undefined" ? !document.hidden : true;

export function setAppActiveState(active) {
  _appIsActive = Boolean(active);
}

export function isAppActiveForPush() {
  try {
    if (!_appIsActive) return false;
    if (typeof document !== "undefined" && document.hidden) return false;
  } catch {}
  return true;
}

export function isGenerationPushCategory(category) {
  return GENERATION_PUSH_CATEGORIES.has(String(category || "").trim());
}

function normalizePushPayload(raw) {
  const notif = raw?.notification || raw;
  const data = notif?.additionalData || notif?.data || raw?.additionalData || raw || {};
  if (!data || typeof data !== "object") return {};
  return {
    route: String(data.nabad_route || "").trim(),
    category: String(data.nabad_category || "").trim(),
    entityId: String(data.nabad_entity_id || data.nabad_entityId || "").trim(),
  };
}

export function stashPendingPushTask(taskId, category) {
  const tid = String(taskId || "").trim();
  const cat = String(category || "").trim();
  if (!tid || !isGenerationPushCategory(cat)) return;
  try {
    sessionStorage.setItem(
      PENDING_PUSH_TASK_KEY,
      JSON.stringify({ taskId: tid, category: cat, at: Date.now() }),
    );
  } catch {}
}

export function peekPendingPushTask() {
  try {
    const raw = sessionStorage.getItem(PENDING_PUSH_TASK_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o?.taskId) return null;
    return {
      taskId: String(o.taskId).trim(),
      category: String(o.category || "generation_ready").trim(),
    };
  } catch {
    return null;
  }
}

export function consumePendingPushTask() {
  const hit = peekPendingPushTask();
  try {
    sessionStorage.removeItem(PENDING_PUSH_TASK_KEY);
  } catch {}
  return hit;
}

/** Turn OneSignal custom data into an in-app hash path (no leading #/). */
export function resolvePushHashPath(payload = {}) {
  const category = String(payload?.category || payload?.nabad_category || "").trim();
  const entityId = String(payload?.entityId || payload?.nabad_entity_id || "").trim();
  const route = String(payload?.route || payload?.nabad_route || "").trim().replace(/^\/+/, "");

  if (category === "dm_request") {
    return "messages?filter=requests";
  }
  if (category === "dm_message" && entityId) {
    return `messages-thread?thread=${encodeURIComponent(entityId)}`;
  }
  if (route) return route;
  return "";
}

export function stashPendingPushRoute(route) {
  const clean = String(route || "").trim().replace(/^\/+/, "");
  if (!clean) return;
  try {
    sessionStorage.setItem(PENDING_PUSH_ROUTE_KEY, clean);
  } catch {}
}

export function stashPendingPushPayload(raw) {
  const payload = normalizePushPayload(raw);
  const hashPath = resolvePushHashPath(payload);
  if (hashPath) stashPendingPushRoute(hashPath);
  if (payload.entityId && isGenerationPushCategory(payload.category)) {
    stashPendingPushTask(payload.entityId, payload.category);
  }
  return hashPath;
}

function shouldSuppressForegroundGenerationPush(raw) {
  if (!isAppActiveForPush()) return false;
  const { category } = normalizePushPayload(raw);
  return isGenerationPushCategory(category);
}

function ackDmThreadDeliveredFromPush(threadId) {
  const tid = String(threadId || "").trim();
  if (!tid) return Promise.resolve();
  const hook = globalThis.__nabadAckDmThreadDelivered;
  if (typeof hook === "function") return hook(tid);
  const token = globalThis.__nabadGetAuthToken?.() || "";
  if (!token) return Promise.resolve();
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  const bypass = globalThis.__VERCEL_PROTECTION_BYPASS__;
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;
  const base = String(globalThis.__nabadApiBase || "").replace(/\/$/, "");
  const url = base ? `${base}/api/messages` : "/api/messages";
  return fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "mark_thread_delivered", threadId: tid }),
  }).catch(() => {});
}

function maybeAckDmDeliveryFromPush(raw) {
  const payload = normalizePushPayload(raw);
  if (payload.category !== "dm_message") return;
  const tid = String(payload.entityId || "").trim();
  if (tid) void ackDmThreadDeliveredFromPush(tid);
}

function attachForegroundGenerationPushFilter(OneSignal) {
  if (!OneSignal?.Notifications?.addEventListener) return;
  OneSignal.Notifications.addEventListener("foregroundWillDisplay", (event) => {
    try {
      const notif = event?.notification || event?.getNotification?.() || event;
      maybeAckDmDeliveryFromPush(notif);
      if (!shouldSuppressForegroundGenerationPush(notif)) return;
      if (typeof event.preventDefault === "function") event.preventDefault();
    } catch {}
  });
}

export function consumePendingPushRoute() {
  try {
    const route = String(sessionStorage.getItem(PENDING_PUSH_ROUTE_KEY) || "").trim();
    sessionStorage.removeItem(PENDING_PUSH_ROUTE_KEY);
    return route.replace(/^\/+/, "");
  } catch {
    return "";
  }
}

export function peekPendingPushRoute() {
  try {
    return String(sessionStorage.getItem(PENDING_PUSH_ROUTE_KEY) || "").trim().replace(/^\/+/, "");
  } catch {
    return "";
  }
}

export function configurePushFromPublicConfig(appId) {
  _appId = String(appId || "").trim();
}

function pushConfigured() {
  return Boolean(_appId);
}

function getOneSignalWeb() {
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

function useNativePush() {
  return isNativeAppShell() && pushConfigured();
}

function nativePlatform() {
  try {
    return globalThis.Capacitor?.getPlatform?.() === "android" ? "android" : "ios";
  } catch {
    return "ios";
  }
}

async function getNativeOneSignal() {
  if (_nativeOneSignal) return _nativeOneSignal;
  const mod = await import("../vendor/onesignal/index.js");
  _nativeOneSignal = mod.default;
  return _nativeOneSignal;
}

function nativePermToWeb(perm) {
  if (perm === 2 || perm === 3 || perm === 4) return "granted";
  if (perm === 1) return "denied";
  return "default";
}

async function refreshNativePushState() {
  if (!useNativePush()) return;
  try {
    const OneSignal = await getNativeOneSignal();
    const perm = await OneSignal.Notifications.permissionNative();
    _nativePermState = nativePermToWeb(perm);
    _nativeOptedIn = Boolean(await OneSignal.User.pushSubscription.getOptedInAsync());
  } catch (e) {
    console.warn("[push] refresh native state failed", e);
  }
}

function navigateFromPushData(raw) {
  maybeAckDmDeliveryFromPush(raw);
  const hashPath = stashPendingPushPayload(raw);
  if (!hashPath) return;
  const hash = `#/${hashPath.replace(/^\/+/, "")}`;
  if (location.hash !== hash) location.hash = hash;
  try {
    globalThis.__nabadNavigateFromPush?.(hashPath);
  } catch {
    globalThis.__nabadApplyRoute?.();
  }
}

export function isPushAvailable() {
  if (useNativePush()) return true;
  if (isNativeAppShell()) return false;
  return pushConfigured() && typeof Notification !== "undefined";
}

export function getPushPermissionState() {
  if (useNativePush()) return _nativePermState;
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
  if (useNativePush()) return _nativeOptedIn;
  try {
    const OneSignal = getOneSignalWeb();
    return Boolean(OneSignal?.User?.PushSubscription?.optedIn);
  } catch {
    return false;
  }
}

function waitForOneSignalWebReady() {
  return new Promise((resolve) => {
    if (getOneSignalWeb()?.User) {
      resolve(getOneSignalWeb());
      return;
    }
    const deferred = globalThis.OneSignalDeferred || (globalThis.OneSignalDeferred = []);
    deferred.push(async (OneSignal) => resolve(OneSignal));
  });
}

async function ensureWebPushOptedIn() {
  const OneSignal = getOneSignalWeb();
  if (!OneSignal?.User?.PushSubscription?.optIn) return false;
  if (OneSignal.User.PushSubscription.optedIn) return true;
  try {
    await OneSignal.User.PushSubscription.optIn();
  } catch (e) {
    console.warn("[push] optIn failed", e);
  }
  return Boolean(OneSignal.User.PushSubscription.optedIn);
}

function waitForWebPushSubscriptionId(timeoutMs = 12000) {
  const OneSignal = getOneSignalWeb();
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

async function waitForNativePushSubscriptionId(timeoutMs = 12000) {
  const OneSignal = await getNativeOneSignal();
  const immediate = String(await OneSignal.User.pushSubscription.getIdAsync() || "").trim();
  if (immediate) return immediate;

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
    const poll = setInterval(async () => {
      try {
        const id = String(await OneSignal.User.pushSubscription.getIdAsync() || "").trim();
        if (id) finish(id);
      } catch {}
    }, 350);
    OneSignal.User.pushSubscription.addEventListener("change", (ev) => {
      const id = String(ev?.current?.id || "").trim();
      if (id) finish(id);
    });
  });
}

async function initNativePushNotifications() {
  if (!pushConfigured() || !isNativeAppShell()) return false;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    try {
      const OneSignal = await getNativeOneSignal();
      await OneSignal.initialize(_appId);

      OneSignal.Notifications.addEventListener("click", (event) => {
        try {
          navigateFromPushData(event);
        } catch {}
      });

      attachForegroundGenerationPushFilter(OneSignal);

      OneSignal.Notifications.addEventListener("permissionChange", () => {
        void refreshNativePushState();
      });

      OneSignal.User.pushSubscription.addEventListener("change", async (ev) => {
        _nativeOptedIn = Boolean(ev?.current?.optedIn);
        const id = String(ev?.current?.id || "").trim();
        if (id && _linkedUserId) await registerSubscriptionWithBackend(id, nativePlatform());
      });

      await refreshNativePushState();
      return true;
    } catch (e) {
      console.warn("[push] native init failed", e);
      return false;
    }
  })();
  return _initPromise;
}

async function initWebPushNotifications() {
  if (!pushConfigured() || isNativeAppShell()) return false;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    try {
      const OneSignal = await waitForOneSignalWebReady();
      await OneSignal.init({
        appId: _appId,
        serviceWorkerPath: "/OneSignalSDKWorker.js",
        serviceWorkerUpdaterPath: "/OneSignalSDKUpdaterWorker.js",
        allowLocalhostAsSecureOrigin: true,
        notifyButton: { enable: false },
      });
      OneSignal.Notifications.addEventListener("click", (event) => {
        try {
          navigateFromPushData(event);
        } catch {}
      });
      attachForegroundGenerationPushFilter(OneSignal);
      return true;
    } catch (e) {
      console.warn("[push] init failed", e);
      return false;
    }
  })();
  return _initPromise;
}

export async function initPushNotifications() {
  if (!pushConfigured()) return false;
  if (isNativeAppShell()) return initNativePushNotifications();
  return initWebPushNotifications();
}

async function registerSubscriptionWithBackend(subscriptionId, platform = "web") {
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
      body: JSON.stringify({ subscriptionId, platform }),
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

function bindWebPushSubscriptionListener(uid) {
  try {
    const OneSignal = getOneSignalWeb();
    OneSignal.User?.PushSubscription?.addEventListener?.("change", async (ev) => {
      const next = String(ev?.current?.id || OneSignal.User?.PushSubscription?.id || "").trim();
      if (next && _linkedUserId === uid) await registerSubscriptionWithBackend(next, "web");
    });
  } catch {}
}

export async function syncPushAuth(userId) {
  const uid = String(userId || "").trim().toLowerCase();
  if (!uid || !pushConfigured()) return;
  if (isNativeAppShell()) {
    await initNativePushNotifications();
    try {
      const OneSignal = await getNativeOneSignal();
      if (_linkedUserId && _linkedUserId !== uid) {
        await logoutPushAuth({ skipBackend: true });
      }
      await OneSignal.login(uid);
      _linkedUserId = uid;
      await refreshNativePushState();
      if (_nativePermState === "granted") {
        await OneSignal.User.pushSubscription.optIn();
        await refreshNativePushState();
        const subId = String(await OneSignal.User.pushSubscription.getIdAsync() || "").trim();
        if (subId) await registerSubscriptionWithBackend(subId, nativePlatform());
      }
    } catch (e) {
      console.warn("[push] sync native auth failed", e);
    }
    return;
  }
  await initWebPushNotifications();
  try {
    const OneSignal = getOneSignalWeb();
    if (!OneSignal?.login) return;
    if (_linkedUserId && _linkedUserId !== uid) {
      await logoutPushAuth({ skipBackend: true });
    }
    await OneSignal.login(uid);
    _linkedUserId = uid;
    bindWebPushSubscriptionListener(uid);
    if (getPushPermissionState() === "granted") {
      await ensureWebPushOptedIn();
      const subId = String(OneSignal.User?.PushSubscription?.id || "").trim();
      if (subId) await registerSubscriptionWithBackend(subId, "web");
    }
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

export async function refreshPushRegistration(userId) {
  const uid = String(userId || "").trim().toLowerCase();
  if (!uid || !pushConfigured()) return { ok: false };
  await initPushNotifications();
  try {
    if (isNativeAppShell()) {
      const OneSignal = await getNativeOneSignal();
      await OneSignal.login(uid);
      _linkedUserId = uid;
      await refreshNativePushState();
      if (_nativePermState === "granted") {
        await OneSignal.User.pushSubscription.optIn();
      }
      const subId = await waitForNativePushSubscriptionId(5000);
      if (subId) await registerSubscriptionWithBackend(subId, nativePlatform());
      return { ok: Boolean(subId), subscriptionId: subId || "" };
    }
    const OneSignal = getOneSignalWeb();
    if (!OneSignal?.login) return { ok: false };
    await OneSignal.login(uid);
    _linkedUserId = uid;
    bindWebPushSubscriptionListener(uid);
    if (getPushPermissionState() === "granted") {
      await ensureWebPushOptedIn();
    }
    const subId = await waitForWebPushSubscriptionId(5000);
    if (subId) await registerSubscriptionWithBackend(subId, "web");
    return { ok: Boolean(subId), subscriptionId: subId || "" };
  } catch (e) {
    console.warn("[push] refresh registration failed", e);
    return { ok: false };
  }
}

/** Must be called from a user tap (Settings button, etc.). */
export async function enablePushNotifications(userId) {
  const uid = String(userId || _linkedUserId || "").trim().toLowerCase();
  if (!uid || !pushConfigured()) {
    return { ok: false, reason: "not_configured" };
  }

  await initPushNotifications();

  if (isNativeAppShell()) {
    const OneSignal = await getNativeOneSignal();
    if (_linkedUserId !== uid) {
      await syncPushAuth(uid);
    }
    await refreshNativePushState();
    if (_nativePermState === "denied") {
      return { ok: false, state: "denied" };
    }
    if (_nativePermState !== "granted") {
      try {
        const accepted = await OneSignal.Notifications.requestPermission(false);
        await refreshNativePushState();
        if (!accepted && _nativePermState !== "granted") {
          return { ok: false, state: _nativePermState, reason: "permission_declined" };
        }
      } catch (e) {
        console.warn("[push] native permission request failed", e);
        await refreshNativePushState();
        return { ok: false, state: _nativePermState, reason: "request_failed" };
      }
    }
    await OneSignal.User.pushSubscription.optIn();
    await refreshNativePushState();
    const subId = await waitForNativePushSubscriptionId(12000);
    if (subId) {
      await registerSubscriptionWithBackend(subId, nativePlatform());
      return { ok: true, state: "granted", subscriptionId: subId };
    }
    if (isPushOptedIn()) {
      return { ok: true, state: "granted", reason: "subscription_pending" };
    }
    return { ok: false, state: _nativePermState, reason: "subscription_failed" };
  }

  const OneSignal = getOneSignalWeb();
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
  bindWebPushSubscriptionListener(uid);

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

  await ensureWebPushOptedIn();

  const subId = await waitForWebPushSubscriptionId(12000);
  if (subId) {
    await registerSubscriptionWithBackend(subId, "web");
    return { ok: true, state: "granted", subscriptionId: subId };
  }

  if (isPushOptedIn()) {
    return { ok: true, state: "granted", reason: "subscription_pending" };
  }

  return { ok: false, state: getPushPermissionState(), reason: "subscription_failed" };
}

export async function maybePromptPushAfterLogin(userId) {
  if (!pushConfigured() || !userId) return;
  if (getPushPermissionState() !== "default") return;
  try {
    if (localStorage.getItem("nabad_push_prompt_v1") === "1") return;
    localStorage.setItem("nabad_push_prompt_v1", "1");
  } catch {}
  const msg = isNativeAppShell() || isIosStandalonePwa()
    ? "Tap Settings → Push alerts to enable."
    : "Enable push alerts in Settings.";
  try {
    globalThis.__nabadShowToast?.(msg, { icon: "🔔", durationMs: 5200 });
  } catch {}
}

export async function logoutPushAuth({ skipBackend = false } = {}) {
  if (!pushConfigured()) return;
  try {
    if (isNativeAppShell()) {
      const OneSignal = await getNativeOneSignal();
      const subId = String(await OneSignal.User.pushSubscription.getIdAsync() || "").trim();
      if (!skipBackend && subId) await unregisterSubscriptionFromBackend(subId);
      await OneSignal.logout();
    } else {
      const OneSignal = getOneSignalWeb();
      const subId = OneSignal?.User?.PushSubscription?.id;
      if (!skipBackend && subId) await unregisterSubscriptionFromBackend(String(subId));
      await OneSignal?.logout?.();
    }
  } catch {}
  _linkedUserId = "";
  _nativeOptedIn = false;
}
