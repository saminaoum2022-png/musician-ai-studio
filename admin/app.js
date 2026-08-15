const SESSION_KEY = "nabad_admin_session_v1";
const AUTH_PKCE_KEY = "nabad_admin_pkce_v1";
const AUTH_PENDING_KEY = "nabad_admin_oauth_pending_v1";
const PKCE_COOKIE = "nabad_admin_pkce";
const PENDING_COOKIE = "nabad_admin_oauth_pending";
/** OAuth callback — must stay on www so PKCE storage matches after Google redirect. */
const ADMIN_OAUTH_REDIRECT = "https://www.nabadai.com/admin/";
const ADMIN_PAGE_PATH = "/admin/";
const MARKETING_SITE_ORIGIN = "https://www.nabadai.com";
const PAGE_SIZE = 50;

const state = {
  config: null,
  session: null,
  adminSession: null,
  view: "overview",
  offset: 0,
  userSearch: "",
  billingSearch: "",
  userDetailId: "",
  generationDetailId: "",
  returnView: "users",
  grantPrefillEmail: "",
  marketingLocale: "en",
  marketingPage: "home",
  marketingDraft: null,
  marketingHeroBlobUrl: "",
  marketingHeroUploading: false,
  marketingDraftPreviewWindow: null,
  marketingDraftPreviewPayload: null,
  cache: {},
  recoveryTokenHash: "",
};

const els = {
  loginScreen: document.getElementById("loginScreen"),
  appShell: document.getElementById("appShell"),
  loginForm: document.getElementById("loginForm"),
  loginEmail: document.getElementById("loginEmail"),
  loginPassword: document.getElementById("loginPassword"),
  btnLoginGoogle: document.getElementById("btnLoginGoogle"),
  loginError: document.getElementById("loginError"),
  resetScreen: document.getElementById("resetScreen"),
  resetForm: document.getElementById("resetForm"),
  resetPassword: document.getElementById("resetPassword"),
  resetPasswordConfirm: document.getElementById("resetPasswordConfirm"),
  resetError: document.getElementById("resetError"),
  btnResetPassword: document.getElementById("btnResetPassword"),
  btnLogin: document.getElementById("btnLogin"),
  btnSignOut: document.getElementById("btnSignOut"),
  btnRefresh: document.getElementById("btnRefresh"),
  adminUserEmail: document.getElementById("adminUserEmail"),
  adminRoleBadge: document.getElementById("adminRoleBadge"),
  pageTitle: document.getElementById("pageTitle"),
  pageSub: document.getElementById("pageSub"),
  globalError: document.getElementById("globalError"),
  panels: {
    overview: document.getElementById("viewOverview"),
    providers: document.getElementById("viewProviders"),
    users: document.getElementById("viewUsers"),
    user: document.getElementById("viewUser"),
    generation: document.getElementById("viewGeneration"),
    credits: document.getElementById("viewCredits"),
    marketing: document.getElementById("viewMarketing"),
    promos: document.getElementById("viewPromos"),
    singers: document.getElementById("viewSingers"),
    generations: document.getElementById("viewGenerations"),
    publications: document.getElementById("viewPublications"),
    subscriptions: document.getElementById("viewSubscriptions"),
    billing: document.getElementById("viewBilling"),
    settings: document.getElementById("viewSettings"),
  },
  navItems: [...document.querySelectorAll(".navItem")],
};

const VIEW_META = {
  overview: { title: "Overview", sub: "Platform health at a glance" },
  providers: { title: "Providers", sub: "Vendor spend, API health, and top-up tracking" },
  users: { title: "Users", sub: "Signups, activity, balances, and songs" },
  user: { title: "User detail", sub: "Credits, subscription, billing, and activity" },
  generation: { title: "Generation detail", sub: "Prompt, status, credits, and saved output" },
  credits: { title: "Credits", sub: "Grant paid credits and view every ledger entry" },
  marketing: { title: "Marketing", sub: "Edit homepage and SEO landing pages (English + Arabic)" },
  promos: { title: "Promo codes", sub: "Create and monitor redemption codes" },
  singers: { title: "Pro singers", sub: "Singer applications, roster, and performance requests" },
  generations: { title: "Generations", sub: "Song and audio generation requests" },
  publications: { title: "Publications", sub: "Public profile posts — moderation view (not friends-only)" },
  subscriptions: { title: "Subscriptions", sub: "NabadAi Pro status by user" },
  billing: { title: "Billing events", sub: "Subscription and IAP credit grants from webhooks" },
  settings: { title: "Team & roles", sub: "Invite coworkers and control dashboard access" },
};

function fmtNum(n, digits = 0) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtUsd(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

/** Compact one-line date for table cells — avoids wide rows. */
function fmtDateCompact(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "2-digit" }),
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function dateCell(iso) {
  const label = fmtDateCompact(iso);
  return `<td class="dateCell" title="${escapeHtml(fmtDate(iso))}">${label}</td>`;
}

function fmtReason(reason) {
  const map = {
    promo_redeem: "Promo code",
    signup_welcome: "Welcome bonus",
    full_song: "Song generation",
    paid_purchase: "Paid / admin grant",
    refund_full_song: "Refund",
    stems: "Stems",
    persona: "Persona",
    sound: "Sound",
  };
  return map[reason] || String(reason || "—").replace(/_/g, " ");
}

function fmtSignupPlatform(platform) {
  const map = {
    web: "Website",
    ios: "iOS app",
    android: "Android app",
  };
  return map[String(platform || "").toLowerCase()] || "—";
}

function signupPlatformBadgeClass(platform) {
  const p = String(platform || "").toLowerCase();
  if (p === "web") return "platformWeb";
  if (p === "ios") return "platformIos";
  if (p === "android") return "platformAndroid";
  return "none";
}

function userNameCell(u) {
  const pending = u.profilePending
    ? ` <span class="badge pending">pending</span>`
    : "";
  return `<strong>${escapeHtml(u.name || "—")}</strong> <span class="cellMuted">@${escapeHtml(u.username || "—")}</span>${pending}`;
}

function showError(msg) {
  if (!msg) {
    els.globalError.hidden = true;
    els.globalError.textContent = "";
    return;
  }
  els.globalError.hidden = false;
  els.globalError.textContent = msg;
}

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.access_token) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(sess) {
  state.session = sess;
  if (!sess) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(sess));
}

function setOAuthMarkers(verifier = "") {
  if (verifier) {
    localStorage.setItem(AUTH_PKCE_KEY, verifier);
    try {
      sessionStorage.setItem(AUTH_PKCE_KEY, verifier);
    } catch {}
  }
  localStorage.setItem(AUTH_PENDING_KEY, String(Date.now()));
  const secure = location.protocol === "https:" ? "; Secure" : "";
  const domain = /\.?nabadai\.com$/i.test(location.hostname) ? "; Domain=.nabadai.com" : "";
  if (verifier) {
    document.cookie = `${PKCE_COOKIE}=${encodeURIComponent(verifier)}; Path=/; Max-Age=600; SameSite=Lax${secure}${domain}`;
  }
  document.cookie = `${PENDING_COOKIE}=1; Path=/; Max-Age=600; SameSite=Lax${secure}${domain}`;
}

function hasOAuthPending() {
  if (localStorage.getItem(AUTH_PENDING_KEY) || localStorage.getItem(AUTH_PKCE_KEY)) return true;
  return /(?:^|; )nabad_admin_oauth_pending=/.test(document.cookie);
}

function clearOAuthMarkers() {
  localStorage.removeItem(AUTH_PKCE_KEY);
  localStorage.removeItem(AUTH_PENDING_KEY);
  try {
    sessionStorage.removeItem(AUTH_PKCE_KEY);
  } catch {}
  const domain = /\.?nabadai\.com$/i.test(location.hostname) ? "; Domain=.nabadai.com" : "";
  document.cookie = `${PKCE_COOKIE}=; Path=/; Max-Age=0${domain}`;
  document.cookie = `${PENDING_COOKIE}=; Path=/; Max-Age=0${domain}`;
}

function showLoginError(msg) {
  if (!els.loginError) return;
  if (!msg) {
    els.loginError.hidden = true;
    els.loginError.textContent = "";
    return;
  }
  els.loginError.hidden = false;
  els.loginError.textContent = msg;
}

function showResetError(msg) {
  if (!els.resetError) return;
  if (!msg) {
    els.resetError.hidden = true;
    els.resetError.textContent = "";
    return;
  }
  els.resetError.hidden = false;
  els.resetError.textContent = msg;
}

function parseRecoveryCallback() {
  try {
    const search = new URLSearchParams(window.location.search || "");
    const type = search.get("type") || "";
    const tokenHash = search.get("token_hash") || "";
    if (type === "recovery" && tokenHash) {
      return { tokenHash, type };
    }
    const hash = String(window.location.hash || "").replace(/^#/, "");
    if (hash.includes("type=recovery")) {
      const hashQs = new URLSearchParams(hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : hash);
      const hType = hashQs.get("type") || "";
      const hToken = hashQs.get("token_hash") || "";
      if (hType === "recovery" && hToken) return { tokenHash: hToken, type: hType };
    }
  } catch {}
  return null;
}

async function verifyRecoveryToken(tokenHash) {
  const { supabaseUrl, supabaseAnonKey } = state.config;
  const r = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "recovery", token_hash: tokenHash }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.msg || data?.message || "Recovery link expired — request a new one");
  }
  return data;
}

async function updateUserPassword(accessToken, password) {
  const { supabaseUrl, supabaseAnonKey } = state.config;
  const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(data?.error_description || data?.msg || data?.message || "Could not save password");
  }
}

function showResetScreen() {
  if (els.loginScreen) els.loginScreen.hidden = true;
  if (els.appShell) els.appShell.hidden = true;
  if (els.resetScreen) els.resetScreen.hidden = false;
}

function oauthRedirectTarget() {
  try {
    const { origin, hostname } = window.location;
    if (hostname.includes("nabadai.com")) return ADMIN_OAUTH_REDIRECT;
    if (hostname.includes("localhost") || hostname.includes("127.0.0.1")) {
      return `${origin}${ADMIN_PAGE_PATH}`;
    }
    if (hostname.includes("vercel.app")) {
      return `${origin}${ADMIN_PAGE_PATH}`;
    }
  } catch {}
  return ADMIN_OAUTH_REDIRECT;
}

function clearOAuthCallbackFromUrl() {
  try {
    window.history.replaceState({}, document.title, ADMIN_PAGE_PATH);
  } catch {}
}

function parseOAuthCallback() {
  const out = { code: "", error: "", accessToken: "", refreshToken: "", expiresIn: 3600 };
  try {
    const search = new URLSearchParams(window.location.search || "");
    out.code = search.get("code") || "";
    out.error =
      search.get("error_description") ||
      search.get("error") ||
      "";
    const hash = String(window.location.hash || "").replace(/^#/, "");
    if (hash) {
      const tokenPart = hash.includes("access_token=")
        ? hash.slice(hash.indexOf("access_token="))
        : hash;
      const hashQs = new URLSearchParams(
        tokenPart.includes("?") ? tokenPart.slice(tokenPart.indexOf("?") + 1) : tokenPart,
      );
      out.code = out.code || hashQs.get("code") || "";
      out.error = out.error || hashQs.get("error_description") || hashQs.get("error") || "";
      out.accessToken = hashQs.get("access_token") || "";
      out.refreshToken = hashQs.get("refresh_token") || "";
      out.expiresIn = Number(hashQs.get("expires_in") || 3600);
    }
  } catch {}
  return out;
}

function sessionFromTokenPayload(data, fallbackEmail = "") {
  const email =
    String(data?.user?.email || data?.email || fallbackEmail || "")
      .trim()
      .toLowerCase();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + Number(data.expires_in || 3600) * 1000,
    email,
  };
}

async function exchangeOAuthCodeForSession(code) {
  const r = await fetch("/api/admin/oauth-exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ code }),
  });
  const payload = await r.json().catch(() => ({}));
  if (!r.ok || !payload?.access_token) {
    throw new Error(payload?.error || "Google sign-in failed — tap Continue with Google again");
  }
  clearOAuthMarkers();
  writeSession(sessionFromTokenPayload(payload));
  return true;
}

function finishOAuthSession(data) {
  clearOAuthMarkers();
  writeSession(sessionFromTokenPayload(data));
}

async function maybeHandleAuthCallback() {
  const parsed = parseOAuthCallback();
  if (parsed.error) {
    throw new Error(decodeURIComponent(String(parsed.error).replace(/\+/g, " ")));
  }
  if (parsed.accessToken) {
    finishOAuthSession({
      access_token: parsed.accessToken,
      refresh_token: parsed.refreshToken,
      expires_in: parsed.expiresIn,
    });
    await hydrateSessionEmail();
    clearOAuthCallbackFromUrl();
    return true;
  }
  if (!parsed.code) return false;
  await exchangeOAuthCodeForSession(parsed.code);
  clearOAuthCallbackFromUrl();
  return true;
}

function maybeShowInterruptedOAuthError() {
  if (!hasOAuthPending()) return;
  const pending = Number(localStorage.getItem(AUTH_PENDING_KEY) || 0);
  const ageMs = pending ? Date.now() - pending : 0;
  if (pending && (!Number.isFinite(ageMs) || ageMs > 10 * 60 * 1000)) {
    clearOAuthMarkers();
    return;
  }
  const parsed = parseOAuthCallback();
  if (parsed.code || parsed.accessToken || parsed.error) return;
  clearOAuthMarkers();
  showLoginError(
    "Google sign-in returned without credentials. Hard-refresh, try Chrome, or use email + password.",
  );
}

async function hydrateSessionEmail() {
  if (!state.session?.access_token || !state.config) return;
  const { supabaseUrl, supabaseAnonKey } = state.config;
  try {
    const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${state.session.access_token}`,
      },
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data?.email) {
      writeSession({
        ...state.session,
        email: String(data.email).trim().toLowerCase(),
      });
    }
  } catch {}
}

async function signInWithGoogle() {
  setOAuthMarkers();
  const r = await fetch("/api/admin/oauth-start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ redirect_to: oauthRedirectTarget() }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data?.url) {
    throw new Error(data?.error || "Could not start Google sign-in");
  }
  window.location.assign(data.url);
}

async function loadConfig() {
  const r = await fetch("/api/public-config");
  if (!r.ok) throw new Error("Could not load app config");
  const data = await r.json();
  if (!data?.supabaseUrl || !data?.supabaseAnonKey) {
    throw new Error("Supabase config missing on server");
  }
  state.config = data;
  return data;
}

async function signIn(email, password) {
  const { supabaseUrl, supabaseAnonKey } = state.config;
  const r = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(data?.error_description || data?.msg || data?.message || "Sign in failed");
  }
  writeSession(sessionFromTokenPayload(data, email));
  await hydrateSessionEmail();
}

async function refreshSessionIfNeeded() {
  if (!state.session?.refresh_token) return false;
  if (state.session.expires_at && state.session.expires_at > Date.now() + 60_000) return true;
  const { supabaseUrl, supabaseAnonKey } = state.config;
  const r = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: state.session.refresh_token }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return false;
  writeSession({
    ...state.session,
    access_token: data.access_token,
    refresh_token: data.refresh_token || state.session.refresh_token,
    expires_at: Date.now() + Number(data.expires_in || 3600) * 1000,
  });
  return true;
}

async function adminFetch(view, { offset = 0, limit = PAGE_SIZE, search = "", userId = "", generationId = "", healthRefresh = false } = {}) {
  await refreshSessionIfNeeded();
  const token = state.session?.access_token;
  if (!token) throw new Error("Not signed in");
  const apiView = view === "suno" ? "providers" : view;
  const qs = new URLSearchParams({ view: apiView, limit: String(limit), offset: String(offset) });
  const trimmedSearch = String(search || "").trim();
  if (trimmedSearch.length >= 2) qs.set("search", trimmedSearch);
  const trimmedUserId = String(userId || "").trim();
  if (trimmedUserId) qs.set("userId", trimmedUserId);
  const trimmedGenerationId = String(generationId || "").trim();
  if (trimmedGenerationId) qs.set("generationId", trimmedGenerationId);
  if (healthRefresh) qs.set("healthRefresh", "1");
  const r = await fetch(`/api/music/admin?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) {
    writeSession(null);
    throw new Error("Session expired — sign in again");
  }
  if (r.status === 403) {
    const who = state.session?.email ? ` (${state.session.email})` : "";
    throw new Error(data?.error || `You do not have access to this section${who}.`);
  }
  if (!r.ok) {
    throw new Error(data?.error || `Request failed (${r.status})`);
  }
  return data;
}

async function marketingAdminFetch(page = "home", locale = "en") {
  await refreshSessionIfNeeded();
  const token = state.session?.access_token;
  if (!token) throw new Error("Not signed in");
  const qs = new URLSearchParams({ page, locale });
  const r = await fetch(`/api/admin/marketing?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) {
    writeSession(null);
    throw new Error("Session expired — sign in again");
  }
  if (r.status === 403) throw new Error(data?.error || "You cannot edit marketing content.");
  if (!r.ok) throw new Error(data?.error || `Request failed (${r.status})`);
  return data;
}

async function marketingAdminSave({ page, locale, content }) {
  await refreshSessionIfNeeded();
  const token = state.session?.access_token;
  if (!token) throw new Error("Not signed in");
  const r = await fetch("/api/admin/marketing", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ page, locale, content }),
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) {
    writeSession(null);
    throw new Error("Session expired — sign in again");
  }
  if (!r.ok) throw new Error(data?.error || `Save failed (${r.status})`);
  return data;
}

async function marketingAdminUploadImage(file) {
  await refreshSessionIfNeeded();
  const token = state.session?.access_token;
  if (!token) throw new Error("Not signed in");
  const dataBase64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
  const contentType = inferMarketingImageContentType(file);
  const r = await fetch("/api/admin/marketing", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filename: file.name || "hero",
      contentType,
      dataBase64,
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || `Upload failed (${r.status})`);
  if (!data.url) throw new Error("Upload succeeded but no image URL was returned.");
  return data;
}

function inferMarketingImageContentType(file) {
  const type = String(file?.type || "").toLowerCase();
  if (/^image\/(jpeg|png|webp)$/.test(type)) return type;
  const name = String(file?.name || "").toLowerCase();
  if (name.includes(".webp")) return "image/webp";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return "image/jpeg";
}

function revokeMarketingHeroBlobUrl() {
  if (state.marketingHeroBlobUrl) {
    try { URL.revokeObjectURL(state.marketingHeroBlobUrl); } catch { /* ignore */ }
    state.marketingHeroBlobUrl = "";
  }
}

function getMarketingHeroDraftUrl() {
  const field = String(document.getElementById("mkHeroImageUrl")?.value || "").trim();
  if (field && !field.startsWith("blob:")) return field;
  return "";
}

function getMarketingHeroPreviewUrl() {
  const draft = getMarketingHeroDraftUrl();
  if (draft) return draft;
  return state.marketingHeroBlobUrl || "";
}

function sendMarketingDraftToPreviewWindow(win, payload) {
  if (!win || win.closed || !payload) return false;
  try {
    win.postMessage({ type: "nabad-marketing-draft", payload }, MARKETING_SITE_ORIGIN);
    return true;
  } catch {
    return false;
  }
}

async function loadAdminSession({ force = false } = {}) {
  if (!force && state.adminSession) return state.adminSession;
  const data = await adminFetch("session");
  state.adminSession = data.session || null;
  if (Array.isArray(data.roles)) state.adminSession.roles = data.roles;
  applyNavPermissions();
  return state.adminSession;
}

function canAccessView(view) {
  const allowed = state.adminSession?.allowedViews;
  if (!Array.isArray(allowed) || !allowed.length) return true;
  if (view === "user") return allowed.includes("user") || allowed.includes("users");
  if (view === "generation") return allowed.includes("generation") || allowed.includes("generations");
  if (view === "providers" || view === "suno") return allowed.includes("providers") || allowed.includes("suno");
  return allowed.includes(view);
}

function openUserDetail(userId, returnView = "users") {
  const uid = String(userId || "").trim();
  if (!uid) return;
  state.userDetailId = uid;
  state.returnView = returnView || "users";
  state.view = "user";
  state.offset = 0;
  const meta = VIEW_META.user;
  els.pageTitle.textContent = meta.title;
  els.pageSub.textContent = meta.sub;
  for (const btn of els.navItems) {
    btn.classList.toggle("isActive", false);
  }
  for (const [key, panel] of Object.entries(els.panels)) {
    panel.hidden = key !== "user";
  }
  void loadView({ force: true });
}

function openGenerationDetail(generationId, returnView = "generations") {
  const gid = String(generationId || "").trim();
  if (!gid) return;
  state.generationDetailId = gid;
  state.returnView = returnView || "generations";
  state.view = "generation";
  state.offset = 0;
  const meta = VIEW_META.generation;
  els.pageTitle.textContent = meta.title;
  els.pageSub.textContent = meta.sub;
  for (const btn of els.navItems) {
    btn.classList.toggle("isActive", false);
  }
  for (const [key, panel] of Object.entries(els.panels)) {
    panel.hidden = key !== "generation";
  }
  void loadView({ force: true });
}

function applyNavPermissions() {
  const session = state.adminSession;
  const allowed = new Set(Array.isArray(session?.allowedViews) ? session.allowedViews : []);
  for (const btn of els.navItems) {
    const view = btn.dataset.view;
    const ok = !allowed.size || allowed.has(view);
    btn.hidden = !ok;
    btn.disabled = !ok;
  }
  const settingsGroup = document.querySelector('[data-nav-group="settings"]');
  if (settingsGroup) {
    settingsGroup.hidden = !session?.canManageTeam;
  }
  if (els.adminRoleBadge) {
    if (session?.roleLabel) {
      els.adminRoleBadge.hidden = false;
      els.adminRoleBadge.textContent = session.isOwner
        ? `${session.roleLabel} · Owner`
        : session.roleLabel;
      els.adminRoleBadge.className = `adminRoleBadge role-${session.role || "admin"}`;
    } else {
      els.adminRoleBadge.hidden = true;
    }
  }
}

function viewCacheKey() {
  let key = `${state.view}:${state.offset}`;
  if (state.view === "users" && state.userSearch.trim().length >= 2) {
    key += `:${state.userSearch.trim().toLowerCase()}`;
  }
  if (state.view === "billing" && state.billingSearch.trim().length >= 2) {
    key += `:${state.billingSearch.trim().toLowerCase()}`;
  }
  if (state.view === "user" && state.userDetailId) {
    key += `:uid:${state.userDetailId}`;
  }
  if (state.view === "generation" && state.generationDetailId) {
    key += `:gid:${state.generationDetailId}`;
  }
  if (state.view === "marketing") {
    key += `:pg:${state.marketingPage || "home"}:loc:${state.marketingLocale || "en"}`;
  }
  return key;
}

function firstAllowedView() {
  const order = ["overview", "providers", "users", "generations", "publications", "marketing", "credits", "promos", "singers", "subscriptions", "billing", "settings"];
  for (const view of order) {
    if (canAccessView(view)) return view;
  }
  return "overview";
}

async function teamFetch(path = "", options = {}) {
  await refreshSessionIfNeeded();
  const token = state.session?.access_token;
  if (!token) throw new Error("Not signed in");
  const r = await fetch(`/api/admin/team${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) {
    writeSession(null);
    throw new Error("Session expired — sign in again");
  }
  if (r.status === 403) {
    throw new Error(data?.error || "Only Owner / Admin can manage team access.");
  }
  if (!r.ok) {
    throw new Error(data?.error || `Request failed (${r.status})`);
  }
  return data;
}

function roleBadgeClass(role) {
  return `badge role-${String(role || "user").replace(/[^a-z0-9_-]/gi, "")}`;
}

function fmtPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

function statCard(label, value, sub = "", highlight = false, warn = false) {
  return `
    <div class="statCard${highlight ? " isHighlight" : ""}${warn ? " isWarn" : ""}">
      <div class="statLabel">${label}</div>
      <div class="statValue">${value}</div>
      ${sub ? `<div class="statSub">${sub}</div>` : ""}
    </div>
  `;
}

function adminPageStack(inner, { plain = false } = {}) {
  return `<div class="adminPageStack${plain ? " adminPageStack--plain" : ""}">${inner}</div>`;
}

/** Plain table block — no card chrome (list tabs). */
function listSection({ title = "", note = "", extraHtml = "", tableHtml, pager = "" }) {
  return `
    <section class="listSection">
      ${extraHtml || ""}
      ${title || note ? `<div class="listSectionHead">
        ${title ? `<h3 class="listSectionTitle">${title}</h3>` : ""}
        ${note ? `<p class="listSectionNote">${note}</p>` : ""}
      </div>` : ""}
      <div class="listSectionTable">${tableHtml}</div>
      ${pager ? `<div class="listSectionFoot">${pager}</div>` : ""}
    </section>`;
}

function dataPanel({ title = "", note = "", extraHtml = "", tableHtml, pager = "" }) {
  return `
    <section class="sectionCard sectionCard--data">
      ${title || note ? `<div class="sectionHead">
        ${title ? `<h3 class="sectionTitle">${title}</h3>` : ""}
        ${note ? `<p class="sectionNote">${note}</p>` : ""}
      </div>` : ""}
      ${extraHtml || ""}
      <div class="sectionCardBody sectionCardBody--flush">${tableHtml}</div>
      ${pager ? `<div class="sectionCardFoot">${pager}</div>` : ""}
    </section>`;
}

function renderProSubscriberRows(subscribers) {
  const rows = Array.isArray(subscribers) ? subscribers : [];
  if (!rows.length) {
    return `<p class="sectionNote">No active Pro subscriptions in the database.</p>`;
  }
  const body = rows.map((sub) => {
    const label = sub.username ? `@${sub.username}` : (sub.email || sub.userId || "—");
    const adminNote = sub.isAdmin ? `<span class="badge admin">admin · no liability</span>` : "";
    return `
      <tr>
        <td>${escapeHtml(label)}${adminNote ? `<br>${adminNote}` : ""}</td>
        <td>${escapeHtml(sub.planId || "—")}</td>
        <td><span class="badge ${escapeHtml(sub.status || "none")}">${escapeHtml(sub.status || "—")}</span></td>
        <td>${escapeHtml(sub.provider || "—")}</td>
        <td class="num">${fmtNum(sub.balance, 1)}</td>
        <td class="num">${fmtNum(sub.guaranteed ?? sub.periodCap, 0)}</td>
        <td class="num">${fmtNum(sub.remaining ?? sub.reserved, 1)}</td>
      </tr>`;
  }).join("");
  return `
    <div class="tableWrap proSubTableWrap">
      <table>
        <thead>
          <tr>
            <th>Pro user</th><th>Plan</th><th>Status</th><th>Provider</th>
            <th>Balance</th><th>Guaranteed</th><th>Remaining</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderSunoCoverageSection(s, { compact = false } = {}) {
  const shortfall = Number(s.shortfallCredits || 0);
  const hasShortfall = shortfall > 0;
  const buyUsd = s.shortfallUsd != null ? fmtUsd(s.shortfallUsd) : "—";
  const coverage = s.coveragePct != null ? fmtPct(s.coveragePct) : "—";
  const proCount = Number(s.proSubscriberCount || 0);
  const guaranteed = Number(s.guaranteedCredits ?? s.reservedCredits ?? 0);
  const remaining = Number(s.remainingCredits ?? 0);
  const allOutstanding = Number(s.allUserOutstanding ?? s.userOutstanding ?? 0);
  const title = compact ? "Suno guarantee (Pro subs)" : "Suno guarantee & top-up plan";
  const lead = compact
    ? `${proCount} active Pro · guaranteed upstream backing required at subscribe time.`
    : `When someone subscribes, you guarantee their full plan credits (400 weekly / 1,200 monthly) in your Suno bucket. Top up before the bucket runs low — not after it hits zero.`;
  const topUpAlert = hasShortfall
    ? `<div class="sunoTopUpAlert" role="alert">
        <strong>Top up Suno now:</strong> buy at least <strong>${fmtNum(s.creditsToBuy, 0)} credits</strong> (~${buyUsd}) to fully back your ${proCount} active Pro subscriber${proCount === 1 ? "" : "s"}.
        <a class="providerExtLink" href="https://sunoapi.org/billing" target="_blank" rel="noopener noreferrer">Open sunoapi.org/billing →</a>
      </div>`
    : `<div class="sunoTopUpAlert sunoTopUpAlert--ok" role="status">
        <strong>Suno bucket covers guaranteed Pro liability.</strong> You have headroom for new subs until guaranteed total grows.
        <a class="providerExtLink" href="https://sunoapi.org/billing" target="_blank" rel="noopener noreferrer">Suno billing →</a>
      </div>`;
  return `
    <section class="sectionCard${hasShortfall ? " sectionCard--warn" : ""}">
      <div class="sectionHead">
        <h3 class="sectionTitle">${title}</h3>
        <p class="sectionNote">${lead}</p>
      </div>
      ${topUpAlert}
      <div class="cardsGrid cardsGrid--inSection">
        ${statCard("Guaranteed (Pro commitment)", fmtNum(guaranteed, 0), `${proCount} active Pro · full plan credits owed`, false, hasShortfall)}
        ${statCard("Suno bucket available", fmtNum(s.masterBalance, 1), "Live upstream balance", true)}
        ${statCard("Coverage", coverage, "Suno bucket ÷ guaranteed — aim for 100%+", false, hasShortfall && Number(s.coveragePct) < 100)}
        ${statCard("Buy from Suno now", hasShortfall ? fmtNum(s.creditsToBuy, 0) : "0", hasShortfall ? "Guaranteed − bucket" : "Fully backed", false, hasShortfall)}
        ${statCard("Est. top-up cost", hasShortfall ? buyUsd : fmtUsd(0), s.usdPerCredit ? `@ $${Number(s.usdPerCredit).toFixed(5)}/credit` : "")}
        ${statCard("Headroom", fmtNum(s.headroomEstimate, 1), "Bucket − guaranteed (negative = under-backed)", false, hasShortfall)}
        ${statCard("Still spendable", fmtNum(remaining, 1), "Credits Pro users haven't used yet")}
        ${statCard("All users (incl. test)", fmtNum(allOutstanding, 1), "Not used for guarantee", false, false)}
      </div>
      ${renderProSubscriberRows(s.proSubscribers)}
    </section>
  `;
}

function renderOverview(data) {
  const o = data?.overview || {};
  const s = o.suno || {};
  const u = o.users || {};
  const c = o.credits || {};
  const g = o.generations || {};
  const sub = o.subscriptions || {};
  const rev = o.revenue || {};

  els.panels.overview.innerHTML = adminPageStack(`
    ${renderSunoCoverageSection(s)}
    <section class="sectionCard">
      <div class="sectionHead">
        <h3 class="sectionTitle">Credits &amp; Suno history</h3>
        <p class="sectionNote">All-time totals across the platform.</p>
      </div>
      <div class="cardsGrid cardsGrid--inSection">
        ${statCard("All-time user spend", fmtNum(s.userSpentTotal, 1), "Debited from user balances")}
        ${statCard("Credits issued (all time)", fmtNum(c.issuedTotal, 1), "Grants + subs + promos")}
        ${statCard("Credits used (all time)", fmtNum(c.usedTotal, 1))}
      </div>
    </section>
    <section class="sectionCard">
      <div class="sectionHead">
        <h3 class="sectionTitle">Platform pulse</h3>
        <p class="sectionNote">Live counts for users, billing, and creation today.</p>
      </div>
      <div class="cardsGrid cardsGrid--inSection">
        ${statCard("Total users", fmtNum(u.total))}
        ${statCard("Active today", fmtNum(u.activeToday))}
        ${statCard("New today", fmtNum(u.newToday))}
        ${statCard("Pro subscribers", fmtNum(sub.premiumActive))}
        ${statCard("Credits consumed today", fmtNum(c.consumedToday, 1))}
        ${statCard("Songs saved today", fmtNum(g.songsToday))}
        ${statCard("Published today", fmtNum(g.publishedToday))}
        ${statCard("Failed gens today", fmtNum(g.failedToday))}
        ${statCard("Est. API cost today", fmtUsd(g.apiCostTodayUsd))}
        ${statCard("Est. revenue MTD", fmtUsd(rev.estimatedMtdUsd), rev.note || "")}
      </div>
    </section>
  `);
}

function providerStatusBadge(status) {
  const s = String(status || "unknown").toLowerCase();
  const labels = {
    ok: "OK",
    slow: "Slow",
    down: "Down",
    auth: "Auth error",
    unconfigured: "No key",
    unknown: "Unknown",
  };
  return `<span class="badge providerStatus providerStatus--${s}">${labels[s] || s}</span>`;
}

function providerExtLinks(p) {
  const links = [];
  if (p.topUpUrl) {
    links.push(`<a class="providerExtLink" href="${escapeHtml(p.topUpUrl)}" target="_blank" rel="noopener noreferrer">Top up</a>`);
  }
  if (p.dashboardUrl) {
    const label = p.id === "suno" ? "sunoapi.org" : "Account";
    links.push(`<a class="providerExtLink" href="${escapeHtml(p.dashboardUrl)}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  }
  if (p.docsUrl) {
    links.push(`<a class="providerExtLink" href="${escapeHtml(p.docsUrl)}" target="_blank" rel="noopener noreferrer">Docs</a>`);
  }
  if (p.lyriaDocsUrl) {
    links.push(`<a class="providerExtLink" href="${escapeHtml(p.lyriaDocsUrl)}" target="_blank" rel="noopener noreferrer">Lyria docs</a>`);
  }
  return links.length ? links.join(" · ") : "—";
}

function canLogProviderTopUp() {
  const s = state.adminSession;
  if (!s) return false;
  if (s.isOwner) return true;
  return ["admin", "operations"].includes(String(s.role || "").toLowerCase());
}

function fmtTopUpSummary(spend = {}) {
  const parts = [];
  if (Number(spend.toppedUpCredits) > 0) parts.push(`${fmtNum(spend.toppedUpCredits, 0)} cr`);
  if (Number(spend.toppedUpUsd) > 0) parts.push(fmtUsd(spend.toppedUpUsd));
  return parts.length ? parts.join(" · ") : "—";
}

function renderProviderRows(providers = []) {
  if (!providers.length) {
    return `<tr><td colspan="9" class="loading">No provider data</td></tr>`;
  }
  return providers.map((p) => {
    const spend = p.spend || {};
    const keyLabel = p.envKeys?.length
      ? (p.configured ? "Key set" : `No key (${p.envKeys.join(" or ")})`)
      : "No key needed";
    const flagNote = p.featureFlag != null
      ? (p.featureEnabled ? " · live for users" : " · admin-only")
      : "";
    const latency = p.latencyMs != null ? `${fmtNum(p.latencyMs, 0)} ms` : "";
    const healthDetail = [p.detail, latency].filter(Boolean).join(" · ");
    const balanceSub = spend.balanceDetail || spend.usageNote || "";
    const billingUrl = p.id === "gemini" ? "https://aistudio.google.com/billing" : "";
    const balanceLink = billingUrl && ["dashboard_only", "snapshot", "ledger"].includes(spend.balanceSource)
      ? `<br><a class="providerExtLink" href="${billingUrl}" target="_blank" rel="noopener noreferrer">Open AI Studio Billing →</a>`
      : "";
    const usedAll = spend.tracksUsage
      ? fmtUsd(spend.consumedUsdAll)
      : (spend.consumedUsdAll > 0 ? fmtUsd(spend.consumedUsdAll) : "—");

    return `
      <tr>
        <td>
          <strong>${escapeHtml(p.name)}</strong><br>
          <span class="cellMuted">${escapeHtml(p.role || "")}</span>
        </td>
        <td>
          ${providerStatusBadge(p.status)}<br>
          <span class="cellMuted">${escapeHtml(healthDetail || keyLabel + flagNote)}</span>
        </td>
        <td>
          <strong>${escapeHtml(spend.balanceLabel || "—")}</strong>
          ${balanceSub ? `<br><span class="cellMuted">${escapeHtml(balanceSub)}</span>` : ""}
          ${balanceLink}
        </td>
        <td>${fmtTopUpSummary(spend)}</td>
        <td>${spend.tracksUsage || spend.consumedUsd7d > 0 ? fmtUsd(spend.consumedUsd7d) : "—"}</td>
        <td>${spend.tracksUsage || spend.consumedUsd30d > 0 ? fmtUsd(spend.consumedUsd30d) : "—"}</td>
        <td>${usedAll}</td>
        <td>${fmtNum(p.failures24h || 0, 0)}</td>
        <td class="providerLinksCell">${providerExtLinks(p)}</td>
      </tr>`;
  }).join("");
}

function renderProviderTopUpForm() {
  if (!canLogProviderTopUp()) return "";
  return `
    <section class="sectionCard">
      <div class="sectionHead">
        <h3 class="sectionTitle">Log a top-up</h3>
        <p class="sectionNote">
          <strong>Suno &amp; ElevenLabs</strong> balances above are live from their APIs.
          <strong>Gemini / Lyria</strong> use one Google wallet — Google has no live balance API.
          Log each payment here and the Balance column updates automatically (top-ups − tracked usage).
          Optionally choose <em>Set balance from AI Studio</em> to paste the exact number from Billing.
        </p>
      </div>
      <form id="providerTopUpForm" class="grantForm">
        <label class="field grantField">
          <span>Provider</span>
          <select id="providerTopUpSelect" required>
            <option value="suno">Suno</option>
            <option value="elevenlabs">ElevenLabs</option>
            <option value="gemini">Gemini / Lyria</option>
            <option value="pollinations">Pollinations</option>
          </select>
        </label>
        <label class="field grantField" id="providerTopUpActionWrap" hidden>
          <span>Gemini entry type</span>
          <select id="providerTopUpAction">
            <option value="top_up">Add payment (top-up)</option>
            <option value="balance_snapshot">Set balance from AI Studio</option>
          </select>
        </label>
        <label class="field grantField grantField--amount">
          <span id="providerTopUpUsdLabel">USD</span>
          <input id="providerTopUpUsd" type="number" min="0" step="0.01" placeholder="49.00" />
        </label>
        <label class="field grantField grantField--amount" id="providerTopUpCreditsWrap">
          <span>Credits</span>
          <input id="providerTopUpCredits" type="number" min="0" step="1" placeholder="Suno only" />
        </label>
        <label class="field grantField">
          <span>Note (optional)</span>
          <input id="providerTopUpNote" type="text" maxlength="500" placeholder="Invoice #, date, etc." />
        </label>
        <button type="submit" class="btnPrimary" id="providerTopUpSubmit">Save</button>
      </form>
      <p id="providerTopUpMsg" class="loginError" hidden></p>
    </section>`;
}

function renderRecentTopUps(rows = []) {
  if (!rows.length) {
    return `<p class="sectionNote">No top-ups logged yet.</p>`;
  }
  const body = rows.map((row) => {
    const amounts = [];
    if (row.eventType === "balance_snapshot") {
      amounts.push(`Balance ${fmtUsd(row.amountUsd)}`);
    } else {
      if (row.amountCredits != null && row.amountCredits > 0) amounts.push(`${fmtNum(row.amountCredits, 0)} cr`);
      if (row.amountUsd != null && row.amountUsd > 0) amounts.push(fmtUsd(row.amountUsd));
    }
    const providerLabel = row.provider === "lyria" || (row.provider === "gemini" && row.eventType === "balance_snapshot")
      ? "gemini / lyria"
      : (row.provider || "—");
    return `
      <tr>
        ${dateCell(row.createdAt)}
        <td>${escapeHtml(providerLabel)}</td>
        <td>${amounts.join(" · ") || "—"}</td>
        <td>${escapeHtml(row.note || "—")}</td>
        <td class="cellMuted">${escapeHtml(row.loggedByEmail || "—")}</td>
      </tr>`;
  }).join("");

  return `
    <div class="tableWrap tableWrap--plain">
      <table class="table--compact">
        <thead>
          <tr><th>When</th><th>Provider</th><th>Amount</th><th>Note</th><th>Logged by</th></tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function renderProviders(data) {
  const health = data?.health || {};
  const providers = Array.isArray(health.providers) ? health.providers : [];
  const spend = data?.spend || {};
  const cacheNote = health.cached
    ? `Health cached · refreshes in ${fmtNum(health.cacheTtlSec || 0)}s · Refresh forces live ping`
    : "Health pinged just now";

  els.panels.providers.innerHTML = adminPageStack(`
    <section class="sectionCard">
      <div class="sectionHead">
        <h3 class="sectionTitle">Vendor spend &amp; health</h3>
        <p class="sectionNote">
          Per-provider upstream cost tracking. <strong>Suno guarantee &amp; Pro liability</strong> stay on Overview only.
          Music usage from generation logs; Gemini/Pollinations from API call logs.
          <strong>Suno &amp; ElevenLabs:</strong> live API balance.
          <strong>Gemini / Lyria:</strong> one Google wallet — Balance = your logged top-ups − tracked usage (Google has no live $ API).
          ${cacheNote}.
        </p>
      </div>
      <div class="tableWrap tableWrap--plain">
        <table class="table--compact">
          <thead>
            <tr>
              <th>Provider</th><th>Health</th><th>Balance</th><th>Topped up</th>
              <th>Used 7d</th><th>Used 30d</th><th>All-time</th><th>Failed 24h</th><th>Links</th>
            </tr>
          </thead>
          <tbody>${renderProviderRows(providers)}</tbody>
        </table>
      </div>
    </section>
    ${renderProviderTopUpForm()}
    <section class="sectionCard">
      <div class="sectionHead">
        <h3 class="sectionTitle">Recent top-ups &amp; syncs</h3>
      </div>
      ${renderRecentTopUps(spend.recentTopUps || [])}
    </section>
  `);
  syncProviderTopUpFormUi();
}

function pagerHtml(total, offset) {
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));
  return `
    <div class="pager">
      <div class="pagerInfo">Page ${page} of ${pages} · ${fmtNum(total)} total</div>
      <div>
        <button type="button" class="btnGhost" data-page="prev" ${offset <= 0 ? "disabled" : ""}>Previous</button>
        <button type="button" class="btnGhost" data-page="next" ${offset + PAGE_SIZE >= (total || 0) ? "disabled" : ""}>Next</button>
      </div>
    </div>
  `;
}

function fmtDurationMs(ms) {
  const v = Number(ms);
  if (!Number.isFinite(v) || v < 0) return "—";
  if (v < 60000) return `${Math.round(v / 1000)}s`;
  const m = Math.floor(v / 60000);
  const s = Math.round((v % 60000) / 1000);
  return `${m}m ${s}s`;
}

function userViewButton(userId, returnView = "users", label = "View") {
  const uid = String(userId || "").trim();
  if (!uid) return "—";
  return `<button type="button" class="btnGhost btnGhost--sm" data-user-view="${escapeHtml(uid)}" data-return-view="${escapeHtml(returnView)}">${label}</button>`;
}

function generationViewButton(generationId, returnView = "generations", label = "View") {
  const gid = String(generationId || "").trim();
  if (!gid) return "—";
  return `<button type="button" class="btnGhost btnGhost--sm" data-generation-view="${escapeHtml(gid)}" data-return-view="${escapeHtml(returnView)}">${label}</button>`;
}

function renderUserDetail(data) {
  const u = data?.user;
  const panel = els.panels.user;
  if (!u) {
    panel.innerHTML = adminPageStack(`
      <section class="sectionCard">
        <p class="sectionNote">User not found.</p>
        <button type="button" class="btnGhost" id="btnUserDetailBack">← Back</button>
      </section>
    `);
    return;
  }

  const cr = data.credits || {};
  const sub = data.subscription;
  const insights = data.insights || {};
  const sandboxBanner = insights.sandboxLikely
    ? `<div class="userDetailAlert">Likely <strong>Apple Sandbox</strong> — ${fmtNum(insights.renewalsLast7d)} renewals in the last 7 days. Real weekly subscribers renew about once per week.</div>`
    : "";

  const subBlock = sub
    ? `${escapeHtml(sub.planId || "—")} · ${escapeHtml(sub.statusLabel || sub.status || "—")}${sub.currentPeriodEnd ? ` · ends ${fmtDateCompact(sub.currentPeriodEnd)}` : ""}`
    : "No Pro subscription on file.";

  const billingRows = data.billingEvents || [];
  const billingBody = billingRows.length
    ? billingRows.map((ev) => {
      const idShort = String(ev.id || "").length > 24 ? `${String(ev.id).slice(0, 12)}…` : (ev.id || "—");
      return `<tr>
        ${dateCell(ev.createdAt)}
        <td>${escapeHtml(ev.eventTypeLabel || ev.eventType || "—")}</td>
        <td>${escapeHtml(ev.provider || "—")}</td>
        <td>${escapeHtml(ev.planId || "—")}</td>
        <td class="num"><strong>${fmtNum(ev.creditsGranted, 0)}</strong></td>
        <td class="monoCell" title="${escapeHtml(ev.id || "")}">${escapeHtml(idShort)}</td>
      </tr>`;
    }).join("")
    : `<tr><td colspan="6" class="loading">No billing events for this user.</td></tr>`;

  const ledgerRows = data.ledger || [];
  const ledgerBody = ledgerRows.length
    ? ledgerRows.map((row) => `<tr>
        ${dateCell(row.createdAt)}
        <td class="num">${row.delta >= 0 ? "+" : ""}${fmtNum(row.delta, 1)}</td>
        <td class="num">${fmtNum(row.balanceAfter, 1)}</td>
        <td>${fmtReason(row.reason)}</td>
        <td class="monoCell">${escapeHtml(String(row.ref || "").slice(0, 48))}</td>
      </tr>`).join("")
    : `<tr><td colspan="5" class="loading">No credit transactions yet.</td></tr>`;

  const genRows = data.generations || [];
  const genBody = genRows.length
    ? genRows.map((g) => {
      const gid = escapeHtml(g.id || "");
      return `<tr class="rowClickable" tabindex="0" role="link" data-generation-view="${gid}" data-return-view="user" aria-label="Open generation">
        ${dateCell(g.createdAt)}
        <td>${escapeHtml(g.kind || "—")}</td>
        <td><span class="badge ${escapeHtml(g.status || "")}">${escapeHtml(g.status || "—")}</span></td>
        <td class="num">${fmtNum(g.creditsUsed, 1)}</td>
      </tr>`;
    }).join("")
    : `<tr><td colspan="4" class="loading">No generations logged.</td></tr>`;

  const songRows = data.songs || [];
  const songBody = songRows.length
    ? songRows.map((s) => `<tr>
        <td>${escapeHtml(s.title || "Untitled")}</td>
        <td>${s.publicOnProfile ? `<span class="badge active">public</span>` : "—"}</td>
        ${dateCell(s.createdAt)}
      </tr>`).join("")
    : `<tr><td colspan="3" class="loading">No saved songs.</td></tr>`;

  const grantBtn = state.adminSession?.canGrantCredits && u.email
    ? `<button type="button" class="btnPrimary" id="btnUserDetailGrant" data-grant-email="${escapeHtml(u.email)}">Grant credits</button>`
    : "";

  panel.innerHTML = adminPageStack(`
    <div class="detailHero">
      <div class="userDetailToolbar">
        <button type="button" class="btnGhost" id="btnUserDetailBack">← Back</button>
        <div class="userDetailActions">${grantBtn}</div>
      </div>
      ${sandboxBanner}
      <div class="detailHeroMain">
        <h3 class="detailHeroTitle">${escapeHtml(u.name)} ${u.username ? `<span class="detailHeroMuted">@${escapeHtml(u.username)}</span>` : ""}</h3>
        <p class="detailHeroSub">${escapeHtml(u.email || "No email")}</p>
      </div>
      <div class="cardsGrid cardsGrid--inSection">
        ${statCard("Total credits", fmtNum(cr.balance, 1), `Paid ${fmtNum(cr.paid, 1)} · Promo ${fmtNum(cr.promo, 1)} · Gift ${fmtNum(cr.gift, 1)}`)}
        ${statCard("Signup", fmtDateCompact(u.signupAt), fmtSignupPlatform(u.signupPlatform))}
        ${statCard("Last active", fmtDateCompact(u.lastActiveAt), u.role ? `Role ${u.role}` : "")}
        ${statCard("Songs saved", fmtNum(songRows.length), insights.billingEventCount ? `${fmtNum(insights.billingEventCount)} billing events` : "")}
      </div>
      <div class="detailMetaBlock">
        <strong>Subscription</strong> — ${subBlock}
      </div>
    </div>
    ${listSection({
      title: "Billing events",
      tableHtml: `<div class="tableWrap tableWrap--plain"><table class="table--compact"><thead><tr>
        <th>When</th><th>Event</th><th>Provider</th><th>Plan</th><th>Credits</th><th>Txn</th>
      </tr></thead><tbody>${billingBody}</tbody></table></div>`,
    })}
    ${listSection({
      title: "Credit ledger",
      tableHtml: `<div class="tableWrap tableWrap--plain"><table class="table--compact"><thead><tr>
        <th>When</th><th>Delta</th><th>Balance</th><th>Reason</th><th>Ref</th>
      </tr></thead><tbody>${ledgerBody}</tbody></table></div>`,
    })}
    ${listSection({
      title: "Recent generations",
      note: "Click a row for full details.",
      tableHtml: `<div class="tableWrap tableWrap--plain"><table class="table--compact"><thead><tr>
        <th>When</th><th>Kind</th><th>Status</th><th>Credits</th>
      </tr></thead><tbody>${genBody}</tbody></table></div>`,
    })}
    ${listSection({
      title: "Saved songs",
      tableHtml: `<div class="tableWrap tableWrap--plain"><table class="table--compact"><thead><tr>
        <th>Title</th><th>Public</th><th>Created</th>
      </tr></thead><tbody>${songBody}</tbody></table></div>`,
    })}
  `, { plain: true });

  els.pageTitle.textContent = u.name || "User detail";
  els.pageSub.textContent = u.email || u.username || VIEW_META.user.sub;
}

function renderGenerationDetail(data) {
  const g = data?.generation;
  const panel = els.panels.generation;
  if (!g) {
    panel.innerHTML = adminPageStack(`
      <section class="sectionCard">
        <p class="sectionNote">Generation not found.</p>
        <button type="button" class="btnGhost" id="btnGenerationDetailBack">← Back</button>
      </section>
    `);
    return;
  }

  const errorBlock = g.errorMessage
    ? `<div class="userDetailAlert">${escapeHtml(g.errorMessage)}</div>`
    : "";

  const promptBlock = g.prompt
    ? `<pre class="genDetailPrompt">${escapeHtml(g.prompt)}</pre>`
    : `<p class="sectionNote">No prompt stored for this log entry.</p>`;

  const ledgerRows = data.ledger || [];
  const ledgerBody = ledgerRows.length
    ? ledgerRows.map((row) => `<tr>
        ${dateCell(row.createdAt)}
        <td class="num">${row.delta >= 0 ? "+" : ""}${fmtNum(row.delta, 1)}</td>
        <td class="num">${fmtNum(row.balanceAfter, 1)}</td>
        <td>${fmtReason(row.reason)}</td>
        <td class="monoCell">${escapeHtml(String(row.ref || "").slice(0, 48))}</td>
      </tr>`).join("")
    : `<tr><td colspan="5" class="loading">No matching credit transactions in the ±15 minute window.</td></tr>`;

  const songRows = data.songs || [];
  const songBody = songRows.length
    ? songRows.map((s) => {
      const links = [
        s.songUrl ? `<a href="${escapeHtml(s.songUrl)}" target="_blank" rel="noopener noreferrer">Audio</a>` : "",
        s.shareUrl ? `<a href="${escapeHtml(s.shareUrl)}" target="_blank" rel="noopener noreferrer">Share</a>` : "",
      ].filter(Boolean).join(" · ");
      return `<tr>
        <td>${escapeHtml(s.title || "Untitled")}</td>
        <td>${escapeHtml(s.kind || "—")}</td>
        <td>${s.publicOnProfile ? `<span class="badge active">public</span>` : "—"}</td>
        <td class="pubLinks">${links || "—"}</td>
        ${dateCell(s.createdAt)}
      </tr>`;
    }).join("")
    : `<tr><td colspan="5" class="loading">${g.taskId ? "No saved songs linked to this task yet." : "No provider task ID on this log."}</td></tr>`;

  const userBtn = g.userId
    ? `<button type="button" class="btnGhost" id="btnGenerationDetailViewUser" data-user-view="${escapeHtml(g.userId)}" data-return-view="generation">View user</button>`
    : "";

  panel.innerHTML = adminPageStack(`
    <div class="detailHero">
      <div class="userDetailToolbar">
        <button type="button" class="btnGhost" id="btnGenerationDetailBack">← Back</button>
        <div class="userDetailActions">${userBtn}</div>
      </div>
      ${errorBlock}
      <div class="detailHeroMain">
        <h3 class="detailHeroTitle">
          <span class="badge ${escapeHtml(g.status || "")}">${escapeHtml(g.status || "—")}</span>
          ${escapeHtml(g.kind || "generation")} · ${escapeHtml(g.provider || "—")}
        </h3>
        <p class="detailHeroSub">${escapeHtml(g.userLabel || "—")}${g.username ? ` · @${escapeHtml(g.username)}` : ""}${g.email ? ` · ${escapeHtml(g.email)}` : ""}</p>
      </div>
      <div class="cardsGrid cardsGrid--inSection">
        ${statCard("Credits", fmtNum(g.creditsUsed, 1), g.status === "refunded" ? "Refunded to user" : "")}
        ${statCard("Provider cost", g.providerCostUsd != null ? fmtUsd(g.providerCostUsd) : "—", "Estimate")}
        ${statCard("Duration", fmtDurationMs(g.durationMs), g.completedAt ? fmtDateCompact(g.completedAt) : "Pending")}
        ${statCard("Started", fmtDateCompact(g.createdAt), g.taskId ? `${g.taskId.slice(0, 18)}…` : "No task")}
      </div>
      <div class="detailMetaBlock"><strong>Prompt</strong></div>
      ${promptBlock}
      <p class="detailMetaBlock detailMetaBlock--ids">
        <code class="promoCode">${escapeHtml(g.id)}</code>
        ${g.taskId ? ` · task <code class="promoCode">${escapeHtml(g.taskId)}</code>` : ""}
      </p>
    </div>
    ${listSection({
      title: "Saved songs",
      tableHtml: `<div class="tableWrap tableWrap--plain"><table class="table--compact"><thead><tr>
        <th>Title</th><th>Kind</th><th>Public</th><th>Links</th><th>Created</th>
      </tr></thead><tbody>${songBody}</tbody></table></div>`,
    })}
    ${listSection({
      title: "Credit transactions",
      tableHtml: `<div class="tableWrap tableWrap--plain"><table class="table--compact"><thead><tr>
        <th>When</th><th>Delta</th><th>Balance</th><th>Reason</th><th>Ref</th>
      </tr></thead><tbody>${ledgerBody}</tbody></table></div>`,
    })}
  `, { plain: true });

  const titleBits = [g.kind, g.status].filter(Boolean).join(" · ");
  els.pageTitle.textContent = titleBits || "Generation detail";
  els.pageSub.textContent = g.userLabel || g.email || VIEW_META.generation.sub;
}

function renderUsers(data) {
  const rows = data?.users || [];
  const total = data?.total || rows.length;
  const searchVal = state.userSearch || "";
  const body = rows.length
    ? rows.map((u) => {
      const uid = escapeHtml(u.userId || "");
      return `
      <tr class="rowClickable" tabindex="0" role="link" data-user-view="${uid}" data-return-view="users" aria-label="Open ${escapeHtml(u.name || u.username || "user")}">
        <td>${userNameCell(u)}</td>
        <td class="emailCell">${escapeHtml(u.email || "—")}</td>
        ${dateCell(u.signupAt)}
        <td><span class="badge ${signupPlatformBadgeClass(u.signupPlatform)}">${fmtSignupPlatform(u.signupPlatform)}</span></td>
        <td><span class="badge ${u.subscriptionStatus || "none"}">${u.subscriptionStatus || "none"}</span></td>
        <td class="num">${fmtNum(u.credits, 1)}</td>
        <td class="num">${fmtNum(u.songsGenerated)}</td>
        ${dateCell(u.lastActiveAt)}
      </tr>`;
    }).join("")
    : `<tr><td colspan="8" class="loading">${searchVal.trim().length >= 2 ? "No users match your search." : "No users yet"}</td></tr>`;

  els.panels.users.innerHTML = adminPageStack(`
    <form id="userSearchForm" class="toolbarRow userSearchForm">
      <label class="field grantField userSearchField">
        <span>Search users</span>
        <input id="userSearchInput" type="search" value="${escapeHtml(searchVal)}" placeholder="email or @username" autocomplete="off" />
      </label>
      <button type="submit" class="btnPrimary">Search</button>
      ${searchVal.trim().length >= 2 ? `<button type="button" class="btnGhost" id="btnUserSearchClear">Clear</button>` : ""}
    </form>
    ${listSection({
    title: searchVal.trim().length >= 2 ? "Search results" : "All users",
    note: "Click a row to open the user profile.",
    tableHtml: `
    <div class="tableWrap tableWrap--plain">
      <table class="table--compact">
        <thead>
          <tr>
            <th>User</th><th>Email</th><th>Signup</th><th>Platform</th><th>Sub</th>
            <th>Credits</th><th>Songs</th><th>Active</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>`,
    pager: pagerHtml(total, state.offset),
  })}`, { plain: true });
}

function promoStatusBadge(promo) {
  if (!promo.active) return `<span class="badge inactive">inactive</span>`;
  if (promo.expiresAt && new Date(promo.expiresAt).getTime() < Date.now()) {
    return `<span class="badge expired">expired</span>`;
  }
  if (promo.redemptions >= promo.maxRedemptions) {
    return `<span class="badge exhausted">redeemed</span>`;
  }
  return `<span class="badge active">active</span>`;
}

function renderPromos(data) {
  const rows = data?.promos || [];
  const total = data?.total || rows.length;
  const summary = data?.summary || {};
  const canManage = Boolean(state.adminSession?.canGrantCredits);

  const body = rows.length
    ? rows.map((p) => {
      const remaining = Math.max(0, p.maxRedemptions - p.redemptions);
      const toggleBtn = canManage
        ? `<button type="button" class="btnGhost" data-promo-toggle="${escapeHtml(p.code)}" data-promo-active="${p.active ? "1" : "0"}">${p.active ? "Deactivate" : "Activate"}</button>`
        : "—";
      return `
      <tr>
        <td><code class="promoCode">${escapeHtml(p.code)}</code></td>
        <td class="num">${fmtNum(p.credits, 1)}</td>
        <td class="num">${fmtNum(p.redemptions)} / ${fmtNum(p.maxRedemptions)}</td>
        <td class="num">${fmtNum(remaining)}</td>
        <td>${promoStatusBadge(p)}</td>
        <td>${p.expiresAt ? fmtDateCompact(p.expiresAt) : "—"}</td>
        ${dateCell(p.createdAt)}
        <td>${toggleBtn}</td>
      </tr>`;
    }).join("")
    : `<tr><td colspan="8" class="loading">No promo codes yet — create one below.</td></tr>`;

  const createForm = canManage ? `
    <div class="toolbarBlock">
      <form id="promoCreateForm" class="grantForm">
        <label class="field grantField">
          <span>Create code</span>
          <input id="promoCode" type="text" placeholder="NABADAI-WELCOME-30" autocomplete="off" />
        </label>
        <label class="field grantField">
          <span>Or batch prefix</span>
          <input id="promoPrefix" type="text" placeholder="NABADAI-BETA-2026" autocomplete="off" />
        </label>
        <label class="field grantField grantField--amount">
          <span>Count</span>
          <input id="promoCount" type="number" min="1" max="50" step="1" value="1" inputmode="numeric" />
        </label>
        <label class="field grantField grantField--amount">
          <span>Credits</span>
          <input id="promoCredits" type="number" min="1" max="5000" step="1" required placeholder="30" inputmode="numeric" />
        </label>
        <label class="field grantField grantField--amount">
          <span>Max uses</span>
          <input id="promoMaxRedemptions" type="number" min="1" max="10000" step="1" value="1" inputmode="numeric" />
        </label>
        <label class="field grantField">
          <span>Expires</span>
          <input id="promoExpires" type="datetime-local" />
        </label>
        <button type="submit" class="btnPrimary" id="btnPromoCreate">Create</button>
      </form>
      <p id="promoCreateMsg" class="grantMsg" hidden></p>
    </div>` : "";

  els.panels.promos.innerHTML = adminPageStack(`
    <div class="inlineStats">
      <span><strong>${fmtNum(summary.codesTotal)}</strong> codes</span>
      <span><strong>${fmtNum(summary.codesRedeemed)}</strong> redemptions</span>
    </div>
    ${createForm}
    ${listSection({
      title: "Promo codes",
      tableHtml: `
      <div class="tableWrap tableWrap--plain">
        <table class="table--compact">
          <thead>
            <tr>
              <th>Code</th><th>Credits</th><th>Used</th><th>Left</th>
              <th>Status</th><th>Expires</th><th>Created</th><th></th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>`,
      pager: pagerHtml(total, state.offset),
    })}
  `, { plain: true });
}

function singerAppStatusBadge(status) {
  const s = String(status || "").toLowerCase();
  if (s === "approved") return `<span class="badge active">approved</span>`;
  if (s === "rejected") return `<span class="badge exhausted">rejected</span>`;
  return `<span class="badge pending">pending</span>`;
}

function requestStatusBadge(status) {
  const s = String(status || "").toLowerCase();
  if (s === "delivered" || s === "closed") return `<span class="badge active">${escapeHtml(s)}</span>`;
  if (s === "cancelled") return `<span class="badge exhausted">cancelled</span>`;
  return `<span class="badge pending">${escapeHtml(s)}</span>`;
}

function singerAssignmentBadge(status) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "accepted") return `<span class="badge active">accepted</span>`;
  if (s === "declined") return `<span class="badge exhausted">declined</span>`;
  if (s === "pending") return `<span class="badge pending">awaiting singer</span>`;
  return `<span class="badge">—</span>`;
}

function renderSingers(data) {
  const apps = data?.applications || [];
  const roster = data?.roster || [];
  const requests = data?.requests || [];
  const appsTotal = data?.applicationsTotal || apps.length;
  const reqTotal = data?.requestsTotal || requests.length;

  const appBody = apps.length
    ? apps.map((a) => {
      const actions = a.status === "pending"
        ? `<button type="button" class="btnGhost" data-singer-approve="${escapeHtml(a.id)}">Approve</button>
           <button type="button" class="btnGhost" data-singer-reject="${escapeHtml(a.id)}">Reject</button>`
        : "—";
      return `
      <tr>
        <td>${escapeHtml(a.userLabel || "—")}</td>
        <td>${escapeHtml(a.displayName || "—")}</td>
        <td>@${escapeHtml(a.instagram || "—")}</td>
        <td style="max-width:12rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(a.languages || "—")}</td>
        <td>${singerAppStatusBadge(a.status)}</td>
        ${dateCell(a.createdAt)}
        <td>${actions}</td>
      </tr>`;
    }).join("")
    : `<tr><td colspan="7" class="loading">No applications yet.</td></tr>`;

  const rosterBody = roster.length
    ? roster.map((s) => {
      const toggleBtn = `<button type="button" class="btnGhost" data-singer-toggle="${escapeHtml(s.userId)}" data-singer-active="${s.active ? "1" : "0"}">${s.active ? "Deactivate" : "Activate"}</button>`;
      return `
      <tr>
        <td>${escapeHtml(s.userLabel || "—")}</td>
        <td>${escapeHtml(s.displayName || "—")}</td>
        <td>@${escapeHtml(s.instagram || "—")}</td>
        <td>${s.active ? `<span class="badge active">active</span>` : `<span class="badge exhausted">inactive</span>`}</td>
        ${dateCell(s.approvedAt)}
        <td>${toggleBtn}</td>
      </tr>`;
    }).join("")
    : `<tr><td colspan="6" class="loading">No approved singers yet.</td></tr>`;

  const rosterOptions = roster.filter((s) => s.active).map((s) =>
    `<option value="${escapeHtml(s.userId)}">${escapeHtml(s.displayName || s.userLabel)}</option>`,
  ).join("");

  const reqBody = requests.length
    ? requests.map((r) => {
      const singerSelect = `<select class="inputCompact" data-request-singer="${escapeHtml(r.id)}">
        <option value="">Best match</option>
        ${rosterOptions}
      </select>`;
      const statusSelect = `<select class="inputCompact" data-request-status="${escapeHtml(r.id)}">
        ${["submitted", "confirmed", "in_progress", "review", "delivered", "closed", "cancelled"].map((st) =>
          `<option value="${st}"${st === r.status ? " selected" : ""}>${st}</option>`,
        ).join("")}
      </select>`;
      const paySelect = `<select class="inputCompact" data-request-payment="${escapeHtml(r.id)}">
        ${["pending", "paid", "refunded"].map((st) =>
          `<option value="${st}"${st === r.paymentStatus ? " selected" : ""}>${st}</option>`,
        ).join("")}
      </select>`;
      return `
      <tr>
        <td style="font-size:0.78rem">${escapeHtml(r.id?.slice(0, 8) || "—")}</td>
        <td>${escapeHtml(r.requesterLabel || "—")}</td>
        <td>${escapeHtml(r.packageTier || "—")} · ${fmtUsd(r.priceUsd)}</td>
        <td style="max-width:10rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(r.songTitle || r.occasion || "—")}</td>
        <td>${requestStatusBadge(r.status)}</td>
        <td>${singerAssignmentBadge(r.singerAssignmentStatus)}</td>
        <td>${paySelect}</td>
        <td>${singerSelect}</td>
        <td>${statusSelect}</td>
        <td><button type="button" class="btnGhost" data-request-save="${escapeHtml(r.id)}">Save</button></td>
      </tr>`;
    }).join("")
    : `<tr><td colspan="10" class="loading">No performance requests yet.</td></tr>`;

  els.panels.singers.innerHTML = adminPageStack(`
    ${listSection({
      title: "Pending applications",
      tableHtml: `
    <div class="tableWrap tableWrap--plain">
      <table class="table--compact">
        <thead>
          <tr><th>User</th><th>Name</th><th>Instagram</th><th>Languages</th><th>Status</th><th>Applied</th><th></th></tr>
        </thead>
        <tbody>${appBody}</tbody>
      </table>
    </div>`,
      pager: pagerHtml(appsTotal, state.offset),
    })}
    ${listSection({
      title: "Active roster",
      tableHtml: `
    <div class="tableWrap tableWrap--plain">
      <table class="table--compact">
        <thead>
          <tr><th>User</th><th>Stage name</th><th>Instagram</th><th>Status</th><th>Approved</th><th></th></tr>
        </thead>
        <tbody>${rosterBody}</tbody>
      </table>
    </div>`,
    })}
    ${listSection({
      title: "Performance requests",
      tableHtml: `
    <p class="pageSub" style="margin:0 0 0.75rem">After submit, send the user a Stripe payment link by email or Instagram. Mark paid when received.</p>
    <div class="tableWrap tableWrap--plain">
      <table class="table--compact">
        <thead>
          <tr><th>ID</th><th>User</th><th>Package</th><th>Song / occasion</th><th>Status</th><th>Singer response</th><th>Payment</th><th>Singer</th><th>Update status</th><th></th></tr>
        </thead>
        <tbody>${reqBody}</tbody>
      </table>
    </div>`,
      pager: pagerHtml(reqTotal, state.offset),
    })}
  `, { plain: true });

  requests.forEach((r) => {
    const singerEl = document.querySelector(`[data-request-singer="${r.id}"]`);
    if (singerEl && r.singerId) singerEl.value = r.singerId;
  });
}

function renderCredits(data) {
  const rows = data?.transactions || [];
  const total = data?.total || rows.length;
  const body = rows.length
    ? rows.map((t) => {
      const d = Number(t.delta);
      const cls = d >= 0 ? "deltaPos" : "deltaNeg";
      const sign = d >= 0 ? "+" : "";
      return `
        <tr>
          <td>${t.userLabel || "—"}</td>
          <td class="num ${cls}">${sign}${fmtNum(d, 1)}</td>
          <td class="num">${fmtNum(t.balanceBefore, 1)}</td>
          <td class="num">${fmtNum(t.balanceAfter, 1)}</td>
          <td>${fmtReason(t.reason)}</td>
          <td style="color:var(--muted);font-size:0.78rem">${t.ref || ""}</td>
          ${dateCell(t.created_at)}
        </tr>
      `;
    }).join("")
    : `<tr><td colspan="7" class="loading">No transactions yet — run supabase/admin_dashboard.sql</td></tr>`;

  els.panels.credits.innerHTML = adminPageStack(`
    ${state.adminSession?.canGrantCredits ? `
    <div class="toolbarBlock">
      <form id="grantCreditsForm" class="grantForm">
        <label class="field grantField">
          <span>Grant paid credits</span>
          <input id="grantCreditsEmail" type="email" placeholder="creator@example.com" autocomplete="off" />
        </label>
        <label class="field grantField grantField--amount">
          <span>Amount</span>
          <input id="grantCreditsAmount" type="number" min="1" max="500" step="1" required placeholder="50" inputmode="numeric" />
        </label>
        <button type="submit" class="btnPrimary" id="btnGrantCredits">Grant</button>
      </form>
      <p id="grantCreditsMsg" class="grantMsg" hidden></p>
    </div>` : ""}
    ${listSection({
      title: "Credit ledger",
      tableHtml: `
    <div class="tableWrap tableWrap--plain">
      <table class="table--compact">
        <thead>
          <tr>
            <th>User</th><th>Delta</th><th>Before</th><th>After</th><th>Reason</th><th>Ref</th><th>Date</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>`,
      pager: pagerHtml(total, state.offset),
    })}
  `, { plain: true });

  if (state.grantPrefillEmail) {
    const emailInput = document.getElementById("grantCreditsEmail");
    if (emailInput) emailInput.value = state.grantPrefillEmail;
    state.grantPrefillEmail = "";
  }
}

function renderGenerations(data) {
  const rows = data?.generations || [];
  const total = data?.total || rows.length;
  const body = rows.length
    ? rows.map((g) => {
      const gid = escapeHtml(g.id || "");
      return `
      <tr class="rowClickable" tabindex="0" role="link" data-generation-view="${gid}" data-return-view="generations" aria-label="Open generation">
        <td>${escapeHtml(g.userLabel || "—")}</td>
        <td class="promptCell" title="${(g.prompt || "").replace(/"/g, "&quot;")}">${g.prompt || "—"}</td>
        <td>${g.provider}</td>
        <td>${g.kind}</td>
        <td><span class="badge ${g.status}">${g.status}</span></td>
        <td class="num">${fmtNum(g.creditsUsed, 1)}</td>
        <td class="num">${g.providerCostUsd != null ? fmtUsd(g.providerCostUsd) : "—"}</td>
        ${dateCell(g.createdAt)}
      </tr>`;
    }).join("")
    : `<tr><td colspan="8" class="loading">No generation logs yet</td></tr>`;

  els.panels.generations.innerHTML = adminPageStack(listSection({
    title: "Generation log",
    note: "Click a row for prompt, errors, and linked songs.",
    tableHtml: `
    <div class="tableWrap tableWrap--plain">
      <table class="table--compact">
        <thead>
          <tr>
            <th>User</th><th>Prompt</th><th>Provider</th><th>Kind</th>
            <th>Status</th><th>Credits</th><th>Cost</th><th>Date</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>`,
    pager: pagerHtml(total, state.offset),
  }), { plain: true });
}

function renderPublications(data) {
  const rows = data?.publications || [];
  const total = data?.total || rows.length;
  const canModerate = Boolean(state.adminSession?.canModeratePublications);
  const body = rows.length
    ? rows.map((p) => {
      const caption = p.releaseCaption
        ? `<br><span style="color:var(--muted);font-size:0.76rem">${escapeHtml(p.releaseCaption)}</span>`
        : "";
      const links = [
        p.shareUrl ? `<a href="${escapeHtml(p.shareUrl)}" target="_blank" rel="noopener noreferrer">Share</a>` : "",
        p.profileUrl ? `<a href="${escapeHtml(p.profileUrl)}" target="_blank" rel="noopener noreferrer">Profile</a>` : "",
      ].filter(Boolean).join(" · ");
      const modCell = canModerate
        ? `<td><button type="button" class="btnGhost btnDangerGhost" data-unpublish-song="${escapeHtml(p.id)}" data-song-title="${escapeHtml(p.title)}">Unpublish</button></td>`
        : "";
      return `
      <tr>
        <td>
          ${p.artUrl ? `<img class="pubArt" src="${escapeHtml(p.artUrl)}" alt="" loading="lazy" />` : `<span class="pubArtFallback">♪</span>`}
        </td>
        <td>
          <strong>${escapeHtml(p.title)}</strong>${caption}
        </td>
        <td>${escapeHtml(p.userLabel)}${p.username ? `<br><span class="cellMuted">@${escapeHtml(p.username)}</span>` : ""}</td>
        <td class="emailCell">${escapeHtml(p.email || "—")}</td>
        ${dateCell(p.publishedAt || p.createdAt)}
        <td>${escapeHtml(p.kind || "—")}</td>
        <td class="pubLinks">${links || "—"}</td>
        ${modCell}
      </tr>`;
    }).join("")
    : `<tr><td colspan="${canModerate ? 8 : 7}" class="loading">No public posts yet</td></tr>`;

  els.panels.publications.innerHTML = adminPageStack(listSection({
    title: "Public posts",
    note: canModerate ? "Unpublish removes the post from profile and feed." : "",
    tableHtml: `
    <div class="tableWrap tableWrap--plain">
      <table class="table--compact">
        <thead>
          <tr>
            <th>Cover</th><th>Title</th><th>Creator</th><th>Email</th>
            <th>Published</th><th>Kind</th><th>Links</th>${canModerate ? "<th></th>" : ""}
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>`,
    pager: pagerHtml(total, state.offset),
  }), { plain: true });
}

function renderRoleGuideCards(roles) {
  const list = Array.isArray(roles) ? roles : [];
  return list.map((role) => `
    <article class="roleGuideCard">
      <div class="roleGuideHead">
        <span class="${roleBadgeClass(role.id)}">${escapeHtml(role.label)}</span>
      </div>
      <p class="roleGuideDesc">${escapeHtml(role.description)}</p>
      <div class="roleGuideMeta">
        ${role.grantCredits ? `<span class="roleTag">Can grant credits</span>` : ""}
        ${role.moderatePublications ? `<span class="roleTag">Can unpublish posts</span>` : ""}
        ${role.manageTeam ? `<span class="roleTag roleTag--accent">Can manage team</span>` : ""}
        <span class="roleTag">${escapeHtml((role.views || []).join(", "))}</span>
      </div>
    </article>
  `).join("");
}

function fmtAuditAction(entry) {
  const action = String(entry?.action || "");
  const map = {
    grant: "Granted access",
    revoke: "Revoked access",
    role_change: "Changed role",
    invite_sent: "Sent signup invite",
    invite_pending: "Saved pending invite",
    invite_revoked: "Cancelled invite",
    unpublish: "Unpublished post",
  };
  return map[action] || action.replace(/_/g, " ");
}

function renderAuditRows(entries) {
  const rows = Array.isArray(entries) ? entries : [];
  if (!rows.length) {
    return `<tr><td colspan="5" class="loading">No audit events yet.</td></tr>`;
  }
  return rows.map((e) => {
    const target = e.targetEmail || e.targetUserId?.slice(0, 8) || "—";
    const detail = e.action === "unpublish"
      ? escapeHtml(String(e.metadata?.title || e.metadata?.songId || ""))
      : e.previousRole && e.newRole
        ? `${escapeHtml(e.previousRole)} → ${escapeHtml(e.newRole)}`
        : e.newRole
          ? escapeHtml(e.newRole)
          : "—";
    return `
      <tr>
        <td>${fmtDate(e.createdAt)}</td>
        <td>${escapeHtml(e.actorEmail || "—")}</td>
        <td>${escapeHtml(fmtAuditAction(e))}</td>
        <td>${escapeHtml(target)}</td>
        <td>${detail}</td>
      </tr>`;
  }).join("");
}

function renderSettings(data) {
  const roles = data.teamRoles || data.roles || [];
  const members = Array.isArray(data.members) ? data.members : [];
  const pendingInvites = Array.isArray(data.pendingInvites) ? data.pendingInvites : [];
  const audit = Array.isArray(data.audit) ? data.audit : [];
  const teamError = data.teamError || "";
  const canManage = Boolean(state.adminSession?.canManageTeam);

  const memberRows = members.length
    ? members.map((m) => {
      const label = m.name || (m.username ? `@${m.username}` : m.email || "—");
      const ownerNote = m.isOwner ? `<span class="badge admin">Owner</span>` : "";
      const roleOptions = roles.map((r) =>
        `<option value="${escapeHtml(r.id)}" ${r.id === m.role ? "selected" : ""}>${escapeHtml(r.label)}</option>`,
      ).join("");
      const actions = canManage && !m.isOwner
        ? `
          <div class="teamActions">
            <select class="teamRoleSelect" data-team-email="${escapeHtml(m.email)}" aria-label="Change role for ${escapeHtml(m.email)}">
              ${roleOptions}
            </select>
            <button type="button" class="btnGhost btnDangerGhost" data-team-revoke="${escapeHtml(m.email)}">Revoke</button>
          </div>`
        : `<span class="${roleBadgeClass(m.role)}">${escapeHtml(m.role)}</span>`;
      return `
        <tr>
          <td>
            <strong>${escapeHtml(label)}</strong>
            ${ownerNote ? `<br>${ownerNote}` : ""}
            ${m.username ? `<br><span style="color:var(--muted);font-size:0.76rem">@${escapeHtml(m.username)}</span>` : ""}
          </td>
          <td>${escapeHtml(m.email || "—")}</td>
          <td><span class="${roleBadgeClass(m.role)}">${escapeHtml(m.role)}</span></td>
          <td>${fmtDate(m.grantedAt)}</td>
          <td>${escapeHtml(m.grantedByLabel || "—")}</td>
          <td>${actions}</td>
        </tr>`;
    }).join("")
    : `<tr><td colspan="6" class="loading">${canManage ? "No teammates yet — invite someone below." : "Team list is Owner / Admin only."}</td></tr>`;

  const pendingRows = pendingInvites.length
    ? pendingInvites.map((inv) => `
      <tr>
        <td>${escapeHtml(inv.email)}</td>
        <td><span class="${roleBadgeClass(inv.role)}">${escapeHtml(inv.role)}</span></td>
        <td>${fmtDate(inv.invitedAt)}</td>
        <td>${escapeHtml(inv.invitedByLabel || "—")}</td>
        <td><button type="button" class="btnGhost btnDangerGhost" data-invite-revoke="${escapeHtml(inv.id)}">Cancel</button></td>
      </tr>`).join("")
    : `<tr><td colspan="5" class="loading">No pending invites.</td></tr>`;

  const inviteForm = canManage ? `
    <section class="sectionCard">
      <div class="sectionHead">
        <h3 class="sectionTitle">Invite to dashboard</h3>
        <p class="sectionNote">Enter an email or <code>@username</code>. If they don't have a NabadAi account yet, we'll save a pending invite and email them a Supabase signup link (when enabled).</p>
      </div>
      <form id="teamInviteForm" class="grantForm">
        <label class="field grantField teamLookupField">
          <span>Email or @username</span>
          <input id="teamInviteLookup" type="text" required placeholder="teammate@company.com or @creator" autocomplete="off" />
          <div id="teamLookupResults" class="teamLookupResults" hidden></div>
        </label>
        <label class="field grantField">
          <span>Role</span>
          <select id="teamInviteRole" class="teamRoleSelect" required>
            ${roles.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.label)}</option>`).join("")}
          </select>
        </label>
        <label class="field grantField grantField--check">
          <span class="checkRow">
            <input id="teamInviteSendEmail" type="checkbox" checked />
            Send signup invite if no account yet
          </span>
        </label>
        <button type="submit" class="btnPrimary" id="btnTeamInvite">Grant access</button>
      </form>
      <p id="teamInviteMsg" class="grantMsg" hidden></p>
      ${teamError ? `<p class="grantMsg isErr">${escapeHtml(teamError)}</p>` : ""}
    </section>` : `
    <section class="sectionCard">
      <p class="sectionNote">Only <strong>Owner / Admin</strong> can invite teammates. Your role is <strong>${escapeHtml(state.adminSession?.roleLabel || "—")}</strong>.</p>
    </section>`;

  els.panels.settings.innerHTML = adminPageStack(`
    ${inviteForm}
    ${canManage ? dataPanel({
      title: "Current team",
      note: "Everyone with dashboard access. Owner accounts cannot be revoked or downgraded here.",
      tableHtml: `
      <div class="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Person</th><th>Email</th><th>Role</th><th>Granted</th><th>By</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>${memberRows}</tbody>
        </table>
      </div>`,
    }) : ""}
    ${canManage ? dataPanel({
      title: "Pending invites",
      note: "Waiting for signup — role applies automatically when they create an account with this email.",
      tableHtml: `
      <div class="tableWrap">
        <table>
          <thead>
            <tr><th>Email</th><th>Role</th><th>Invited</th><th>By</th><th>Actions</th></tr>
          </thead>
          <tbody>${pendingRows}</tbody>
        </table>
      </div>`,
    }) : ""}
    ${canManage ? dataPanel({
      title: "Audit log",
      note: "Recent team and moderation actions across the dashboard.",
      tableHtml: `
      <div class="tableWrap">
        <table>
          <thead>
            <tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Detail</th></tr>
          </thead>
          <tbody>${renderAuditRows(audit)}</tbody>
        </table>
      </div>`,
    }) : ""}
    <section class="sectionCard">
      <div class="sectionHead">
        <h3 class="sectionTitle">Role guide</h3>
        <p class="sectionNote">Pick the smallest role that fits — you can always upgrade someone later.</p>
      </div>
      <div class="roleGuideGrid">${renderRoleGuideCards(roles)}</div>
    </section>
  `);
}

function renderBilling(data) {
  const rows = data?.billingEvents || [];
  const total = data?.total || rows.length;
  const summary = data?.summary || {};
  const searchQ = String(data?.search || state.billingSearch || "").trim();
  const body = rows.length
    ? rows.map((ev) => {
      const idShort = String(ev.id || "").length > 28
        ? `${String(ev.id).slice(0, 14)}…${String(ev.id).slice(-10)}`
        : (ev.id || "—");
      const userCell = ev.userId
        ? `<td class="cellLink" data-user-view="${escapeHtml(ev.userId)}" data-return-view="billing">${ev.userLabel || "—"}<br><span class="cellMuted">${escapeHtml(ev.email || "")}</span></td>`
        : `<td>${ev.userLabel || "—"}</td>`;
      return `
      <tr>
        ${dateCell(ev.createdAt)}
        ${userCell}
        <td><span class="badge">${escapeHtml(ev.eventTypeLabel || ev.eventType || "—")}</span></td>
        <td>${escapeHtml(ev.provider || "—")}</td>
        <td>${escapeHtml(ev.planId || "—")}</td>
        <td class="num"><strong>${fmtNum(ev.creditsGranted, 0)}</strong></td>
        <td class="monoCell" title="${escapeHtml(ev.id || "")}">${escapeHtml(idShort)}</td>
      </tr>`;
    }).join("")
    : `<tr><td colspan="7" class="loading">${searchQ ? `No billing events for “${escapeHtml(searchQ)}”.` : "No billing events yet"}</td></tr>`;

  const summaryInline = `
    <div class="inlineStats">
      <span><strong>${fmtNum(summary.eventCount || 0)}</strong> grants (7d)</span>
      <span><strong>${fmtNum(summary.renewalCount || 0)}</strong> renewals</span>
      <span><strong>${fmtNum(summary.creditsGranted || 0, 0)}</strong> credits</span>
    </div>`;

  els.panels.billing.innerHTML = adminPageStack(`
    ${summaryInline}
    ${listSection({
      extraHtml: `
      <form id="billingSearchForm" class="toolbarRow userSearchForm">
        <label class="field grantField userSearchField">
          <span>Find user</span>
          <input id="billingSearchInput" type="search" placeholder="email or @username" autocomplete="off" value="${escapeHtml(searchQ)}" />
        </label>
        <button type="submit" class="btnPrimary">Search</button>
        ${searchQ ? `<button type="button" class="btnGhost" id="billingSearchClear">Clear</button>` : ""}
      </form>`,
      title: "Billing events",
      note: "Click a user name to open their profile.",
      tableHtml: `
    <div class="tableWrap tableWrap--plain">
      <table class="table--compact">
        <thead>
          <tr>
            <th>When</th><th>User</th><th>Event</th><th>Provider</th>
            <th>Plan</th><th>Credits</th><th>Txn</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>`,
      pager: pagerHtml(total, state.offset),
    })}`, { plain: true });
}

function renderSubscriptions(data) {
  const rows = data?.subscriptions || [];
  const total = data?.total || rows.length;
  const body = rows.length
    ? rows.map((s) => `
      <tr>
        <td>${s.userLabel || "—"}<br><span class="cellMuted">${s.email || ""}</span></td>
        <td>${s.planId || "—"}</td>
        <td><span class="badge ${s.status}">${s.statusLabel || s.status}</span></td>
        <td>${s.provider}</td>
        ${dateCell(s.currentPeriodEnd)}
        <td class="monoCell">${s.providerSubscriptionId || "—"}</td>
        ${dateCell(s.updatedAt)}
      </tr>
    `).join("")
    : `<tr><td colspan="7" class="loading">No subscriptions yet</td></tr>`;

  els.panels.subscriptions.innerHTML = adminPageStack(listSection({
    title: "Pro subscriptions",
    tableHtml: `
    <div class="tableWrap tableWrap--plain">
      <table class="table--compact">
        <thead>
          <tr>
            <th>User</th><th>Plan</th><th>Status</th><th>Provider</th>
            <th>Period end</th><th>Provider ID</th><th>Updated</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>`,
    pager: pagerHtml(total, state.offset),
  }), { plain: true });
}

function marketingField(label, id, value, { multiline = false, hint = "" } = {}) {
  const safe = escapeHtml(String(value ?? ""));
  const input = multiline
    ? `<textarea id="${id}" rows="${multiline === true ? 3 : multiline}" class="marketingFieldInput">${safe}</textarea>`
    : `<input id="${id}" type="text" class="marketingFieldInput" value="${safe}" />`;
  return `<label class="field marketingField">
    <span>${escapeHtml(label)}</span>
    ${input}
    ${hint ? `<span class="cellMuted">${escapeHtml(hint)}</span>` : ""}
  </label>`;
}

function updateMarketingHeroPreview(url) {
  if (url && document.getElementById("mkHeroImageUrl")) {
    document.getElementById("mkHeroImageUrl").value = url;
  }
  updateMarketingDraftSitePreview();
}

function readMarketingRelatedLinks(prefix = "mkRelated") {
  const val = (id) => document.getElementById(id)?.value ?? "";
  return [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
    label: val(`${prefix}Label${i}`),
    href: val(`${prefix}Href${i}`),
  })).filter((it) => it.label.trim());
}

function readMarketingFormContent(pageKey = "home") {
  const val = (id) => document.getElementById(id)?.value ?? "";
  const cards = [0, 1, 2].map((i) => {
    const card = {
      title: val(`mkFeatureTitle${i}`),
      body: val(`mkFeatureBody${i}`),
      imageUrl: val(`mkFeatureImageUrl${i}`),
      imageAlt: val(`mkFeatureImageAlt${i}`),
    };
    if (pageKey === "home" && i === 0) {
      const links = [0, 1, 2].map((j) => ({
        label: val(`mkFeatureLinkLabel${j}`),
        href: val(`mkFeatureLinkHref${j}`),
      })).filter((it) => it.label.trim());
      if (links.length) card.links = links;
    }
    return card;
  });
  const faqItems = [0, 1, 2].map((i) => ({
    question: val(`mkFaqQ${i}`),
    answerHtml: val(`mkFaqA${i}`),
  })).filter((it) => it.question.trim());
  const content = {
    seo: {
      title: val("mkSeoTitle"),
      description: val("mkSeoDescription"),
    },
    hero: {
      eyebrow: val("mkHeroEyebrow"),
      title: val("mkHeroTitle"),
      lead: val("mkHeroLead"),
      ctaLabel: val("mkHeroCtaLabel"),
      ctaHref: val("mkHeroCtaHref"),
      secondaryLabel: val("mkHeroSecondaryLabel"),
      secondaryHref: val("mkHeroSecondaryHref"),
      heroImageUrl: getMarketingHeroDraftUrl() || getMarketingHeroPreviewUrl(),
      heroImageAlt: val("mkHeroImageAlt"),
    },
    features: {
      eyebrow: val("mkFeaturesEyebrow"),
      title: val("mkFeaturesTitle"),
      cards,
    },
    faq: {
      title: val("mkFaqTitle"),
      items: faqItems,
    },
    finalCta: {
      title: val("mkFinalTitle"),
      body: val("mkFinalBody"),
      ctaLabel: val("mkFinalCtaLabel"),
      ctaHref: val("mkFinalCtaHref"),
    },
    related: {
      title: val("mkRelatedTitle"),
      links: readMarketingRelatedLinks(),
    },
  };
  if (pageKey === "home") {
    content.discover = {
      eyebrow: val("mkDiscoverEyebrow"),
      title: val("mkDiscoverTitle"),
      lead: val("mkDiscoverLead"),
      ctaLabel: val("mkDiscoverCtaLabel"),
      ctaHref: val("mkDiscoverCtaHref"),
      featuredSongIds: val("mkDiscoverFeaturedIds")
        .split(/[\s,]+/g)
        .map((id) => id.trim())
        .filter(Boolean),
    };
    content.pricing = {
      eyebrow: val("mkPricingEyebrow"),
      title: val("mkPricingTitle"),
      free: {
        title: val("mkPricingFreeTitle"),
        price: val("mkPricingFreePrice"),
        body: val("mkPricingFreeBody"),
        ctaLabel: val("mkPricingFreeCtaLabel"),
        ctaHref: val("mkPricingFreeCtaHref"),
        imageUrl: val("mkPricingFreeImageUrl"),
        imageAlt: val("mkPricingFreeImageAlt"),
      },
      pro: {
        title: val("mkPricingProTitle"),
        price: val("mkPricingProPrice"),
        body: val("mkPricingProBody"),
        ctaLabel: val("mkPricingProCtaLabel"),
        ctaHref: val("mkPricingProCtaHref"),
        imageUrl: val("mkPricingProImageUrl"),
        imageAlt: val("mkPricingProImageAlt"),
      },
    };
    content.footer = {
      social: ["instagram", "facebook", "tiktok", "youtube", "discord"].map((platform) => ({
        platform,
        href: val(`mkSocialHref${platform}`),
        label: val(`mkSocialLabel${platform}`) || platform,
      })),
    };
  }
  return content;
}

function updateMarketingDraftSitePreview() {
  const eyebrow = document.getElementById("mkDraftHeroEyebrow");
  const title = document.getElementById("mkDraftHeroTitle");
  const lead = document.getElementById("mkDraftHeroLead");
  const image = document.getElementById("mkDraftHeroImage");
  if (!eyebrow || !title || !lead || !image) return;
  eyebrow.textContent = document.getElementById("mkHeroEyebrow")?.value || "";
  title.textContent = document.getElementById("mkHeroTitle")?.value || "";
  lead.textContent = document.getElementById("mkHeroLead")?.value || "";
  const url = getMarketingHeroPreviewUrl();
  if (url) {
    image.hidden = false;
    image.src = url;
    image.alt = document.getElementById("mkHeroImageAlt")?.value || "";
  } else {
    image.hidden = true;
    image.removeAttribute("src");
  }
}

function storeMarketingDraftPreview() {
  const pageKey = state.marketingPage || "home";
  const locale = state.marketingLocale || "en";
  const content = readMarketingFormContent(pageKey);
  const payload = {
    page: pageKey,
    locale,
    content,
    savedAt: Date.now(),
  };
  sessionStorage.setItem(`nabad_marketing_draft:${pageKey}:${locale}`, JSON.stringify(payload));
  return payload;
}

function buildMarketingDraftPreviewUrl(previewPath, payload) {
  const path = String(previewPath || "/").split("?")[0];
  const qs = new URLSearchParams({ preview: "draft" });
  const heroUrl = String(payload?.content?.hero?.heroImageUrl || "").trim();
  if (heroUrl) qs.set("heroImg", heroUrl);
  const heroAlt = String(payload?.content?.hero?.heroImageAlt || "").trim();
  if (heroAlt) qs.set("heroAlt", heroAlt);
  return `${path}?${qs.toString()}`;
}

function openMarketingDraftPreview(previewPath) {
  if (state.marketingHeroUploading) {
    showError("Image is still uploading — wait for the success message, then try Preview draft again.");
    return;
  }
  const publicUrl = String(document.getElementById("mkHeroImageUrl")?.value || "").trim();
  if (state.marketingHeroBlobUrl && !publicUrl) {
    showError("Image upload has not finished yet. Wait for Upload complete in the message above.");
    return;
  }
  const payload = storeMarketingDraftPreview();
  const url = buildMarketingDraftPreviewUrl(previewPath, payload);
  const win = window.open(url, "_blank");
  if (!win) {
    showError("Pop-up blocked — allow pop-ups for this site to preview drafts.");
    return;
  }
  state.marketingDraftPreviewWindow = win;
  state.marketingDraftPreviewPayload = payload;
  sendMarketingDraftToPreviewWindow(win, payload);
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (win.closed || attempts > 60) {
      window.clearInterval(timer);
      state.marketingDraftPreviewWindow = null;
      return;
    }
    sendMarketingDraftToPreviewWindow(win, payload);
  }, 200);
}

function bindMarketingDraftPreviewListeners() {
  const ids = [
    "mkHeroEyebrow",
    "mkHeroTitle",
    "mkHeroLead",
    "mkHeroImageUrl",
    "mkHeroImageAlt",
  ];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el || el.dataset.mkDraftBound === "1") continue;
    el.dataset.mkDraftBound = "1";
    el.addEventListener("input", updateMarketingDraftSitePreview);
  }
  updateMarketingDraftSitePreview();
}

function renderMarketing(data) {
  const c = data?.content || {};
  const seo = c.seo || {};
  const hero = c.hero || {};
  const features = c.features || {};
  const cards = Array.isArray(features.cards) ? features.cards : [{}, {}, {}];
  const discover = c.discover || {};
  const pricing = c.pricing || {};
  const footer = c.footer || {};
  const footerSocial = Array.isArray(footer.social) ? footer.social : [];
  const free = pricing.free || {};
  const pro = pricing.pro || {};
  const faq = c.faq || {};
  const faqItems = Array.isArray(faq.items) ? faq.items : [];
  const finalCta = c.finalCta || {};
  const related = c.related || {};
  const relatedLinks = Array.isArray(related.links) ? related.links : [];
  const locale = state.marketingLocale || "en";
  const pageKey = state.marketingPage || data?.page || "home";
  const isHome = pageKey === "home";
  const pageCatalog = Array.isArray(data?.pages) ? data.pages : [];
  const pageMeta = pageCatalog.find((p) => p.key === pageKey) || { label: pageKey, preview: { en: "/", ar: "/ar" } };
  const previewPath = pageMeta.preview?.[locale] || "/";
  const updated = data?.updatedAt ? fmtDate(data.updatedAt) : "Using defaults (not saved yet)";
  const source = data?.source === "database" ? "Published in database" : "Defaults only — save to publish";

  const pagePicker = (pageCatalog.length ? pageCatalog : [
    { key: "home", label: "Homepage" },
    { key: "ai-music-generator", label: "AI Music Generator" },
    { key: "hum-to-song", label: "Hum to Song" },
    { key: "lyrics-to-song", label: "Lyrics to Song" },
    { key: "photo-to-song", label: "Photo to Song" },
    { key: "arabic-ai-music-generator", label: "Arabic AI Music" },
  ]).map((p) => (
    `<button type="button" class="btnGhost${p.key === pageKey ? " isActivePage" : ""}" data-marketing-page="${escapeHtml(p.key)}"${p.key === pageKey ? " disabled" : ""}>${escapeHtml(p.label)}</button>`
  )).join("");

  const faqFields = [0, 1, 2].map((i) => {
    const it = faqItems[i] || {};
    return `<div class="marketingBlock">
      ${marketingField(`FAQ ${i + 1} question`, `mkFaqQ${i}`, it.question || "")}
      ${marketingField(`FAQ ${i + 1} answer`, `mkFaqA${i}`, it.answerHtml || "", { multiline: 3, hint: "Simple HTML allowed for links." })}
    </div>`;
  }).join("");

  const relatedFields = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
    const link = relatedLinks[i] || {};
    return `<div class="marketingBlock marketingBlock--inline">
      ${marketingField(`Link ${i + 1} label`, `mkRelatedLabel${i}`, link.label || "")}
      ${marketingField(`Link ${i + 1} URL`, `mkRelatedHref${i}`, link.href || "", { hint: "e.g. /hum-to-song" })}
    </div>`;
  }).join("");

  const card0Links = cards[0]?.links || [];
  const featureLinkFields = isHome ? [0, 1, 2].map((i) => {
    const link = card0Links[i] || {};
    return `<div class="marketingBlock marketingBlock--inline">
      ${marketingField(`Feature card link ${i + 1} label`, `mkFeatureLinkLabel${i}`, link.label || "")}
      ${marketingField(`Feature card link ${i + 1} URL`, `mkFeatureLinkHref${i}`, link.href || "", { hint: "Shown under the first feature card on homepage." })}
    </div>`;
  }).join("") : "";

  const homeOnlySections = isHome ? `
      <section class="detailCard">
        <h3 class="detailCardTitle">Discover teaser</h3>
        ${marketingField("Eyebrow", "mkDiscoverEyebrow", discover.eyebrow || "")}
        ${marketingField("Title", "mkDiscoverTitle", discover.title || "")}
        ${marketingField("Lead", "mkDiscoverLead", discover.lead || "", { multiline: 2 })}
        ${marketingField("CTA label", "mkDiscoverCtaLabel", discover.ctaLabel || "")}
        ${marketingField("CTA link", "mkDiscoverCtaHref", discover.ctaHref || "")}
        ${marketingField("Featured Discover song IDs", "mkDiscoverFeaturedIds", (discover.featuredSongIds || []).join("\\n"), { multiline: 4, hint: "One public song UUID per line. Order = carousel order. Pick from recent publications below." })}
        <div id="mkDiscoverPicker" class="marketingDiscoverPicker"></div>
      </section>

      <section class="detailCard">
        <h3 class="detailCardTitle">Pricing</h3>
        ${marketingField("Section eyebrow", "mkPricingEyebrow", pricing.eyebrow || "")}
        ${marketingField("Section title", "mkPricingTitle", pricing.title || "")}
        <div class="marketingBlock">
          <h4>Free tier</h4>
          ${marketingField("Image URL", "mkPricingFreeImageUrl", free.imageUrl || "", { hint: "App screenshot or uploaded marketing asset." })}
          ${marketingField("Image alt", "mkPricingFreeImageAlt", free.imageAlt || "")}
          ${marketingField("Title", "mkPricingFreeTitle", free.title || "")}
          ${marketingField("Price label", "mkPricingFreePrice", free.price || "")}
          ${marketingField("Body", "mkPricingFreeBody", free.body || "", { multiline: 3 })}
          ${marketingField("CTA label", "mkPricingFreeCtaLabel", free.ctaLabel || "")}
          ${marketingField("CTA link", "mkPricingFreeCtaHref", free.ctaHref || "")}
        </div>
        <div class="marketingBlock">
          <h4>Pro tier</h4>
          ${marketingField("Image URL", "mkPricingProImageUrl", pro.imageUrl || "", { hint: "Pro screenshot or marketing asset." })}
          ${marketingField("Image alt", "mkPricingProImageAlt", pro.imageAlt || "")}
          ${marketingField("Title", "mkPricingProTitle", pro.title || "")}
          ${marketingField("Price label", "mkPricingProPrice", pro.price || "")}
          ${marketingField("Body", "mkPricingProBody", pro.body || "", { multiline: 3 })}
          ${marketingField("CTA label", "mkPricingProCtaLabel", pro.ctaLabel || "")}
          ${marketingField("CTA link", "mkPricingProCtaHref", pro.ctaHref || "")}
        </div>
      </section>

      <section class="detailCard">
        <h3 class="detailCardTitle">Footer social links</h3>
        <p class="cellMuted">Icons appear on the homepage footer. Leave URL empty to show a muted placeholder until you add the link.</p>
        ${["instagram", "facebook", "tiktok", "youtube", "discord"].map((platform) => {
          const row = footerSocial.find((it) => it.platform === platform) || { platform, href: "", label: platform };
          return `<div class="marketingBlock marketingBlock--inline">
            ${marketingField(`${platform} URL`, `mkSocialHref${platform}`, row.href || "", { hint: "Full https:// link" })}
            ${marketingField(`${platform} label`, `mkSocialLabel${platform}`, row.label || platform, { hint: "Accessibility label" })}
          </div>`;
        }).join("")}
      </section>` : "";

  els.panels.marketing.innerHTML = adminPageStack(`
    <div class="toolbarBlock marketingToolbar">
      <div class="inlineStats">
        <span>Page: <strong>${escapeHtml(pageMeta.label || pageKey)}</strong></span>
        <span>Locale: <strong>${locale === "ar" ? "Arabic" : "English"}</strong></span>
        <span>${escapeHtml(source)}</span>
        <span>Updated: ${escapeHtml(updated)}</span>
      </div>
      <div class="marketingPagePicker">${pagePicker}</div>
      <div class="heroActions" style="margin-top:12px">
        <button type="button" class="btnGhost" data-marketing-locale="en" ${locale === "en" ? "disabled" : ""}>English</button>
        <button type="button" class="btnGhost" data-marketing-locale="ar" ${locale === "ar" ? "disabled" : ""}>Arabic</button>
        <button type="button" class="btnGhost" id="btnMarketingDraftPreview" data-preview-path="${escapeHtml(previewPath)}">Preview draft ↗</button>
        <a class="btnGhost" id="btnMarketingPreview" href="${escapeHtml(previewPath)}" target="_blank" rel="noopener">Preview live page ↗</a>
        <button type="button" class="btnPrimary" id="btnMarketingSave">Save &amp; publish</button>
      </div>
      <p class="cellMuted marketingToolbarNote">Upload and edits stay private until you click Save &amp; publish. Preview draft shows your current form on the real site layout.</p>
      <p id="marketingSaveMsg" class="grantMsg" hidden></p>
    </div>

    <div class="marketingEditor">
      <section class="detailCard">
        <h3 class="detailCardTitle">SEO</h3>
        ${marketingField("Page title", "mkSeoTitle", seo.title || "")}
        ${marketingField("Meta description", "mkSeoDescription", seo.description || "", { multiline: 3 })}
      </section>

      <section class="detailCard">
        <h3 class="detailCardTitle">Hero</h3>
        ${marketingField("Eyebrow", "mkHeroEyebrow", hero.eyebrow || "")}
        ${marketingField("Headline", "mkHeroTitle", hero.title || "")}
        ${marketingField("Lead paragraph", "mkHeroLead", hero.lead || "", { multiline: 4 })}
        ${marketingField("Primary CTA label", "mkHeroCtaLabel", hero.ctaLabel || "")}
        ${marketingField("Primary CTA link", "mkHeroCtaHref", hero.ctaHref || "", { hint: "e.g. /app/#/intro" })}
        ${marketingField("Secondary link label", "mkHeroSecondaryLabel", hero.secondaryLabel || "")}
        ${marketingField("Secondary link URL", "mkHeroSecondaryHref", hero.secondaryHref || "")}
        ${marketingField("Hero image URL", "mkHeroImageUrl", hero.heroImageUrl || "")}
        <label class="field marketingField">
          <span>Upload new hero image</span>
          <input id="mkHeroImageFile" type="file" accept="image/jpeg,image/png,image/webp" />
          <span class="cellMuted">JPEG/PNG/WebP up to 8 MB. Updates the draft preview below — not live until Save &amp; publish.</span>
        </label>
        ${marketingField("Hero image alt text", "mkHeroImageAlt", hero.heroImageAlt || "")}
        <div class="marketingDraftSitePreview" id="mkDraftSitePreview">
          <p class="marketingDraftSitePreviewLabel">Draft hero preview</p>
          <div class="marketingDraftHero">
            <div class="marketingDraftHeroCopy">
              <p class="eyebrow" id="mkDraftHeroEyebrow">${escapeHtml(hero.eyebrow || "")}</p>
              <h2 id="mkDraftHeroTitle">${escapeHtml(hero.title || "")}</h2>
              <p id="mkDraftHeroLead">${escapeHtml(hero.lead || "")}</p>
            </div>
            <img id="mkDraftHeroImage" class="marketingDraftHeroImage" src="${escapeHtml(hero.heroImageUrl || "")}" alt="" ${hero.heroImageUrl ? "" : "hidden"} />
          </div>
        </div>
      </section>

      <section class="detailCard">
        <h3 class="detailCardTitle">Features</h3>
        ${marketingField("Section eyebrow", "mkFeaturesEyebrow", features.eyebrow || "")}
        ${marketingField("Section title", "mkFeaturesTitle", features.title || "")}
        ${[0, 1, 2].map((i) => `
          <div class="marketingBlock">
            ${marketingField(`Card ${i + 1} title`, `mkFeatureTitle${i}`, cards[i]?.title || "")}
            ${marketingField(`Card ${i + 1} body`, `mkFeatureBody${i}`, cards[i]?.body || "", { multiline: 3 })}
            ${marketingField(`Card ${i + 1} image URL`, `mkFeatureImageUrl${i}`, cards[i]?.imageUrl || "", { hint: "Use /assets/marketing/… or upload via Hero image tool and paste URL." })}
            ${marketingField(`Card ${i + 1} image alt`, `mkFeatureImageAlt${i}`, cards[i]?.imageAlt || "")}
            ${i === 0 ? featureLinkFields : ""}
          </div>`).join("")}
      </section>

      ${homeOnlySections}

      <section class="detailCard">
        <h3 class="detailCardTitle">FAQ</h3>
        ${marketingField("Section title", "mkFaqTitle", faq.title || "")}
        ${faqFields}
      </section>

      <section class="detailCard">
        <h3 class="detailCardTitle">Related pages</h3>
        ${marketingField("Section title", "mkRelatedTitle", related.title || "")}
        ${relatedFields}
      </section>

      <section class="detailCard">
        <h3 class="detailCardTitle">Final CTA band</h3>
        ${marketingField("Title", "mkFinalTitle", finalCta.title || "")}
        ${marketingField("Body", "mkFinalBody", finalCta.body || "", { multiline: 3 })}
        ${marketingField("CTA label", "mkFinalCtaLabel", finalCta.ctaLabel || "")}
        ${marketingField("CTA link", "mkFinalCtaHref", finalCta.ctaHref || "")}
      </section>
    </div>
  `, { plain: true });
  bindMarketingDraftPreviewListeners();
  if (isHome) void bindMarketingDiscoverPicker();
}

async function bindMarketingDiscoverPicker() {
  const root = document.getElementById("mkDiscoverPicker");
  const field = document.getElementById("mkDiscoverFeaturedIds");
  if (!root || !field) return;
  root.innerHTML = `<p class="cellMuted">Loading recent publications…</p>`;
  try {
    const data = await adminFetch("publications", { limit: 24, offset: 0 });
    const rows = data?.publications || [];
    if (!rows.length) {
      root.innerHTML = `<p class="cellMuted">No public Discover posts yet. Publish songs first, then pick them here.</p>`;
      return;
    }
    root.innerHTML = `
      <p class="marketingDiscoverPickerLabel">Pick from recent public posts</p>
      <div class="marketingDiscoverPickerGrid">
        ${rows.map((p) => `
          <button type="button" class="marketingDiscoverPick" data-add-discover-song="${escapeHtml(p.id)}" title="${escapeHtml(p.title)}">
            ${p.artUrl ? `<img src="${escapeHtml(p.artUrl)}" alt="" loading="lazy">` : `<span class="pubArtFallback">♪</span>`}
            <span>${escapeHtml(p.title)}</span>
          </button>`).join("")}
      </div>`;
  } catch (e) {
    root.innerHTML = `<p class="cellMuted">Could not load publications: ${escapeHtml(e?.message || String(e))}</p>`;
  }
}

const RENDERERS = {
  overview: renderOverview,
  providers: renderProviders,
  suno: renderProviders,
  users: renderUsers,
  user: renderUserDetail,
  generation: renderGenerationDetail,
  credits: renderCredits,
  marketing: renderMarketing,
  promos: renderPromos,
  singers: renderSingers,
  generations: renderGenerations,
  publications: renderPublications,
  subscriptions: renderSubscriptions,
  billing: renderBilling,
  settings: renderSettings,
};

function setView(view) {
  if (!canAccessView(view)) {
    view = firstAllowedView();
  }
  state.view = view;
  state.offset = 0;
  if (view !== "users") state.userSearch = "";
  if (view !== "billing") state.billingSearch = "";
  if (view !== "user") state.userDetailId = "";
  if (view !== "generation") state.generationDetailId = "";
  const meta = VIEW_META[view] || VIEW_META.overview;
  els.pageTitle.textContent = meta.title;
  els.pageSub.textContent = meta.sub;
  for (const btn of els.navItems) {
    btn.classList.toggle("isActive", btn.dataset.view === view);
  }
  for (const [key, panel] of Object.entries(els.panels)) {
    panel.hidden = key !== view;
  }
}

async function adminLogProviderTopUp({ provider, amountUsd, amountCredits, note, eventType = "top_up" } = {}) {
  await refreshSessionIfNeeded();
  const token = state.session?.access_token;
  if (!token) throw new Error("Not signed in");
  const body = { provider, eventType };
  if (amountUsd != null && Number.isFinite(Number(amountUsd)) && Number(amountUsd) >= 0) {
    body.amountUsd = Number(amountUsd);
  }
  if (amountCredits != null && Number.isFinite(Number(amountCredits)) && Number(amountCredits) > 0) {
    body.amountCredits = Number(amountCredits);
  }
  if (note) body.note = note;
  const r = await fetch("/api/admin/provider-wallet", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) {
    writeSession(null);
    throw new Error("Session expired — sign in again");
  }
  if (r.status === 403) {
    throw new Error(data?.error || "You cannot log provider top-ups.");
  }
  if (!r.ok || !data?.ok) {
    throw new Error(data?.error || `Top-up failed (${r.status})`);
  }
  return data;
}

function syncProviderTopUpFormUi(form = document.getElementById("providerTopUpForm")) {
  if (!form) return;
  const provider = form.querySelector("#providerTopUpSelect")?.value || "";
  const action = form.querySelector("#providerTopUpAction")?.value || "top_up";
  const isGemini = provider === "gemini";
  const actionWrap = form.querySelector("#providerTopUpActionWrap");
  const creditsWrap = form.querySelector("#providerTopUpCreditsWrap");
  const usdLabel = form.querySelector("#providerTopUpUsdLabel");
  const submit = form.querySelector("#providerTopUpSubmit");
  if (actionWrap) actionWrap.hidden = !isGemini;
  if (creditsWrap) creditsWrap.hidden = isGemini;
  if (usdLabel) {
    usdLabel.textContent = isGemini && action === "balance_snapshot"
      ? "Current AI Studio balance (USD)"
      : "USD";
  }
  if (submit) {
    submit.textContent = isGemini && action === "balance_snapshot" ? "Set balance" : "Save top-up";
  }
}

function setProviderTopUpMsg(text, kind = "ok") {
  const el = document.getElementById("providerTopUpMsg");
  if (!el) return;
  if (!text) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = text;
  el.style.color = kind === "err" ? "#fca5a5" : kind === "warn" ? "#fcd34d" : "#86efac";
}

async function adminGrantPaidCredits({ email = "", amount } = {}) {
  await refreshSessionIfNeeded();
  const token = state.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const body = { amount: Number(amount) };
  const trimmedEmail = String(email || "").trim().toLowerCase();
  if (trimmedEmail) body.email = trimmedEmail;

  const r = await fetch("/api/credits/grant-paid", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) {
    writeSession(null);
    throw new Error("Session expired — sign in again");
  }
  if (r.status === 403) {
    throw new Error("This account is not an admin.");
  }
  if (!r.ok || !data?.ok) {
    throw new Error(data?.error || `Grant failed (${r.status})`);
  }
  return data;
}

function setPromoCreateMsg(text, kind = "ok") {
  const el = document.getElementById("promoCreateMsg");
  if (!el) return;
  if (!text) {
    el.hidden = true;
    el.textContent = "";
    el.className = "grantMsg";
    return;
  }
  el.hidden = false;
  el.textContent = text;
  el.className = `grantMsg is${kind === "ok" ? "Ok" : kind === "warn" ? "Warn" : "Err"}`;
}

async function adminPromoRequest(method, body = {}) {
  await refreshSessionIfNeeded();
  const token = state.session?.access_token;
  if (!token) throw new Error("Not signed in");
  const r = await fetch("/api/admin/promos", {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) {
    writeSession(null);
    throw new Error("Session expired — sign in again");
  }
  if (r.status === 403) {
    throw new Error(data?.error || "You do not have permission to manage promo codes.");
  }
  if (!r.ok || !data?.ok) {
    throw new Error(data?.error || `Request failed (${r.status})`);
  }
  return data;
}

async function adminSingersRequest(body = {}) {
  await refreshSessionIfNeeded();
  const token = state.session?.access_token;
  if (!token) throw new Error("Not signed in");
  const r = await fetch("/api/admin/singers", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) {
    writeSession(null);
    throw new Error("Session expired — sign in again");
  }
  if (r.status === 403) {
    throw new Error(data?.error || "You do not have permission to manage singers.");
  }
  if (!r.ok || !data?.ok) {
    const err = data?.error;
    throw new Error(typeof err === "string" ? err : `Request failed (${r.status})`);
  }
  return data;
}

async function adminModerate(action, payload = {}) {
  await refreshSessionIfNeeded();
  const token = state.session?.access_token;
  if (!token) throw new Error("Not signed in");
  const r = await fetch("/api/admin/moderate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) {
    writeSession(null);
    throw new Error("Session expired — sign in again");
  }
  if (r.status === 403) {
    throw new Error(data?.error || "You do not have permission to moderate publications.");
  }
  if (!r.ok) {
    throw new Error(data?.error || `Request failed (${r.status})`);
  }
  return data;
}

async function teamSearch(query) {
  await refreshSessionIfNeeded();
  const token = state.session?.access_token;
  if (!token) return [];
  const qs = new URLSearchParams({ search: query });
  const r = await fetch(`/api/admin/team?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return [];
  return Array.isArray(data.results) ? data.results : [];
}

function setGrantCreditsMsg(text, kind = "ok") {
  const el = document.getElementById("grantCreditsMsg");
  if (!el) return;
  if (!text) {
    el.hidden = true;
    el.textContent = "";
    el.className = "grantMsg";
    return;
  }
  el.hidden = false;
  el.textContent = text;
  el.className = `grantMsg is${kind === "ok" ? "Ok" : kind === "warn" ? "Warn" : "Err"}`;
}

function setTeamInviteMsg(text, kind = "ok") {
  const el = document.getElementById("teamInviteMsg");
  if (!el) return;
  if (!text) {
    el.hidden = true;
    el.textContent = "";
    el.className = "grantMsg";
    return;
  }
  el.hidden = false;
  el.textContent = text;
  el.className = `grantMsg is${kind === "ok" ? "Ok" : kind === "warn" ? "Warn" : "Err"}`;
}

function clearSettingsCache() {
  for (const key of Object.keys(state.cache)) {
    if (key.startsWith("settings:")) delete state.cache[key];
  }
}

function clearCreditsCache() {
  for (const key of Object.keys(state.cache)) {
    if (key.startsWith("credits:")) delete state.cache[key];
  }
}

function clearPromosCache() {
  for (const key of Object.keys(state.cache)) {
    if (key.startsWith("promos:")) delete state.cache[key];
  }
}

async function loadView({ force = false } = {}) {
  const view = state.view;
  const cacheKey = viewCacheKey();
  const panel = els.panels[view];
  if (!force && state.cache[cacheKey]) {
    panel.classList.remove("isLoading");
    RENDERERS[view](state.cache[cacheKey]);
    return;
  }
  panel.classList.add("isLoading");
  panel.innerHTML = `<div class="adminPageStack"><div class="loading">Loading…</div></div>`;
  showError("");
  try {
    let data;
    if (view === "marketing") {
      data = await marketingAdminFetch(state.marketingPage || "home", state.marketingLocale || "en");
      data.page = state.marketingPage || "home";
    } else {
      data = await adminFetch(view, {
        offset: state.offset,
        search: view === "users"
          ? state.userSearch
          : view === "billing"
            ? state.billingSearch
            : "",
        userId: view === "user" ? state.userDetailId : "",
        generationId: view === "generation" ? state.generationDetailId : "",
        healthRefresh: force && (view === "providers" || view === "suno"),
      });
    }
    if (view === "settings" && state.adminSession?.canManageTeam) {
      try {
        const team = await teamFetch();
        data = {
          ...data,
          members: team.members,
          teamRoles: team.roles,
          pendingInvites: team.pendingInvites,
          audit: team.audit,
        };
      } catch (e) {
        data.teamError = e?.message || String(e);
        data.teamRoles = data.roles || [];
      }
    }
    state.cache[cacheKey] = data;
    RENDERERS[view](data);
  } catch (e) {
    panel.innerHTML = "";
    const msg = e?.message || String(e);
    showError(msg);
    if (
      msg.includes("sign in") ||
      msg.includes("not an admin") ||
      msg.includes("Session expired")
    ) {
      writeSession(null);
      showLogin();
      showLoginError(msg);
    }
  } finally {
    panel.classList.remove("isLoading");
  }
}

function showLogin() {
  if (els.resetScreen) els.resetScreen.hidden = true;
  els.loginScreen.hidden = false;
  els.appShell.hidden = true;
}

function showApp() {
  if (els.resetScreen) els.resetScreen.hidden = true;
  if (els.loginScreen) els.loginScreen.hidden = true;
  if (els.appShell) els.appShell.hidden = false;
  els.adminUserEmail.textContent = state.session?.email || "";
}

async function openDashboard() {
  showApp();
  try {
    await loadAdminSession({ force: true });
  } catch (e) {
    showError(e?.message || "Could not load admin session");
    if (String(e?.message || "").includes("not an admin") || String(e?.message || "").includes("access")) {
      writeSession(null);
      showLogin();
    }
    return false;
  }
  setView(firstAllowedView());
  await loadView({ force: true });
  showError("");
  return true;
}

async function boot() {
  // Hide dashboard until we know auth state; login shows by default in HTML.
  if (els.appShell) els.appShell.hidden = true;
  if (els.loginScreen) els.loginScreen.hidden = false;

  try {
    await loadConfig();
  } catch (e) {
    if (els.loginScreen) {
      els.loginScreen.hidden = false;
      showLoginError(e?.message || "Could not load config");
    }
    return;
  }

  state.session = readSession();

  const recovery = parseRecoveryCallback();
  if (recovery?.tokenHash) {
    state.recoveryTokenHash = recovery.tokenHash;
    showResetScreen();
    return;
  }

  const oauthPreview = parseOAuthCallback();
  if (oauthPreview.code || oauthPreview.accessToken) {
    showLoginError("Finishing Google sign-in…");
  } else if (oauthPreview.error) {
    clearOAuthMarkers();
    showLoginError(decodeURIComponent(String(oauthPreview.error).replace(/\+/g, " ")));
    clearOAuthCallbackFromUrl();
    return;
  }

  try {
    const handledOAuth = await maybeHandleAuthCallback();
    if (handledOAuth) {
      if (!state.session?.access_token) {
        showLogin();
        showLoginError("Google sign-in did not return a session. Try again.");
        return;
      }
      await hydrateSessionEmail();
      const signedInAs = state.session?.email || "unknown";
      if (!state.session?.email) {
        showLogin();
        showLoginError("Could not read your Google email. Use saminaoum2022@gmail.com or email + password.");
        return;
      }
      showLoginError(`Signed in as ${signedInAs}. Opening dashboard…`);
      const opened = await openDashboard();
      if (!opened) return;
      if (els.loginScreen && !els.loginScreen.hidden) return;
      showLoginError("");
      return;
    }
  } catch (e) {
    writeSession(null);
    showLogin();
    showLoginError(e?.message || "Google sign-in failed");
    return;
  }

  maybeShowInterruptedOAuthError();

  if (state.session) {
    try {
      const opened = await openDashboard();
      if (!opened) return;
      return;
    } catch (e) {
      writeSession(null);
      showLogin();
      showLoginError(e?.message || "Could not load admin dashboard");
      return;
    }
  }
  showLogin();
}

els.loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  showLoginError("");
  els.btnLogin.disabled = true;
  try {
    await signIn(els.loginEmail.value.trim(), els.loginPassword.value);
    const opened = await openDashboard();
    if (!opened) showLogin();
  } catch (err) {
    showLoginError(err?.message || "Sign in failed");
  } finally {
    els.btnLogin.disabled = false;
  }
});

els.btnLoginGoogle?.addEventListener("click", async () => {
  showLoginError("");
  if (els.btnLoginGoogle) els.btnLoginGoogle.disabled = true;
  try {
    await signInWithGoogle();
  } catch (err) {
    showLoginError(err?.message || "Could not start Google sign-in");
    if (els.btnLoginGoogle) els.btnLoginGoogle.disabled = false;
  }
});

els.resetForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  showResetError("");
  const pass = els.resetPassword?.value || "";
  const confirm = els.resetPasswordConfirm?.value || "";
  if (pass.length < 8) {
    showResetError("Password must be at least 8 characters.");
    return;
  }
  if (pass !== confirm) {
    showResetError("Passwords do not match.");
    return;
  }
  const tokenHash = state.recoveryTokenHash || parseRecoveryCallback()?.tokenHash || "";
  if (!tokenHash) {
    showResetError("Recovery link expired — request a new password reset email from Supabase.");
    return;
  }
  if (els.btnResetPassword) els.btnResetPassword.disabled = true;
  try {
    const verified = await verifyRecoveryToken(tokenHash);
    await updateUserPassword(verified.access_token, pass);
    writeSession(sessionFromTokenPayload(verified));
    state.recoveryTokenHash = "";
    clearOAuthCallbackFromUrl();
    if (els.resetScreen) els.resetScreen.hidden = true;
    const opened = await openDashboard();
    if (!opened) showLogin();
  } catch (err) {
    showResetError(err?.message || "Could not set password");
  } finally {
    if (els.btnResetPassword) els.btnResetPassword.disabled = false;
  }
});

els.btnSignOut?.addEventListener("click", () => {
  writeSession(null);
  state.cache = {};
  state.adminSession = null;
  showLogin();
});

els.btnRefresh?.addEventListener("click", () => {
  state.cache = {};
  void (async () => {
    await loadAdminSession({ force: true });
    await loadView({ force: true });
  })();
});

for (const btn of els.navItems) {
  btn.addEventListener("click", () => {
    setView(btn.dataset.view);
    void loadView();
  });
}

document.body.addEventListener("submit", (e) => {
  const userSearchForm = e.target.closest("#userSearchForm");
  if (userSearchForm) {
    e.preventDefault();
    const input = userSearchForm.querySelector("#userSearchInput");
    state.userSearch = String(input?.value || "").trim();
    state.offset = 0;
    void loadView({ force: true });
    return;
  }

  const billingSearchForm = e.target.closest("#billingSearchForm");
  if (billingSearchForm) {
    e.preventDefault();
    const input = billingSearchForm.querySelector("#billingSearchInput");
    state.billingSearch = String(input?.value || "").trim();
    state.offset = 0;
    void loadView({ force: true });
    return;
  }

  const promoForm = e.target.closest("#promoCreateForm");
  if (promoForm) {
    e.preventDefault();
    void (async () => {
      const codeInput = promoForm.querySelector("#promoCode");
      const prefixInput = promoForm.querySelector("#promoPrefix");
      const countInput = promoForm.querySelector("#promoCount");
      const creditsInput = promoForm.querySelector("#promoCredits");
      const maxInput = promoForm.querySelector("#promoMaxRedemptions");
      const expiresInput = promoForm.querySelector("#promoExpires");
      const btn = promoForm.querySelector("#btnPromoCreate");
      const credits = Number(creditsInput?.value);
      const count = Number(countInput?.value || 1);
      const maxRedemptions = Number(maxInput?.value || 1);
      const code = String(codeInput?.value || "").trim();
      const prefix = String(prefixInput?.value || "").trim();
      if (!Number.isFinite(credits) || credits <= 0) {
        setPromoCreateMsg("Enter credits between 1 and 5000.", "warn");
        return;
      }
      if (!code && !prefix) {
        setPromoCreateMsg("Enter a code or a batch prefix.", "warn");
        return;
      }
      if (btn) btn.disabled = true;
      setPromoCreateMsg("Creating…", "warn");
      try {
        const payload = {
          credits,
          maxRedemptions,
          count: prefix ? count : 1,
        };
        if (code) payload.code = code;
        if (prefix) payload.prefix = prefix;
        if (expiresInput?.value) payload.expiresAt = expiresInput.value;
        const data = await adminPromoRequest("POST", payload);
        if (codeInput) codeInput.value = "";
        if (prefixInput) prefixInput.value = "";
        if (countInput) countInput.value = "1";
        if (creditsInput) creditsInput.value = "";
        if (expiresInput) expiresInput.value = "";
        clearPromosCache();
        if (state.view === "promos") await loadView({ force: true });
        const codes = Array.isArray(data.codes) ? data.codes : [];
        setPromoCreateMsg(
          data.message || (codes.length ? `Created: ${codes.join(", ")}` : "Promo code created."),
          "ok",
        );
      } catch (err) {
        setPromoCreateMsg(err?.message || "Create failed", "err");
      } finally {
        if (btn) btn.disabled = false;
      }
    })();
    return;
  }

  const providerTopUpForm = e.target.closest("#providerTopUpForm");
  if (providerTopUpForm) {
    e.preventDefault();
    void (async () => {
      const provider = providerTopUpForm.querySelector("#providerTopUpSelect")?.value || "";
      const action = providerTopUpForm.querySelector("#providerTopUpAction")?.value || "top_up";
      const eventType = provider === "gemini" ? action : "top_up";
      const usdRaw = providerTopUpForm.querySelector("#providerTopUpUsd")?.value;
      const creditsRaw = providerTopUpForm.querySelector("#providerTopUpCredits")?.value;
      const note = String(providerTopUpForm.querySelector("#providerTopUpNote")?.value || "").trim();
      const amountUsd = usdRaw !== "" && usdRaw != null ? Number(usdRaw) : null;
      const amountCredits = creditsRaw !== "" && creditsRaw != null ? Number(creditsRaw) : null;
      const hasUsd = amountUsd != null && Number.isFinite(amountUsd)
        && (eventType === "balance_snapshot" ? amountUsd >= 0 : amountUsd > 0);
      const hasCredits = amountCredits != null && Number.isFinite(amountCredits) && amountCredits > 0;
      if (eventType === "balance_snapshot") {
        if (!hasUsd) {
          setProviderTopUpMsg("Enter your current AI Studio prepay balance (USD, ≥ 0).", "warn");
          return;
        }
      } else if (!hasUsd && !hasCredits) {
        setProviderTopUpMsg("Enter USD and/or credits (must be > 0).", "warn");
        return;
      }
      setProviderTopUpMsg("Saving…", "warn");
      try {
        await adminLogProviderTopUp({
          provider,
          eventType,
          amountUsd: hasUsd ? amountUsd : null,
          amountCredits: hasCredits ? amountCredits : null,
          note,
        });
        providerTopUpForm.reset();
        syncProviderTopUpFormUi(providerTopUpForm);
        state.cache = {};
        if (state.view === "providers" || state.view === "suno") {
          await loadView({ force: true });
        }
        setProviderTopUpMsg(
          eventType === "balance_snapshot"
            ? "Balance set — Gemini / Lyria row updated."
            : "Top-up saved — Balance column updated.",
          "ok",
        );
      } catch (err) {
        setProviderTopUpMsg(err?.message || "Save failed", "err");
      }
    })();
    return;
  }

  const grantForm = e.target.closest("#grantCreditsForm");
  if (grantForm) {
    e.preventDefault();
    void (async () => {
      const emailInput = grantForm.querySelector("#grantCreditsEmail");
      const amountInput = grantForm.querySelector("#grantCreditsAmount");
      const btn = grantForm.querySelector("#btnGrantCredits");
      const amount = Number(amountInput?.value);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 500) {
        setGrantCreditsMsg("Enter an amount between 1 and 500.", "warn");
        return;
      }
      if (btn) btn.disabled = true;
      setGrantCreditsMsg("Granting…", "warn");
      try {
        const data = await adminGrantPaidCredits({
          email: emailInput?.value || "",
          amount,
        });
        const who = data.email || state.session?.email || "user";
        if (amountInput) amountInput.value = "";
        clearCreditsCache();
        if (state.view === "credits") await loadView({ force: true });
        setGrantCreditsMsg(
          `Granted ${fmtNum(data.granted, 1)} paid credits to ${who}. New balance: ${fmtNum(data.balance, 1)}.`,
          "ok",
        );
      } catch (err) {
        setGrantCreditsMsg(err?.message || "Grant failed", "err");
      } finally {
        if (btn) btn.disabled = false;
      }
    })();
    return;
  }

  const teamForm = e.target.closest("#teamInviteForm");
  if (!teamForm) return;
  e.preventDefault();
  void (async () => {
    const lookupInput = teamForm.querySelector("#teamInviteLookup");
    const roleInput = teamForm.querySelector("#teamInviteRole");
    const sendInviteInput = teamForm.querySelector("#teamInviteSendEmail");
    const btn = teamForm.querySelector("#btnTeamInvite");
    const lookup = String(lookupInput?.value || "").trim();
    const role = String(roleInput?.value || "").trim();
    const sendInvite = sendInviteInput ? sendInviteInput.checked : true;
    if (!lookup) {
      setTeamInviteMsg("Enter an email or @username.", "warn");
      return;
    }
    if (btn) btn.disabled = true;
    setTeamInviteMsg("Granting access…", "warn");
    try {
      const r = await teamFetch("", {
        method: "POST",
        body: JSON.stringify({ lookup, role, sendInvite }),
      });
      if (lookupInput) lookupInput.value = "";
      clearSettingsCache();
      if (state.view === "settings") await loadView({ force: true });
      setTeamInviteMsg(r.message || `Dashboard access granted for ${lookup}.`, "ok");
    } catch (err) {
      setTeamInviteMsg(err?.message || "Could not grant access", "err");
    } finally {
      if (btn) btn.disabled = false;
    }
  })();
});

document.body.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const row = e.target.closest("tr.rowClickable");
  if (!row) return;
  e.preventDefault();
  if (row.dataset.userView) openUserDetail(row.dataset.userView, row.dataset.returnView || "users");
  else if (row.dataset.generationView) openGenerationDetail(row.dataset.generationView, row.dataset.returnView || "generations");
});

document.body.addEventListener("click", (e) => {
  const pageBtn = e.target.closest("[data-page]");
  if (pageBtn) {
    const total = state.cache[viewCacheKey()]?.total || 0;
    if (pageBtn.dataset.page === "prev" && state.offset > 0) {
      state.offset = Math.max(0, state.offset - PAGE_SIZE);
      void loadView();
    } else if (pageBtn.dataset.page === "next" && state.offset + PAGE_SIZE < total) {
      state.offset += PAGE_SIZE;
      void loadView();
    }
    return;
  }

  const marketingPageBtn = e.target.closest("[data-marketing-page]");
  if (marketingPageBtn) {
    const page = marketingPageBtn.dataset.marketingPage;
    if (page && page !== state.marketingPage) {
      state.marketingPage = page;
      void loadView({ force: true });
    }
    return;
  }

  const marketingLocaleBtn = e.target.closest("[data-marketing-locale]");
  if (marketingLocaleBtn) {
    const loc = marketingLocaleBtn.dataset.marketingLocale;
    if (loc && loc !== state.marketingLocale) {
      state.marketingLocale = loc;
      void loadView({ force: true });
    }
    return;
  }

  const marketingDraftPreviewBtn = e.target.closest("#btnMarketingDraftPreview");
  if (marketingDraftPreviewBtn) {
    openMarketingDraftPreview(marketingDraftPreviewBtn.dataset.previewPath || "/");
    return;
  }

  const discoverPickBtn = e.target.closest("[data-add-discover-song]");
  if (discoverPickBtn) {
    const songId = String(discoverPickBtn.dataset.addDiscoverSong || "").trim();
    const field = document.getElementById("mkDiscoverFeaturedIds");
    if (!songId || !field) return;
    const ids = field.value.split(/[\s,]+/g).map((id) => id.trim()).filter(Boolean);
    if (!ids.includes(songId)) ids.push(songId);
    field.value = ids.join("\n");
    return;
  }

  const marketingSaveBtn = e.target.closest("#btnMarketingSave");
  if (marketingSaveBtn) {
    void (async () => {
      const msg = document.getElementById("marketingSaveMsg");
      marketingSaveBtn.disabled = true;
      if (msg) {
        msg.hidden = false;
        msg.textContent = "Saving…";
        msg.className = "grantMsg warn";
      }
      try {
        const content = readMarketingFormContent(state.marketingPage || "home");
        await marketingAdminSave({
          page: state.marketingPage || "home",
          locale: state.marketingLocale || "en",
          content,
        });
        delete state.cache[viewCacheKey()];
        if (msg) {
          msg.textContent = "Saved — page updates within a minute.";
          msg.className = "grantMsg ok";
        }
        showError("");
        await loadView({ force: true });
      } catch (err) {
        if (msg) {
          msg.textContent = err?.message || "Save failed";
          msg.className = "grantMsg err";
        }
        showError(err?.message || "Save failed");
      } finally {
        marketingSaveBtn.disabled = false;
      }
    })();
    return;
  }

  const promoToggleBtn = e.target.closest("[data-promo-toggle]");
  if (promoToggleBtn) {
    const code = promoToggleBtn.dataset.promoToggle;
    const currentlyActive = promoToggleBtn.dataset.promoActive === "1";
    if (!code) return;
    void (async () => {
      promoToggleBtn.disabled = true;
      try {
        await adminPromoRequest("PATCH", { code, active: !currentlyActive });
        clearPromosCache();
        if (state.view === "promos") await loadView({ force: true });
        showError("");
      } catch (err) {
        showError(err?.message || "Could not update promo code");
      } finally {
        promoToggleBtn.disabled = false;
      }
    })();
    return;
  }

  const singerApproveBtn = e.target.closest("[data-singer-approve]");
  if (singerApproveBtn) {
    const applicationId = singerApproveBtn.dataset.singerApprove;
    if (!applicationId) return;
    void (async () => {
      singerApproveBtn.disabled = true;
      try {
        await adminSingersRequest({ action: "approve_application", applicationId });
        if (state.view === "singers") await loadView({ force: true });
        showError("");
      } catch (err) {
        showError(err?.message || "Could not approve application");
      } finally {
        singerApproveBtn.disabled = false;
      }
    })();
    return;
  }

  const singerRejectBtn = e.target.closest("[data-singer-reject]");
  if (singerRejectBtn) {
    const applicationId = singerRejectBtn.dataset.singerReject;
    if (!applicationId) return;
    const adminNotes = window.prompt("Optional note for the applicant (shown in app):") || "";
    void (async () => {
      singerRejectBtn.disabled = true;
      try {
        await adminSingersRequest({ action: "reject_application", applicationId, adminNotes });
        if (state.view === "singers") await loadView({ force: true });
        showError("");
      } catch (err) {
        showError(err?.message || "Could not reject application");
      } finally {
        singerRejectBtn.disabled = false;
      }
    })();
    return;
  }

  const singerToggleBtn = e.target.closest("[data-singer-toggle]");
  if (singerToggleBtn) {
    const userId = singerToggleBtn.dataset.singerToggle;
    const currentlyActive = singerToggleBtn.dataset.singerActive === "1";
    if (!userId) return;
    void (async () => {
      singerToggleBtn.disabled = true;
      try {
        await adminSingersRequest({ action: "toggle_singer", userId, active: !currentlyActive });
        if (state.view === "singers") await loadView({ force: true });
        showError("");
      } catch (err) {
        showError(err?.message || "Could not update singer");
      } finally {
        singerToggleBtn.disabled = false;
      }
    })();
    return;
  }

  const requestSaveBtn = e.target.closest("[data-request-save]");
  if (requestSaveBtn) {
    const requestId = requestSaveBtn.dataset.requestSave;
    if (!requestId) return;
    void (async () => {
      requestSaveBtn.disabled = true;
      try {
        const status = document.querySelector(`[data-request-status="${requestId}"]`)?.value || "";
        const paymentStatus = document.querySelector(`[data-request-payment="${requestId}"]`)?.value || "";
        const singerId = document.querySelector(`[data-request-singer="${requestId}"]`)?.value || "";
        await adminSingersRequest({
          action: "update_request",
          requestId,
          status,
          paymentStatus,
          singerId: singerId || null,
        });
        if (state.view === "singers") await loadView({ force: true });
        showError("");
      } catch (err) {
        showError(err?.message || "Could not save request");
      } finally {
        requestSaveBtn.disabled = false;
      }
    })();
    return;
  }

  const userSearchClear = e.target.closest("#btnUserSearchClear");
  if (userSearchClear) {
    state.userSearch = "";
    state.offset = 0;
    void loadView({ force: true });
    return;
  }

  const billingSearchClear = e.target.closest("#billingSearchClear");
  if (billingSearchClear) {
    state.billingSearch = "";
    state.offset = 0;
    void loadView({ force: true });
    return;
  }

  const userViewBtn = e.target.closest("[data-user-view]");
  if (userViewBtn && !e.target.closest("form")) {
    const isRow = userViewBtn.classList?.contains("rowClickable") || userViewBtn.classList?.contains("cellLink");
    if (isRow && e.target.closest("a, button, input, select, textarea")) return;
    const uid = userViewBtn.dataset.userView;
    const returnView = userViewBtn.dataset.returnView || "users";
    if (uid) openUserDetail(uid, returnView);
    return;
  }

  const userDetailBack = e.target.closest("#btnUserDetailBack");
  if (userDetailBack) {
    const returnView = state.returnView || "users";
    setView(returnView);
    void loadView();
    return;
  }

  const userDetailGrant = e.target.closest("#btnUserDetailGrant");
  if (userDetailGrant) {
    state.grantPrefillEmail = userDetailGrant.dataset.grantEmail || "";
    setView("credits");
    void loadView({ force: true });
    return;
  }

  const generationViewBtn = e.target.closest("[data-generation-view]");
  if (generationViewBtn && !e.target.closest("form")) {
    if (generationViewBtn.classList?.contains("rowClickable") && e.target.closest("a, button, input, select, textarea")) return;
    const gid = generationViewBtn.dataset.generationView;
    const returnView = generationViewBtn.dataset.returnView || "generations";
    if (gid) openGenerationDetail(gid, returnView);
    return;
  }

  const generationDetailBack = e.target.closest("#btnGenerationDetailBack");
  if (generationDetailBack) {
    const returnView = state.returnView || "generations";
    setView(returnView);
    void loadView();
    return;
  }

  const revokeBtn = e.target.closest("[data-team-revoke]");
  if (revokeBtn) {
    const email = revokeBtn.dataset.teamRevoke;
    if (!email) return;
    if (!window.confirm(`Revoke dashboard access for ${email}?`)) return;
    void (async () => {
      revokeBtn.disabled = true;
      try {
        await teamFetch("", {
          method: "DELETE",
          body: JSON.stringify({ email }),
        });
        clearSettingsCache();
        if (state.view === "settings") await loadView({ force: true });
      } catch (err) {
        showError(err?.message || "Could not revoke access");
      } finally {
        revokeBtn.disabled = false;
      }
    })();
    return;
  }

  const inviteRevokeBtn = e.target.closest("[data-invite-revoke]");
  if (inviteRevokeBtn) {
    const inviteId = inviteRevokeBtn.dataset.inviteRevoke;
    if (!inviteId) return;
    if (!window.confirm("Cancel this pending invite?")) return;
    void (async () => {
      inviteRevokeBtn.disabled = true;
      try {
        await teamFetch("", {
          method: "DELETE",
          body: JSON.stringify({ inviteId }),
        });
        clearSettingsCache();
        if (state.view === "settings") await loadView({ force: true });
      } catch (err) {
        showError(err?.message || "Could not cancel invite");
      } finally {
        inviteRevokeBtn.disabled = false;
      }
    })();
    return;
  }

  const unpublishBtn = e.target.closest("[data-unpublish-song]");
  if (unpublishBtn) {
    const songId = unpublishBtn.dataset.unpublishSong;
    const title = unpublishBtn.dataset.songTitle || "this post";
    if (!songId) return;
    const reason = window.prompt(`Reason for unpublishing "${title}" (optional):`, "") ?? "";
    if (reason === null) return;
    void (async () => {
      unpublishBtn.disabled = true;
      try {
        await adminModerate("unpublish", { songId, reason });
        state.cache = {};
        if (state.view === "publications") await loadView({ force: true });
        showError("");
      } catch (err) {
        showError(err?.message || "Could not unpublish");
      } finally {
        unpublishBtn.disabled = false;
      }
    })();
  }
});

document.body.addEventListener("input", (e) => {
  const input = e.target.closest("#teamInviteLookup");
  if (!input) return;
  const box = document.getElementById("teamLookupResults");
  if (!box) return;
  const q = String(input.value || "").trim();
  if (q.length < 2 || q.includes("@") && q.indexOf("@") > 0) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  if (state._teamSearchTimer) clearTimeout(state._teamSearchTimer);
  state._teamSearchTimer = setTimeout(async () => {
    const results = await teamSearch(q.startsWith("@") ? q : `@${q.replace(/^@/, "")}`);
    if (!results.length) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    box.innerHTML = results.map((u) => `
      <button type="button" class="teamLookupHit" data-lookup-value="${escapeHtml(u.email || `@${u.username}`)}">
        <strong>${escapeHtml(u.name || u.username || "User")}</strong>
        <span>@${escapeHtml(u.username || "—")} · ${escapeHtml(u.email || "no email")}</span>
      </button>`).join("");
    box.hidden = false;
  }, 220);
});

document.body.addEventListener("click", (e) => {
  const hit = e.target.closest(".teamLookupHit");
  if (hit) {
    const input = document.getElementById("teamInviteLookup");
    const box = document.getElementById("teamLookupResults");
    if (input) input.value = hit.dataset.lookupValue || "";
    if (box) {
      box.hidden = true;
      box.innerHTML = "";
    }
    return;
  }
  if (!e.target.closest(".teamLookupField")) {
    const box = document.getElementById("teamLookupResults");
    if (box) box.hidden = true;
  }
});

document.body.addEventListener("change", (e) => {
  if (e.target.id === "providerTopUpSelect" || e.target.id === "providerTopUpAction") {
    syncProviderTopUpFormUi();
    return;
  }
  const select = e.target.closest(".teamRoleSelect[data-team-email]");
  if (!select || select.closest("#teamInviteForm")) return;
  const email = select.dataset.teamEmail;
  const role = select.value;
  if (!email || !role) return;
  void (async () => {
    select.disabled = true;
    try {
      await teamFetch("", {
        method: "POST",
        body: JSON.stringify({ email, role }),
      });
      clearSettingsCache();
      if (state.view === "settings") await loadView({ force: true });
    } catch (err) {
      showError(err?.message || "Could not update role");
      if (state.view === "settings") await loadView({ force: true });
    } finally {
      select.disabled = false;
    }
  })();
});

document.body.addEventListener("change", (e) => {
  const fileInput = e.target.closest("#mkHeroImageFile");
  if (!fileInput?.files?.[0]) return;
  const file = fileInput.files[0];
  void (async () => {
    const msg = document.getElementById("marketingSaveMsg");
    revokeMarketingHeroBlobUrl();
    state.marketingHeroBlobUrl = URL.createObjectURL(file);
    state.marketingHeroUploading = true;
    updateMarketingDraftSitePreview();
    if (msg) {
      msg.hidden = false;
      msg.textContent = "Uploading image…";
      msg.className = "grantMsg warn";
    }
    try {
      const data = await marketingAdminUploadImage(file);
      const urlInput = document.getElementById("mkHeroImageUrl");
      if (urlInput && data.url) {
        urlInput.value = data.url;
        urlInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
      revokeMarketingHeroBlobUrl();
      updateMarketingDraftSitePreview();
      if (msg) {
        msg.textContent = "Upload complete — image is in your draft. Open Preview draft ↗ to see it on the site. Save & publish when ready.";
        msg.className = "grantMsg ok";
      }
      fileInput.value = "";
    } catch (err) {
      revokeMarketingHeroBlobUrl();
      updateMarketingDraftSitePreview();
      if (msg) {
        msg.textContent = err?.message || "Upload failed";
        msg.className = "grantMsg err";
      }
      showError(err?.message || "Upload failed");
    } finally {
      state.marketingHeroUploading = false;
    }
  })();
});

window.addEventListener("message", (e) => {
  const allowed = [MARKETING_SITE_ORIGIN, "https://admin.nabadai.com", window.location.origin];
  if (!allowed.includes(e.origin)) return;
  if (e.data?.type !== "nabad-marketing-preview-ready") return;
  if (!state.marketingDraftPreviewPayload) return;
  if (state.marketingDraftPreviewWindow && e.source !== state.marketingDraftPreviewWindow) return;
  sendMarketingDraftToPreviewWindow(e.source, state.marketingDraftPreviewPayload);
});

void boot();
