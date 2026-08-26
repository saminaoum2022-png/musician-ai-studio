/**
 * NabadAi Pro — subscription UI + iOS (RevenueCat) and web (Stripe) billing.
 */

import {
  PRO_FEATURES,
  PRO_LAUNCH_COPY,
  PRO_PLANS,
  planCreditsMeta,
} from "./pro-plan-config.js";
import {
  isBillingConfigured,
  purchaseProPlan,
  restoreProPurchases,
  warmBilling,
} from "./billing/revenuecat.js";
import {
  isStripeWebBillingConfigured,
  startStripeCheckout,
  openStripeBillingPortal,
  syncStripeBillingWithServer,
  readStripeCheckoutResultFromHash,
  clearStripeCheckoutQueryFromHash,
} from "./billing/stripe.js";

/** @type {{ showToast?: (msg: string, opts?: object) => void, isLoggedIn?: () => boolean, isNativeIos?: () => boolean, navigateToRoute?: (route: string) => void, getProState?: () => { active?: boolean, planId?: string|null, status?: string|null, periodEnd?: string|null, provider?: string|null }, reconcilePro?: () => Promise<void> } | null} */
let _deps = null;

let _mounted = false;
let _selectedPlan = "monthly";
let _benefitsExpanded = true;
let _pageBound = false;
let _backBound = false;
let _returnRoute = "settings";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mount() {
  return document.getElementById("proPlanMount");
}

function isNativeIos() {
  try {
    if (typeof _deps?.isNativeIos === "function") return Boolean(_deps.isNativeIos());
    const cap = globalThis.Capacitor;
    return Boolean(cap?.isNativePlatform?.() && cap?.getPlatform?.() === "ios");
  } catch {
    return false;
  }
}

function planCardHtml(plan, selected) {
  const isSelected = selected === plan.id;
  const trial = plan.trialDays > 0;
  const suffix = String(plan.priceSuffix || "").replace(/^\s*\/\s*/, "");
  const meta = planCreditsMeta(plan);
  return `
    <button
      type="button"
      class="proPlanCard${isSelected ? " isSelected" : ""}${plan.id === "monthly" ? " proPlanCard--monthly" : ""}"
      data-pro-plan="${esc(plan.id)}"
      aria-pressed="${isSelected ? "true" : "false"}"
    >
      <span class="proPlanCardRadio" aria-hidden="true"></span>
      <span class="proPlanCardBody">
        <span class="proPlanCardTop">
          <span class="proPlanCardLabel">${esc(plan.label)}</span>
          ${plan.saveBadge ? `<span class="proPlanCardSave">${esc(plan.saveBadge)}</span>` : ""}
          ${plan.badge ? `<span class="proPlanCardBadge">${esc(plan.badge)}</span>` : ""}
        </span>
        <span class="proPlanCardMeta">${esc(meta)}</span>
        ${trial
    ? `<span class="proPlanCardTrial">${esc(plan.trialLabel)}</span>`
    : `<span class="proPlanCardTrial proPlanCardTrial--spacer" aria-hidden="true">&#8203;</span>`}
      </span>
      <span class="proPlanCardPriceCol">
        <span class="proPlanCardPrice">
          <strong>${esc(plan.priceDisplay)}</strong>
          <span>/${esc(suffix)}</span>
        </span>
      </span>
    </button>`;
}

function benefitsListHtml() {
  return PRO_FEATURES.map((f) => {
    const soon = Boolean(f.comingSoon);
    const sub = String(f.sub || "").trim();
    return `
    <li class="proBenefitsRow${soon ? " proBenefitsRow--soon" : ""}">
      <span class="proBenefitsLabel">${esc(f.label)}${soon ? '<span class="proBenefitsSoonBadge">Coming soon</span>' : ""}</span>
      ${sub ? `<span class="proBenefitsSub">${esc(sub)}</span>` : ""}
    </li>`;
  }).join("");
}

function proPageNeedsRender() {
  const host = mount();
  return !host || !host.querySelector(".proTabStage");
}

function ensureProPageRendered() {
  if (!proPageNeedsRender()) return true;
  try {
    renderProPlanPage({ preserveTab: _mounted });
    _mounted = true;
    return true;
  } catch (err) {
    console.error("[pro-plan] render failed", err);
    return false;
  }
}

function selectedPlan() {
  return PRO_PLANS.find((p) => p.id === _selectedPlan) || PRO_PLANS[1];
}

function isWebStripeBilling() {
  return !isNativeIos() && isStripeWebBillingConfigured();
}

function ctaLabel(plan) {
  if (plan.trialDays > 0 && (isNativeIos() || isWebStripeBilling())) {
    return plan.ctaTrial || plan.ctaSubscribe;
  }
  return plan.ctaSubscribe;
}

function priceSubline(plan) {
  const suffix = String(plan.priceSuffix || "").replace(/^\s*\/\s*/, "");
  if (plan.trialDays > 0) {
    return `${plan.trialLabel}, then ${plan.priceDisplay}/${suffix}. Cancel anytime.`;
  }
  return `${plan.priceDisplay}/${suffix}. Cancel anytime.`;
}

function readProState() {
  try {
    return typeof _deps?.getProState === "function" ? _deps.getProState() || {} : {};
  } catch {
    return {};
  }
}

function proPlanDisplayName(planId) {
  const id = String(planId || "").trim();
  if (id === "weekly") return "Weekly";
  if (id === "monthly") return "Monthly";
  return "Pro";
}

export function formatProPeriodLabel(status, iso, opts = {}) {
  const raw = String(iso || "").trim();
  if (!raw) return "";
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "";
    const short = Boolean(opts.short);
    const dateStr = d.toLocaleDateString(
      undefined,
      short
        ? { month: "short", day: "numeric" }
        : { month: "short", day: "numeric", year: "numeric" },
    );
    const s = String(status || "").toLowerCase();
    if (s === "trialing") return `Trial ends ${dateStr}`;
    if (s === "cancelled") return `Access until ${dateStr}`;
    if (s === "grace") {
      return short ? `Retry until ${dateStr}` : `Billing retry · access until ${dateStr}`;
    }
    return `Renews ${dateStr}`;
  } catch {
    return "";
  }
}

const WEEKLY_TRIAL_MS =
  (Number(PRO_PLANS.find((p) => p.id === "weekly")?.trialDays) || 7) * 24 * 60 * 60 * 1000;

export function weeklyTrialStartFromState(state) {
  let startMs = Date.parse(String(state?.trialStartedAt || ""));
  if (!Number.isFinite(startMs)) {
    const endMs = Date.parse(String(state?.periodEnd || state?.currentPeriodEnd || ""));
    if (Number.isFinite(endMs)) startMs = endMs - WEEKLY_TRIAL_MS;
  }
  return startMs;
}

export function weeklyInTrialWindow(state) {
  const startMs = weeklyTrialStartFromState(state);
  return Number.isFinite(startMs) && Date.now() < startMs + WEEKLY_TRIAL_MS;
}

/** UI status for weekly — RC sandbox often sends periodType NORMAL during trial renewals. */
export function weeklyProDisplayStatus(state) {
  const planId = String(state?.planId || "").trim();
  const active = Boolean(state?.active);
  const status = String(state?.status || "").toLowerCase();
  const provider = String(state?.provider || "").toLowerCase();
  if (!active || planId !== "weekly") return status || null;

  // Stripe writes real trialing/active — trust it (don't infer trial from period window).
  if (provider === "stripe") {
    if (status === "trialing") return "trialing";
    if (status === "grace") return "grace";
    if (status === "cancelled") return "cancelled";
    return status === "active" ? "active" : (status || "active");
  }

  if (status === "trialing") return "trialing";
  if (status === "active") {
    const pt = String(state?.periodType || "").toUpperCase();
    // Explicit paid period — never show Trial.
    if (pt === "NORMAL") return "active";
    // Missing periodType with active status: treat as paid (Stripe/web sync).
    if (!pt) return "active";
  }

  const pt = String(state?.periodType || "").toUpperCase();
  if (pt === "TRIAL") return "trialing";
  if (weeklyInTrialWindow(state)) return "trialing";
  if (pt && pt !== "NORMAL") return "trialing";

  return "active";
}

function formatProRenewLabel(iso) {
  const state = readProState();
  const displayStatus = weeklyProDisplayStatus(state);
  return formatProPeriodLabel(displayStatus, iso || state.periodEnd);
}

function proStatusHeadline(status) {
  const s = String(status || "").toLowerCase();
  if (s === "trialing") return "Free trial active";
  if (s === "grace") return "Pro active — billing retry";
  return "You're subscribed";
}

function ensureProActiveStatusEl() {
  const dock = document.getElementById("proDockPro");
  let el = document.getElementById("proActiveStatus");
  if (!el && dock) {
    el = document.createElement("div");
    el.id = "proActiveStatus";
    el.className = "proActiveStatus";
    el.hidden = true;
    const btn = document.getElementById("btnProSubscribe");
    if (btn) dock.insertBefore(el, btn);
    else dock.appendChild(el);
  }
  return el;
}

export function refreshProSubscriptionUi() {
  paintSubscribedState();
}

function paintSubscribedState() {
  const state = readProState();
  const active = Boolean(state.active);
  const shell = mount()?.querySelector(".proShell");
  if (shell) shell.classList.toggle("proShell--subscribed", active);

  const btn = document.getElementById("btnProSubscribe");
  const sub = document.getElementById("proSubscribeSub");
  const statusEl = ensureProActiveStatusEl();
  const extras = document.getElementById("proDockProExtras");
  const restoreBtn = mount()?.querySelector("[data-pro-restore]");

  if (active) {
    const planId = String(state.planId || "").trim();
    const planName = proPlanDisplayName(planId);
    const displayStatus = weeklyProDisplayStatus(state);
    const renew = formatProPeriodLabel(displayStatus, state.periodEnd);
    const headline = proStatusHeadline(displayStatus);
    if (statusEl) {
      statusEl.hidden = false;
      const provider = String(state.provider || "").toLowerCase();
      const manageCopy = provider === "stripe"
        ? `<button type="button" class="proManageLink" data-pro-manage>Manage subscription</button>`
        : `<p class="proActiveStatusManage">Manage or cancel in iPhone Settings → Subscriptions.</p>`;
      statusEl.innerHTML = `
        <p class="proActiveStatusTitle">${esc(headline)}</p>
        <p class="proActiveStatusPlan">NabadAi Pro · ${esc(planName)}</p>
        ${renew ? `<p class="proActiveStatusRenew">${esc(renew)}</p>` : ""}
        ${manageCopy}
      `;
    }
    if (btn) {
      btn.hidden = true;
      btn.disabled = true;
    }
    if (sub) sub.textContent = "";
    if (restoreBtn) restoreBtn.hidden = true;
    if (extras) extras.classList.add("proDockProExtras--subscribed");

    mount()?.querySelectorAll(".proPlanCard[data-pro-plan]").forEach((card) => {
      const id = String(card.getAttribute("data-pro-plan") || "");
      const isCurrent = Boolean(planId && id === planId);
      card.classList.toggle("isCurrentPlan", isCurrent);
      card.setAttribute("aria-disabled", "true");
      card.disabled = true;
    });
    return;
  }

  if (statusEl) statusEl.hidden = true;
  if (btn) {
    btn.hidden = false;
    btn.disabled = false;
  }
  if (restoreBtn) restoreBtn.hidden = isWebStripeBilling();
  if (extras) extras.classList.remove("proDockProExtras--subscribed");
  mount()?.querySelectorAll(".proPlanCard[data-pro-plan]").forEach((card) => {
    card.classList.remove("isCurrentPlan");
    card.removeAttribute("aria-disabled");
    card.disabled = false;
  });
  paintCta();
}

function paintCta() {
  if (readProState().active) {
    paintSubscribedState();
    return;
  }
  const btn = document.getElementById("btnProSubscribe");
  const sub = document.getElementById("proSubscribeSub");
  const plan = selectedPlan();
  if (btn) {
    btn.textContent = ctaLabel(plan);
    btn.dataset.proPlan = plan.id;
  }
  if (sub) sub.textContent = priceSubline(plan);
}

function paintPlanCards() {
  const grid = mount()?.querySelector(".proPlanGrid");
  if (!grid) return;
  grid.innerHTML = PRO_PLANS.map((p) => planCardHtml(p, _selectedPlan)).join("");
  paintCta();
  paintSubscribedState();
}

function paintBenefitsExpanded() {
  const expand = mount()?.querySelector("#proBenefitsExpand");
  const toggle = document.getElementById("btnProBenefitsToggle");
  if (!toggle) return;
  const open = _benefitsExpanded;
  if (expand) expand.hidden = !open;
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
  toggle.classList.toggle("isOpen", open);
  toggle.innerHTML = `${open ? "Hide benefits" : "View all benefits"}<span class="proBenefitsChev" aria-hidden="true">›</span>`;
}

function navigateAwayFromPro(route) {
  const target = String(route || "settings").trim() || "settings";
  if (typeof _deps?.navigateToRoute === "function") {
    _deps.navigateToRoute(target);
    return;
  }
  try {
    location.hash = `#/${target}`;
  } catch {}
}

function paintProBackLink() {
  const backBtn = document.getElementById("btnProBack");
  if (!backBtn) return;
  const route = _returnRoute || "settings";
  backBtn.href = `#/${route}`;
  backBtn.setAttribute("data-route-link", route);
  const labels = {
    credits: "Back to Credits",
    settings: "Back to Settings",
    profile: "Back to Profile",
  };
  backBtn.setAttribute("aria-label", labels[route] || labels.settings);
}

export function setProReturnRoute(route) {
  const r = String(route || "").trim();
  if (r === "credits" || r === "settings" || r === "profile") {
    _returnRoute = r;
  } else {
    _returnRoute = "settings";
  }
  paintProBackLink();
}

function renderProPlanPage({ preserveTab = true } = {}) {
  const host = mount();
  if (!host) return;
  if (!preserveTab) _benefitsExpanded = true;

  const plan = selectedPlan();
  const native = isNativeIos();
  const webStripe = isWebStripeBilling();
  const statusNote = native
    ? (isBillingConfigured() ? PRO_LAUNCH_COPY.iosReady : PRO_LAUNCH_COPY.iapSoon)
    : (webStripe ? PRO_LAUNCH_COPY.webReady : PRO_LAUNCH_COPY.webSoon);

  host.innerHTML = `
    <div class="proShell">
      <div class="proScrollBody">
        <div class="proHeroCopy" aria-labelledby="proHeroTitle">
          <h3 id="proHeroTitle" class="proHeroTitle">
            <span class="proHeroTitleLine">Create more.</span>
            <span class="proHeroTitleLine">Sound pro.</span>
          </h3>
          <p class="proHeroLead">${esc(PRO_LAUNCH_COPY.lead)}</p>
        </div>

        <section class="proMain" aria-label="Pro plans">
          <div class="proTabStage">
            <div class="proTabPanel isActive" data-pro-tab-panel="pro" role="tabpanel" aria-labelledby="proTabPro">
              <section class="proPlans" aria-label="Choose a plan">
                <div class="proPlanGrid">
                  ${PRO_PLANS.map((p) => planCardHtml(p, _selectedPlan)).join("")}
                </div>
              </section>
            </div>
          </div>
        </section>

        <section id="proBenefitsExpand" class="proBenefitsExpand" aria-labelledby="proFeaturesTitle">
          <h3 id="proFeaturesTitle" class="proBenefitsTitle">Everything in Pro</h3>
          <ul class="proBenefitsList">${benefitsListHtml()}</ul>
        </section>
      </div>

      <footer class="proBottomDock" id="proBottomDock">
        <div class="proCtaBlock" id="proDockPro">
          <button type="button" id="btnProSubscribe" class="primary proSubscribeBtn" data-pro-plan="${esc(plan.id)}">
            ${esc(ctaLabel(plan))}
          </button>
          <p id="proSubscribeSub" class="proSubscribeSub"></p>
        </div>
        <div id="proDockProExtras">
          <button type="button" id="btnProBenefitsToggle" class="proBenefitsToggle isOpen" aria-expanded="true">
            Hide benefits
            <span class="proBenefitsChev" aria-hidden="true">›</span>
          </button>
          ${webStripe ? "" : `<button type="button" class="proRestoreLink" data-pro-restore>Restore purchases</button>`}
        </div>
        <p class="proStatusNote">${esc(statusNote)}</p>
      </footer>
    </div>
  `;

  bindProPlanPageOnce();
  bindProBackOnce();
  paintProBackLink();
  paintCta();
  paintBenefitsExpanded();
  paintSubscribedState();
}

function warmBillingIfReady() {
  if (!isNativeIos() || !isBillingConfigured()) return;
  const loggedIn = typeof _deps?.isLoggedIn === "function" ? _deps.isLoggedIn() : false;
  if (!loggedIn) return;
  const userId = typeof _deps?.getUserId === "function" ? _deps.getUserId() : "";
  if (!userId) return;
  void warmBilling(userId);
}

async function handleSubscribeClick() {
  const plan = selectedPlan();
  const native = isNativeIos();
  const webStripe = isWebStripeBilling();
  const loggedIn = typeof _deps?.isLoggedIn === "function" ? _deps.isLoggedIn() : false;
  if (!loggedIn) {
    _deps?.showToast?.("Sign in to subscribe to Pro.", { durationMs: 2800 });
    try {
      location.hash = "#/auth";
    } catch {}
    return;
  }
  if (!native && !webStripe) {
    _deps?.showToast?.("Web checkout is not available yet.", { durationMs: 3200 });
    return;
  }
  if (native && !isBillingConfigured()) {
    _deps?.showToast?.("Billing is not configured yet. Finish App Store Connect + RevenueCat setup.", {
      durationMs: 3600,
    });
    return;
  }
  const userId = typeof _deps?.getUserId === "function" ? _deps.getUserId() : "";
  const btn = document.getElementById("btnProSubscribe");
  const prevLabel = btn?.textContent || "";
  if (btn) {
    btn.disabled = true;
    btn.textContent = native ? "Opening…" : "Redirecting…";
  }
  try {
    if (webStripe) {
      await startStripeCheckout(plan.id, {
        getAuthToken: _deps?.getAuthToken,
        apiBase: _deps?.getApiBase?.() || "",
      });
      return;
    }
    await warmBilling(userId);
    await purchaseProPlan(plan.id, {
      userId,
      getAuthToken: _deps?.getAuthToken,
      apiBase: _deps?.getApiBase?.() || "",
    });
    await _deps?.refreshCredits?.();
    _deps?.showToast?.("Welcome to NabadAi Pro!", { durationMs: 3200 });
    navigateAwayFromPro(_returnRoute);
  } catch (err) {
    if (!err?.userCancelled) {
      _deps?.showToast?.(err?.message || "Purchase failed", { durationMs: 3600 });
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      if (!readProState().active) btn.textContent = prevLabel || ctaLabel(selectedPlan());
    }
  }
}

async function handleManageSubscriptionClick() {
  const provider = String(readProState().provider || "").toLowerCase();
  if (provider !== "stripe") return;
  const loggedIn = typeof _deps?.isLoggedIn === "function" ? _deps.isLoggedIn() : false;
  if (!loggedIn) {
    _deps?.showToast?.("Sign in to manage your subscription.", { durationMs: 2800 });
    return;
  }
  try {
    await openStripeBillingPortal({
      getAuthToken: _deps?.getAuthToken,
      apiBase: _deps?.getApiBase?.() || "",
    });
  } catch (err) {
    _deps?.showToast?.(err?.message || "Could not open billing portal", { durationMs: 3600 });
  }
}

async function handleStripeCheckoutReturn() {
  const result = readStripeCheckoutResultFromHash();
  if (!result) return;
  clearStripeCheckoutQueryFromHash();
  if (result.checkout === "cancelled") {
    _deps?.showToast?.("Checkout cancelled.", { durationMs: 2600 });
    return;
  }
  if (result.checkout !== "success") return;
  try {
    const data = await syncStripeBillingWithServer({
      getAuthToken: _deps?.getAuthToken,
      apiBase: _deps?.getApiBase?.() || "",
    });
    if (data?.pro) {
      await _deps?.reconcilePro?.();
    }
    await _deps?.refreshCredits?.();
    _deps?.showToast?.("Welcome to NabadAi Pro!", { durationMs: 3200 });
    navigateAwayFromPro(_returnRoute);
  } catch (err) {
    _deps?.showToast?.(err?.message || "Subscription sync failed — refresh in a moment.", {
      durationMs: 4200,
    });
  }
}

function bindProBackOnce() {
  const backBtn = document.getElementById("btnProBack");
  if (!backBtn || _backBound) return;
  _backBound = true;
  backBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    navigateAwayFromPro(_returnRoute || "settings");
  });
}

async function handleRestoreClick() {
  const native = isNativeIos();
  const loggedIn = typeof _deps?.isLoggedIn === "function" ? _deps.isLoggedIn() : false;
  if (!loggedIn) {
    _deps?.showToast?.("Sign in to restore purchases.", { durationMs: 2800 });
    return;
  }
  if (!native) {
    _deps?.showToast?.("Restore purchases on your iPhone.", { durationMs: 2800 });
    return;
  }
  if (!isBillingConfigured()) {
    _deps?.showToast?.("Billing is not configured yet.", { durationMs: 2800 });
    return;
  }
  try {
    const data = await restoreProPurchases({
      userId: typeof _deps?.getUserId === "function" ? _deps.getUserId() : "",
      getAuthToken: _deps?.getAuthToken,
      apiBase: _deps?.getApiBase?.() || "",
    });
    await _deps?.refreshCredits?.();
    if (data?.pro?.active) {
      _deps?.showToast?.("Pro subscription restored.", { durationMs: 3000 });
      navigateAwayFromPro(_returnRoute);
    } else {
      _deps?.showToast?.("No active Pro subscription found.", { durationMs: 3000 });
    }
  } catch (err) {
    if (!err?.userCancelled) {
      _deps?.showToast?.(err?.message || "Restore failed", { durationMs: 3200 });
    }
  }
}

function bindProPlanPageOnce() {
  const host = mount();
  if (!host || _pageBound) return;
  _pageBound = true;

  host.addEventListener("click", (ev) => {
    const planBtn = ev.target?.closest?.(".proPlanCard[data-pro-plan]");
    if (planBtn) {
      if (readProState().active) return;
      const id = String(planBtn.getAttribute("data-pro-plan") || "").trim();
      if (id === "weekly" || id === "monthly") {
        _selectedPlan = id;
        paintPlanCards();
      }
      return;
    }
    if (ev.target?.closest?.("#btnProSubscribe")) {
      ev.preventDefault();
      if (readProState().active) return;
      handleSubscribeClick();
      return;
    }
    if (ev.target?.closest?.("#btnProBenefitsToggle")) {
      ev.preventDefault();
      _benefitsExpanded = !_benefitsExpanded;
      paintBenefitsExpanded();
      return;
    }
    if (ev.target?.closest?.("[data-pro-manage]")) {
      ev.preventDefault();
      void handleManageSubscriptionClick();
      return;
    }
    if (ev.target?.closest?.("[data-pro-restore]")) {
      ev.preventDefault();
      void handleRestoreClick();
      return;
    }
  });
}

export function configureProPlan(deps) {
  _deps = deps || null;
}

export function initProPlanOnce() {
  ensureProPageRendered();
  bindProBackOnce();
}

export function onProPlanRouteActive({ entering = false } = {}) {
  const needsRender = proPageNeedsRender();
  ensureProPageRendered();
  bindProBackOnce();
  paintProBackLink();
  // Defer RevenueCat warm-up so the Pro panel paints first (no logo flash).
  window.setTimeout(() => warmBillingIfReady(), 0);
  void handleStripeCheckoutReturn();
  if (needsRender || entering) {
    if (entering) {
      _benefitsExpanded = true;
      try {
        const body = mount()?.closest?.("[data-route=\"pro\"]")?.querySelector?.(".proScrollBody")
          || document.querySelector('[data-route="pro"] .proScrollBody');
        if (body) body.scrollTop = 0;
      } catch {}
    }
    paintPlanCards();
    paintBenefitsExpanded();
  }
  paintSubscribedState();
  void Promise.resolve(_deps?.reconcilePro?.()).then(() => {
    paintSubscribedState();
  });
}
