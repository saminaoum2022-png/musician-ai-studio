/**
 * NabadAi Pro — subscription UI + iOS billing (RevenueCat).
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
} from "./billing/revenuecat.js";

/** @type {{ showToast?: (msg: string, opts?: object) => void, isLoggedIn?: () => boolean, isNativeIos?: () => boolean, navigateToRoute?: (route: string) => void } | null} */
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
  return PRO_FEATURES.map((f) => `
    <li class="proBenefitsRow">${esc(f.label)}</li>
  `).join("");
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

function ctaLabel(plan) {
  if (plan.trialDays > 0 && isNativeIos()) return plan.ctaTrial || plan.ctaSubscribe;
  return plan.ctaSubscribe;
}

function priceSubline(plan) {
  const suffix = String(plan.priceSuffix || "").replace(/^\s*\/\s*/, "");
  if (plan.trialDays > 0) {
    return `${plan.trialLabel}, then ${plan.priceDisplay}/${suffix}. Cancel anytime.`;
  }
  return `${plan.priceDisplay}/${suffix}. Cancel anytime.`;
}

function paintCta() {
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
  const statusNote = native
    ? (isBillingConfigured() ? PRO_LAUNCH_COPY.iosReady : PRO_LAUNCH_COPY.iapSoon)
    : PRO_LAUNCH_COPY.webOnly;

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
          <button type="button" class="proRestoreLink" data-pro-restore>Restore purchases</button>
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
}

async function handleSubscribeClick() {
  const plan = selectedPlan();
  const native = isNativeIos();
  const loggedIn = typeof _deps?.isLoggedIn === "function" ? _deps.isLoggedIn() : false;
  if (!loggedIn) {
    _deps?.showToast?.("Sign in to subscribe to Pro.", { durationMs: 2800 });
    try {
      location.hash = "#/auth";
    } catch {}
    return;
  }
  if (!native) {
    _deps?.showToast?.("Open NabadAi on your iPhone to subscribe.", { durationMs: 3200 });
    return;
  }
  if (!isBillingConfigured()) {
    _deps?.showToast?.("Billing is not configured yet. Finish App Store Connect + RevenueCat setup.", {
      durationMs: 3600,
    });
    return;
  }
  const userId = typeof _deps?.getUserId === "function" ? _deps.getUserId() : "";
  const btn = document.getElementById("btnProSubscribe");
  if (btn) btn.disabled = true;
  try {
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
    if (btn) btn.disabled = false;
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
      const id = String(planBtn.getAttribute("data-pro-plan") || "").trim();
      if (id === "weekly" || id === "monthly") {
        _selectedPlan = id;
        paintPlanCards();
      }
      return;
    }
    if (ev.target?.closest?.("#btnProSubscribe")) {
      ev.preventDefault();
      handleSubscribeClick();
      return;
    }
    if (ev.target?.closest?.("#btnProBenefitsToggle")) {
      ev.preventDefault();
      _benefitsExpanded = !_benefitsExpanded;
      paintBenefitsExpanded();
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
  if (needsRender || entering) {
    if (entering) _benefitsExpanded = true;
    paintPlanCards();
    paintBenefitsExpanded();
  }
}
