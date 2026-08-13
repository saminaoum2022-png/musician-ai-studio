const SESSION_KEY = "nabad_admin_session_v1";
const AUTH_PKCE_KEY = "nabad_admin_pkce_v1";
const AUTH_PENDING_KEY = "nabad_admin_oauth_pending_v1";
const PKCE_COOKIE = "nabad_admin_pkce";
const PENDING_COOKIE = "nabad_admin_oauth_pending";
/** OAuth callback — must stay on www so PKCE storage matches after Google redirect. */
const ADMIN_OAUTH_REDIRECT = "https://www.nabadai.com/admin/";
const ADMIN_PAGE_PATH = "/admin/";
const PAGE_SIZE = 50;

const state = {
  config: null,
  session: null,
  adminSession: null,
  view: "overview",
  offset: 0,
  userSearch: "",
  billingSearch: "",
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
    suno: document.getElementById("viewSuno"),
    users: document.getElementById("viewUsers"),
    credits: document.getElementById("viewCredits"),
    promos: document.getElementById("viewPromos"),
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
  suno: { title: "Suno bucket", sub: "Master API credits vs user liability" },
  users: { title: "Users", sub: "Signups, activity, balances, and songs" },
  credits: { title: "Credits", sub: "Grant paid credits and view every ledger entry" },
  promos: { title: "Promo codes", sub: "Create and monitor redemption codes" },
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
    ? `<br><span class="badge pending">Profile pending</span>`
    : "";
  return `${u.name || "—"}<br><span style="color:var(--muted);font-size:0.76rem">@${u.username || "—"}</span>${pending}`;
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

async function adminFetch(view, { offset = 0, limit = PAGE_SIZE, search = "" } = {}) {
  await refreshSessionIfNeeded();
  const token = state.session?.access_token;
  if (!token) throw new Error("Not signed in");
  const qs = new URLSearchParams({ view, limit: String(limit), offset: String(offset) });
  const trimmedSearch = String(search || "").trim();
  if (trimmedSearch.length >= 2) qs.set("search", trimmedSearch);
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
  return allowed.includes(view);
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
  return key;
}

function firstAllowedView() {
  const order = ["overview", "suno", "users", "generations", "publications", "credits", "promos", "subscriptions", "billing", "settings"];
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

function adminPageStack(inner) {
  return `<div class="adminPageStack">${inner}</div>`;
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
      </div>`
    : `<div class="sunoTopUpAlert sunoTopUpAlert--ok" role="status">
        <strong>Suno bucket covers guaranteed Pro liability.</strong> You have headroom for new subs until guaranteed total grows.
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

function renderSuno(data) {
  const s = data?.suno || {};
  els.panels.suno.innerHTML = adminPageStack(`
    ${renderSunoCoverageSection(s, { compact: true })}
    <section class="sectionCard">
      <div class="sectionHead">
        <h3 class="sectionTitle">Burn &amp; runway</h3>
        <p class="sectionNote">${s.note || ""}</p>
      </div>
      <div class="cardsGrid cardsGrid--inSection">
        ${statCard("7-day burn", fmtNum(s.burnLast7d, 1), "Nabad credits consumed")}
        ${statCard("Avg daily burn", fmtNum(s.avgDailyBurn, 1), "Last 7 days")}
        ${statCard("Runway estimate", s.runwayDaysEstimate != null ? `${fmtNum(s.runwayDaysEstimate)} days` : "—", "At recent burn vs guaranteed liability")}
        ${statCard("All-time user spend", fmtNum(s.userSpentAllTime, 1))}
      </div>
    </section>
  `);
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

function renderUsers(data) {
  const rows = data?.users || [];
  const total = data?.total || rows.length;
  const searchVal = state.userSearch || "";
  const body = rows.length
    ? rows.map((u) => `
      <tr>
        <td>${userNameCell(u)}</td>
        <td>${u.email || "—"}</td>
        <td>${fmtDate(u.signupAt)}</td>
        <td><span class="badge ${signupPlatformBadgeClass(u.signupPlatform)}">${fmtSignupPlatform(u.signupPlatform)}</span></td>
        <td><span class="badge ${u.subscriptionStatus || "none"}">${u.subscriptionStatus || "none"}</span></td>
        <td class="num">${fmtNum(u.credits, 1)}</td>
        <td class="num">${fmtNum(u.songsGenerated)}</td>
        <td>${fmtDate(u.lastActiveAt)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="8" class="loading">${searchVal.trim().length >= 2 ? "No users match your search." : "No users yet"}</td></tr>`;

  els.panels.users.innerHTML = adminPageStack(`
    <section class="sectionCard sectionCard--toolbar">
      <div class="sectionHead">
        <h3 class="sectionTitle">Search users</h3>
        <p class="sectionNote">Email, @username, or display name — min 2 characters.</p>
      </div>
      <form id="userSearchForm" class="grantForm userSearchForm">
        <label class="field grantField userSearchField">
          <span>Search</span>
          <input id="userSearchInput" type="search" value="${escapeHtml(searchVal)}" placeholder="sam@example.com or @creator" autocomplete="off" />
        </label>
        <button type="submit" class="btnPrimary">Search</button>
        ${searchVal.trim().length >= 2 ? `<button type="button" class="btnGhost" id="btnUserSearchClear">Clear</button>` : ""}
      </form>
    </section>
    ${dataPanel({
    title: searchVal.trim().length >= 2 ? "Search results" : "All users",
    note: "Signups, credits, songs saved, and subscription status. Orphan auth accounts show as profile pending.",
    tableHtml: `
    <div class="tableWrap">
      <table>
        <thead>
          <tr>
            <th>User</th><th>Email</th><th>Signup</th><th>Platform</th><th>Subscription</th>
            <th>Credits</th><th>Songs</th><th>Last active</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>`,
    pager: pagerHtml(total, state.offset),
  })}
  `);
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
        <td>${p.expiresAt ? fmtDate(p.expiresAt) : "—"}</td>
        <td>${fmtDate(p.createdAt)}</td>
        <td>${toggleBtn}</td>
      </tr>`;
    }).join("")
    : `<tr><td colspan="8" class="loading">No promo codes yet — create one below.</td></tr>`;

  const createForm = canManage ? `
    <section class="sectionCard">
      <div class="sectionHead">
        <h3 class="sectionTitle">Create promo code</h3>
        <p class="sectionNote">Single code or batch with a shared prefix (e.g. <code>NABADAI-BETA-2026</code> + random suffix). Codes are stored uppercase.</p>
      </div>
      <form id="promoCreateForm" class="grantForm">
        <label class="field grantField">
          <span>Code (single)</span>
          <input id="promoCode" type="text" placeholder="NABADAI-WELCOME-30" autocomplete="off" />
        </label>
        <label class="field grantField">
          <span>Or batch prefix</span>
          <input id="promoPrefix" type="text" placeholder="NABADAI-BETA-2026" autocomplete="off" />
        </label>
        <label class="field grantField grantField--amount">
          <span>Batch count</span>
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
          <span>Expires (optional)</span>
          <input id="promoExpires" type="datetime-local" />
        </label>
        <button type="submit" class="btnPrimary" id="btnPromoCreate">Create</button>
      </form>
      <p id="promoCreateMsg" class="grantMsg" hidden></p>
    </section>` : `
    <section class="sectionCard">
      <p class="sectionNote">Promo creation requires <strong>Support</strong> or <strong>Owner / Admin</strong> grant-credits permission.</p>
    </section>`;

  els.panels.promos.innerHTML = adminPageStack(`
    <section class="sectionCard">
      <div class="sectionHead">
        <h3 class="sectionTitle">Promo summary</h3>
        <p class="sectionNote">Platform-wide promo code inventory.</p>
      </div>
      <div class="cardsGrid cardsGrid--inSection">
        ${statCard("Total codes", fmtNum(summary.codesTotal))}
        ${statCard("Redemptions", fmtNum(summary.codesRedeemed))}
      </div>
    </section>
    ${createForm}
    ${dataPanel({
      title: "All promo codes",
      note: "Newest first. Deactivate a code to block further redemptions.",
      tableHtml: `
      <div class="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Code</th><th>Credits</th><th>Used</th><th>Remaining</th>
              <th>Status</th><th>Expires</th><th>Created</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>`,
      pager: pagerHtml(total, state.offset),
    })}
  `);
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
          <td>${fmtDate(t.created_at)}</td>
        </tr>
      `;
    }).join("")
    : `<tr><td colspan="7" class="loading">No transactions yet — run supabase/admin_dashboard.sql</td></tr>`;

  els.panels.credits.innerHTML = adminPageStack(`
    ${state.adminSession?.canGrantCredits ? `
    <section class="sectionCard">
      <div class="sectionHead">
        <h3 class="sectionTitle">Grant paid credits</h3>
        <p class="sectionNote">Manual grants for support or testing. NabadAi Pro subscription credits are added automatically via billing. Leave email blank to grant to your signed-in account.</p>
      </div>
      <form id="grantCreditsForm" class="grantForm">
        <label class="field grantField">
          <span>User email</span>
          <input id="grantCreditsEmail" type="email" placeholder="creator@example.com" autocomplete="off" />
        </label>
        <label class="field grantField grantField--amount">
          <span>Amount</span>
          <input id="grantCreditsAmount" type="number" min="1" max="500" step="1" required placeholder="50" inputmode="numeric" />
        </label>
        <button type="submit" class="btnPrimary" id="btnGrantCredits">Grant credits</button>
      </form>
      <p id="grantCreditsMsg" class="grantMsg" hidden></p>
    </section>` : ""}
    ${dataPanel({
      title: "Credit ledger",
      note: "Every grant, spend, and refund across the platform.",
      tableHtml: `
    <div class="tableWrap">
      <table>
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
  `);
}

function renderGenerations(data) {
  const rows = data?.generations || [];
  const total = data?.total || rows.length;
  const body = rows.length
    ? rows.map((g) => `
      <tr>
        <td>${g.userLabel || "—"}</td>
        <td class="promptCell" title="${(g.prompt || "").replace(/"/g, "&quot;")}">${g.prompt || "—"}</td>
        <td>${g.provider}</td>
        <td>${g.kind}</td>
        <td><span class="badge ${g.status}">${g.status}</span></td>
        <td class="num">${fmtNum(g.creditsUsed, 1)}</td>
        <td class="num">${g.providerCostUsd != null ? fmtUsd(g.providerCostUsd) : "—"}</td>
        <td>${fmtDate(g.createdAt)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="8" class="loading">No generation logs yet</td></tr>`;

  els.panels.generations.innerHTML = adminPageStack(dataPanel({
    title: "Generation log",
    note: "Every create attempt — including failures and refunds — with provider cost estimates.",
    tableHtml: `
    <div class="tableWrap">
      <table>
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
  }));
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
        <td>${escapeHtml(p.userLabel)}${p.username ? `<br><span style="color:var(--muted);font-size:0.76rem">@${escapeHtml(p.username)}</span>` : ""}</td>
        <td style="color:var(--muted);font-size:0.78rem">${escapeHtml(p.email || "—")}</td>
        <td>${fmtDate(p.publishedAt || p.createdAt)}</td>
        <td>${escapeHtml(p.kind || "—")}</td>
        <td class="pubLinks">${links || "—"}</td>
        ${modCell}
      </tr>`;
    }).join("")
    : `<tr><td colspan="${canModerate ? 8 : 7}" class="loading">No public posts yet</td></tr>`;

  els.panels.publications.innerHTML = adminPageStack(dataPanel({
    title: "Public posts",
    note: canModerate
      ? "Moderation view — unpublish removes the song from public profile and feed. The creator keeps their private copy."
      : "Songs published to a public profile (<code>public_on_profile</code>). Read-only for your role.",
    tableHtml: `
    <div class="tableWrap">
      <table>
        <thead>
          <tr>
            <th>Cover</th><th>Title</th><th>Creator</th><th>Email</th>
            <th>Published</th><th>Kind</th><th>Links</th>${canModerate ? "<th>Actions</th>" : ""}
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>`,
    pager: pagerHtml(total, state.offset),
  }));
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
      return `
      <tr>
        <td>${fmtDate(ev.createdAt)}</td>
        <td>${ev.userLabel || "—"}<br><span style="color:var(--muted);font-size:0.76rem">${escapeHtml(ev.email || "")}</span></td>
        <td><span class="badge">${escapeHtml(ev.eventTypeLabel || ev.eventType || "—")}</span></td>
        <td>${escapeHtml(ev.provider || "—")}</td>
        <td>${escapeHtml(ev.planId || "—")}</td>
        <td><strong>${fmtNum(ev.creditsGranted, 0)}</strong></td>
        <td style="font-size:0.78rem;color:var(--muted)" title="${escapeHtml(ev.id || "")}">${escapeHtml(idShort)}</td>
      </tr>
    `;
    }).join("")
    : `<tr><td colspan="7" class="loading">${searchQ ? `No billing events for “${escapeHtml(searchQ)}”.` : "No billing events yet"}</td></tr>`;

  const summaryCards = `
    <section class="sectionCard">
      <div class="sectionHead">
        <h3 class="sectionTitle">Last 7 days</h3>
        <p class="sectionNote">Quick audit — many RENEWAL rows for one sandbox user usually means Apple accelerated billing, not a production bug.</p>
      </div>
      <div class="cardsGrid cardsGrid--inSection">
        ${statCard("Webhook grants", fmtNum(summary.eventCount || 0), "Processed events")}
        ${statCard("Renewals", fmtNum(summary.renewalCount || 0), "In that window")}
        ${statCard("Credits granted", fmtNum(summary.creditsGranted || 0, 0), "Subscription + packs")}
      </div>
    </section>`;

  els.panels.billing.innerHTML = adminPageStack(
    `${summaryCards}${dataPanel({
      title: "Billing event log",
      note: "Every processed RevenueCat / Stripe webhook that granted credits. Search by email or @username to audit sandbox testers (daily renewals show as RENEWAL rows).",
      extraHtml: `
      <form id="billingSearchForm" class="grantForm userSearchForm">
        <label class="field grantField userSearchField">
          <span class="fieldLabel">Find user</span>
          <input id="billingSearchInput" type="search" placeholder="email or @username" autocomplete="off" value="${escapeHtml(searchQ)}" />
        </label>
        <button type="submit" class="btnPrimary">Search</button>
        ${searchQ ? `<button type="button" class="btnGhost" id="billingSearchClear">Clear</button>` : ""}
      </form>`,
      tableHtml: `
    <div class="tableWrap">
      <table>
        <thead>
          <tr>
            <th>When</th><th>User</th><th>Event</th><th>Provider</th>
            <th>Plan</th><th>Credits</th><th>Transaction ID</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>`,
      pager: pagerHtml(total, state.offset),
    })}`,
  );
}

function renderSubscriptions(data) {
  const rows = data?.subscriptions || [];
  const total = data?.total || rows.length;
  const body = rows.length
    ? rows.map((s) => `
      <tr>
        <td>${s.userLabel || "—"}<br><span style="color:var(--muted);font-size:0.76rem">${s.email || ""}</span></td>
        <td>${s.planId || "—"}</td>
        <td><span class="badge ${s.status}">${s.statusLabel || s.status}</span></td>
        <td>${s.provider}</td>
        <td>${fmtDate(s.currentPeriodEnd)}</td>
        <td style="font-size:0.78rem;color:var(--muted)">${s.providerSubscriptionId || "—"}</td>
        <td>${fmtDate(s.updatedAt)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="7" class="loading">No subscriptions yet</td></tr>`;

  els.panels.subscriptions.innerHTML = adminPageStack(dataPanel({
    title: "NabadAi Pro subscriptions",
    note: "Active, trialing, and grace-period rows from Apple, Stripe, and RevenueCat webhooks.",
    tableHtml: `
    <div class="tableWrap">
      <table>
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
  }));
}

const RENDERERS = {
  overview: renderOverview,
  suno: renderSuno,
  users: renderUsers,
  credits: renderCredits,
  promos: renderPromos,
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
    let data = await adminFetch(view, {
      offset: state.offset,
      search: view === "users"
        ? state.userSearch
        : view === "billing"
          ? state.billingSearch
          : "",
    });
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

void boot();
