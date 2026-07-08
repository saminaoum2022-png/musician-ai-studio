const SESSION_KEY = "nabad_admin_session_v1";
const PAGE_SIZE = 50;

const state = {
  config: null,
  session: null,
  view: "overview",
  offset: 0,
  cache: {},
};

const els = {
  loginScreen: document.getElementById("loginScreen"),
  appShell: document.getElementById("appShell"),
  loginForm: document.getElementById("loginForm"),
  loginEmail: document.getElementById("loginEmail"),
  loginPassword: document.getElementById("loginPassword"),
  loginError: document.getElementById("loginError"),
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
  credits: { title: "Credits", sub: "Every credit added or deducted" },
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
    full_song: "Song generation",
    paid_purchase: "Paid / admin grant",
    refund_full_song: "Refund",
    stems: "Stems",
    persona: "Persona",
    sound: "Sound",
  };
  return map[reason] || String(reason || "—").replace(/_/g, " ");
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
  writeSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + Number(data.expires_in || 3600) * 1000,
    email: String(email).toLowerCase(),
  });
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
    throw new Error("This account is not an admin");
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
        <td><span class="badge ${u.subscriptionStatus || "none"}">${u.subscriptionStatus || "none"}</span></td>
        <td class="num">${fmtNum(u.credits, 1)}</td>
        <td class="num">${fmtNum(u.songsGenerated)}</td>
        <td>${fmtDate(u.lastActiveAt)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="7" class="loading">No users yet</td></tr>`;

  els.panels.users.innerHTML = `
    <div class="tableWrap">
      <table>
        <thead>
          <tr>
            <th>User</th><th>Email</th><th>Signup</th><th>Subscription</th>
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
    showError(e?.message || String(e));
    if (String(e?.message || "").includes("sign in")) showLogin();
  }
}

function showLogin() {
  els.loginScreen.hidden = false;
  els.appShell.hidden = true;
}

function showApp() {
  els.loginScreen.hidden = true;
  els.appShell.hidden = false;
  els.adminUserEmail.textContent = state.session?.email || "";
}

async function boot() {
  try {
    await loadConfig();
  } catch (e) {
    document.body.innerHTML = `<div class="loading" style="padding:40px">${e.message}</div>`;
    return;
  }

  state.session = readSession();
  if (state.session) {
    try {
      showApp();
      setView("overview");
      await loadView();
      return;
    } catch {
      writeSession(null);
    }
  }
  showLogin();
}

els.loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.loginError.hidden = true;
  els.btnLogin.disabled = true;
  try {
    await signIn(els.loginEmail.value.trim(), els.loginPassword.value);
    showApp();
    setView("overview");
    await loadView({ force: true });
  } catch (err) {
    els.loginError.hidden = false;
    els.loginError.textContent = err?.message || "Sign in failed";
  } finally {
    els.btnLogin.disabled = false;
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
