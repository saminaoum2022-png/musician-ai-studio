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
  view: "overview",
  offset: 0,
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
  pageTitle: document.getElementById("pageTitle"),
  pageSub: document.getElementById("pageSub"),
  globalError: document.getElementById("globalError"),
  panels: {
    overview: document.getElementById("viewOverview"),
    suno: document.getElementById("viewSuno"),
    users: document.getElementById("viewUsers"),
    credits: document.getElementById("viewCredits"),
    generations: document.getElementById("viewGenerations"),
    subscriptions: document.getElementById("viewSubscriptions"),
  },
  navItems: [...document.querySelectorAll(".navItem")],
};

const VIEW_META = {
  overview: { title: "Overview", sub: "Platform health at a glance" },
  suno: { title: "Suno bucket", sub: "Master API credits vs user liability" },
  users: { title: "Users", sub: "Signups, activity, balances, and songs" },
  credits: { title: "Credits", sub: "Grant paid credits and view every ledger entry" },
  generations: { title: "Generations", sub: "Song and audio generation requests" },
  subscriptions: { title: "Subscriptions", sub: "NabadAi Pro status by user" },
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

async function adminFetch(view, { offset = 0, limit = PAGE_SIZE } = {}) {
  await refreshSessionIfNeeded();
  const token = state.session?.access_token;
  if (!token) throw new Error("Not signed in");
  const qs = new URLSearchParams({ view, limit: String(limit), offset: String(offset) });
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
    throw new Error(`This account is not an admin${who}. Use saminaoum2022@gmail.com.`);
  }
  if (!r.ok) {
    throw new Error(data?.error || `Request failed (${r.status})`);
  }
  return data;
}

function statCard(label, value, sub = "", highlight = false) {
  return `
    <div class="statCard${highlight ? " isHighlight" : ""}">
      <div class="statLabel">${label}</div>
      <div class="statValue">${value}</div>
      ${sub ? `<div class="statSub">${sub}</div>` : ""}
    </div>
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

  els.panels.overview.innerHTML = `
    <div class="sectionCard">
      <h3 class="sectionTitle">Suno master bucket</h3>
      <p class="sectionNote">Your purchased Suno API credits. When users generate, this bucket is consumed alongside their Nabad credit balance.</p>
      <div class="cardsGrid">
        ${statCard("Master Suno balance", fmtNum(s.masterBalance, 1), "Live from Suno API", true)}
        ${statCard("User credits outstanding", fmtNum(s.userOutstanding, 1), "Liability — not yet spent")}
        ${statCard("Headroom estimate", fmtNum(s.headroomEstimate, 1), "Master − outstanding")}
        ${statCard("All-time user spend", fmtNum(s.userSpentTotal, 1), "Debited from user balances")}
      </div>
    </div>
    <div class="cardsGrid">
      ${statCard("Total users", fmtNum(u.total))}
      ${statCard("Active today", fmtNum(u.activeToday))}
      ${statCard("New today", fmtNum(u.newToday))}
      ${statCard("Pro subscribers", fmtNum(sub.premiumActive))}
      ${statCard("Credits issued (all time)", fmtNum(c.issuedTotal, 1))}
      ${statCard("Credits used (all time)", fmtNum(c.usedTotal, 1))}
      ${statCard("Credits consumed today", fmtNum(c.consumedToday, 1))}
      ${statCard("Songs saved today", fmtNum(g.songsToday))}
      ${statCard("Failed gens today", fmtNum(g.failedToday))}
      ${statCard("Est. API cost today", fmtUsd(g.apiCostTodayUsd))}
      ${statCard("Est. revenue MTD", fmtUsd(rev.estimatedMtdUsd), rev.note || "")}
    </div>
  `;
}

function renderSuno(data) {
  const s = data?.suno || {};
  els.panels.suno.innerHTML = `
    <div class="sectionCard">
      <h3 class="sectionTitle">Bucket health</h3>
      <p class="sectionNote">${s.note || ""}</p>
      <div class="cardsGrid">
        ${statCard("Master balance", fmtNum(s.masterBalance, 1), "Suno API", true)}
        ${statCard("User outstanding", fmtNum(s.userOutstanding, 1), "Could still be spent")}
        ${statCard("7-day burn", fmtNum(s.burnLast7d, 1), "Credits consumed")}
        ${statCard("Avg daily burn", fmtNum(s.avgDailyBurn, 1), "Last 7 days")}
        ${statCard("Runway estimate", s.runwayDaysEstimate != null ? `${fmtNum(s.runwayDaysEstimate)} days` : "—", "Based on recent burn")}
        ${statCard("All-time user spend", fmtNum(s.userSpentAllTime, 1))}
      </div>
    </div>
  `;
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
  const body = rows.length
    ? rows.map((u) => `
      <tr>
        <td>${u.name || "—"}<br><span style="color:var(--muted);font-size:0.76rem">@${u.username || "—"}</span></td>
        <td>${u.email || "—"}</td>
        <td>${fmtDate(u.signupAt)}</td>
        <td><span class="badge ${signupPlatformBadgeClass(u.signupPlatform)}">${fmtSignupPlatform(u.signupPlatform)}</span></td>
        <td><span class="badge ${u.subscriptionStatus || "none"}">${u.subscriptionStatus || "none"}</span></td>
        <td class="num">${fmtNum(u.credits, 1)}</td>
        <td class="num">${fmtNum(u.songsGenerated)}</td>
        <td>${fmtDate(u.lastActiveAt)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="8" class="loading">No users yet</td></tr>`;

  els.panels.users.innerHTML = `
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
    </div>
    ${pagerHtml(total, state.offset)}
  `;
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

  els.panels.credits.innerHTML = `
    <div class="sectionCard grantCard">
      <h3 class="sectionTitle">Grant paid credits</h3>
      <p class="sectionNote">Manual grants for support or testing gifts — separate from NabadAi Pro subscription credits, which are added automatically via billing. Leave email blank to grant to your signed-in account.</p>
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
    </div>
    <div class="tableWrap">
      <table>
        <thead>
          <tr>
            <th>User</th><th>Delta</th><th>Before</th><th>After</th><th>Reason</th><th>Ref</th><th>Date</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    ${pagerHtml(total, state.offset)}
  `;
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

  els.panels.generations.innerHTML = `
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
    </div>
    ${pagerHtml(total, state.offset)}
  `;
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

  els.panels.subscriptions.innerHTML = `
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
    </div>
    ${pagerHtml(total, state.offset)}
  `;
}

const RENDERERS = {
  overview: renderOverview,
  suno: renderSuno,
  users: renderUsers,
  credits: renderCredits,
  generations: renderGenerations,
  subscriptions: renderSubscriptions,
};

function setView(view) {
  state.view = view;
  state.offset = 0;
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

function clearCreditsCache() {
  for (const key of Object.keys(state.cache)) {
    if (key.startsWith("credits:")) delete state.cache[key];
  }
}

async function loadView({ force = false } = {}) {
  const view = state.view;
  const cacheKey = `${view}:${state.offset}`;
  if (!force && state.cache[cacheKey]) {
    RENDERERS[view](state.cache[cacheKey]);
    return;
  }
  const panel = els.panels[view];
  panel.innerHTML = `<div class="loading">Loading…</div>`;
  showError("");
  try {
    const data = await adminFetch(view, { offset: state.offset });
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
      showApp();
      setView("overview");
      await loadView({ force: true });
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
      showApp();
      setView("overview");
      await loadView();
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
    showApp();
    setView("overview");
    await loadView({ force: true });
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
    showApp();
    setView("overview");
    await loadView({ force: true });
  } catch (err) {
    showResetError(err?.message || "Could not set password");
  } finally {
    if (els.btnResetPassword) els.btnResetPassword.disabled = false;
  }
});

els.btnSignOut?.addEventListener("click", () => {
  writeSession(null);
  state.cache = {};
  showLogin();
});

els.btnRefresh?.addEventListener("click", () => {
  state.cache = {};
  void loadView({ force: true });
});

for (const btn of els.navItems) {
  btn.addEventListener("click", () => {
    setView(btn.dataset.view);
    void loadView();
  });
}

document.body.addEventListener("submit", (e) => {
  const form = e.target.closest("#grantCreditsForm");
  if (!form) return;
  e.preventDefault();
  void (async () => {
    const emailInput = form.querySelector("#grantCreditsEmail");
    const amountInput = form.querySelector("#grantCreditsAmount");
    const btn = form.querySelector("#btnGrantCredits");
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
});

document.body.addEventListener("click", (e) => {
  const pageBtn = e.target.closest("[data-page]");
  if (!pageBtn) return;
  const total = state.cache[`${state.view}:${state.offset}`]?.total || 0;
  if (pageBtn.dataset.page === "prev" && state.offset > 0) {
    state.offset = Math.max(0, state.offset - PAGE_SIZE);
    void loadView();
  } else if (pageBtn.dataset.page === "next" && state.offset + PAGE_SIZE < total) {
    state.offset += PAGE_SIZE;
    void loadView();
  }
});

void boot();
