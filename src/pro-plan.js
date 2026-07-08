/**
 * NabadAi Pro — subscription + credit pack UI (design-first; IAP wires in later).
 */

import {
  CREDIT_PACKS,
  PRO_FEATURES,
  PRO_LAUNCH_COPY,
  PRO_PLANS,
  songsFromCredits,
} from "./pro-plan-config.js";

/** @type {{ showToast?: (msg: string, opts?: object) => void, isLoggedIn?: () => boolean, isNativeIos?: () => boolean, navigateToRoute?: (route: string) => void } | null} */
let _deps = null;

let _mounted = false;
let _selectedPlan = "monthly";
let _activeTab = "pro";
let _benefitsExpanded = false;
let _pageBound = false;
let _backBound = false;
let _resizePaintTimer = 0;
let _returnRoute = "settings";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function root() {
  return document.querySelector('[data-route="pro"]');
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
  const songs = songsFromCredits(plan.creditsPerPeriod);
  const suffix = String(plan.priceSuffix || "").replace(/^\s*\/\s*/, "");
  return `
    <button
      type="button"
      class="proPlanCard${isSelected ? " isSelected" : ""}${plan.id === "monthly" ? " proPlanCard--monthly" : ""}"
      data-pro-plan="${esc(plan.id)}"
      aria-pressed="${isSelected ? "true" : "false"}"
    >
      ${plan.saveBadge ? `<span class="proPlanCardSave">${esc(plan.saveBadge)}</span>` : ""}
      ${plan.badge ? `<span class="proPlanCardBadge">${esc(plan.badge)}</span>` : ""}
      <span class="proPlanCardLabel">${esc(plan.label)}</span>
      <span class="proPlanCardPrice">
        <strong>${esc(plan.priceDisplay)}</strong>
        <span>/${esc(suffix)}</span>
      </span>
      <span class="proPlanCardCredits">${esc(String(plan.creditsPerPeriod))} credits</span>
      <span class="proPlanCardSongs">≈ ${esc(songs)}</span>
      ${trial ? `<span class="proPlanCardTrial">${esc(plan.trialLabel)}</span>` : ""}
    </button>`;
}

function benefitsListHtml() {
  return PRO_FEATURES.map((f) => `
    <li class="proBenefitsRow">${esc(f.label)}</li>
  `).join("");
}

function benefitsDetailHtml() {
  return PRO_FEATURES.map((f) => `
    <li class="proBenefitDetailRow">
      <span class="proBenefitDetailLabel">${esc(f.label)}</span>
      <span class="proBenefitDetailSub">${esc(f.sub)}</span>
    </li>
  `).join("");
}

function packRowHtml(pack) {
  const songs = pack.songsHint || songsFromCredits(pack.credits);
  return `
    <button
      type="button"
      class="proPackRow"
      data-credit-pack="${esc(pack.id)}"
      aria-label="Buy ${esc(pack.label)} pack, ${esc(String(pack.credits))} credits, ${esc(pack.priceDisplay)}"
    >
      <span class="proPackRowTop">
        <span class="proPackRowLabelWrap">
          <span class="proPackRowLabel">${esc(pack.label)}</span>
          ${pack.badge ? `<span class="proPackRowBadge">${esc(pack.badge)}</span>` : ""}
        </span>
        <span class="proPackRowPrice">${esc(pack.priceDisplay)}</span>
      </span>
      <span class="proPackRowCredits">${esc(String(pack.credits))} credits</span>
      <span class="proPackRowSongs">≈ ${esc(songs)}</span>
    </button>
  `;
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
  const page = root();
  if (!page) return;
  const grid = page.querySelector(".proPlanGrid");
  if (!grid) return;
  grid.innerHTML = PRO_PLANS.map((p) => planCardHtml(p, _selectedPlan)).join("");
  paintCta();
}

function paintTabState({ animate = true } = {}) {
  const page = root();
  if (!page) return;

  const seg = page.querySelector(".proSeg");
  const thumb = page.querySelector(".proSegThumb");
  const tabs = page.querySelectorAll(".proSegTab");
  const panels = page.querySelectorAll(".proTabPanel");

  tabs.forEach((tab) => {
    const on = tab.getAttribute("data-pro-tab") === _activeTab;
    tab.classList.toggle("isActive", on);
    tab.setAttribute("aria-selected", on ? "true" : "false");
  });

  panels.forEach((panel) => {
    const on = panel.getAttribute("data-pro-tab-panel") === _activeTab;
    if (on) {
      panel.hidden = false;
      panel.classList.add("isActive");
    } else {
      panel.classList.remove("isActive");
      panel.hidden = true;
    }
  });

  if (seg && thumb) {
    const activeTab = page.querySelector(`.proSegTab[data-pro-tab="${_activeTab}"]`);
    if (activeTab) {
      const segRect = seg.getBoundingClientRect();
      const tabRect = activeTab.getBoundingClientRect();
      const inset = 2;
      thumb.style.width = `${Math.max(0, tabRect.width - inset * 2)}px`;
      thumb.style.transform = `translateX(${Math.max(0, tabRect.left - segRect.left + inset)}px)`;
    }
  }

  page.dataset.proTab = _activeTab;
  seg?.classList.toggle("proSeg--noAnim", !animate);
}

function paintBenefitsExpanded() {
  const page = root();
  if (!page) return;
  const details = page.querySelector("#proBenefitsDetails");
  const toggle = page.querySelector("#btnProBenefitsToggle");
  if (!toggle) return;
  const open = _benefitsExpanded;
  if (details) details.hidden = !open;
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
  toggle.classList.toggle("isOpen", open);
  toggle.innerHTML = `${open ? "Hide benefits" : "View all benefits"}<span class="proBenefitsChev" aria-hidden="true">›</span>`;
}

function setActiveTab(tab, { animate = true } = {}) {
  if (tab !== "pro" && tab !== "credits") return;
  if (_activeTab === tab) return;
  _activeTab = tab;
  paintTabState({ animate });
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
  if (!preserveTab) {
    _activeTab = "pro";
    _benefitsExpanded = false;
  } else {
    _benefitsExpanded = false;
  }

  const plan = selectedPlan();
  const native = isNativeIos();
  const statusNote = native ? PRO_LAUNCH_COPY.iapSoon : PRO_LAUNCH_COPY.webOnly;
  const packsLead = String(PRO_LAUNCH_COPY.packsLead || "").replace(/\n/g, " ");

  host.innerHTML = `
    <div class="proHeroCopy" aria-labelledby="proHeroTitle">
      <h3 id="proHeroTitle" class="proHeroTitle">
        <span class="proHeroTitleLine">Create more.</span>
        <span class="proHeroTitleLine">Sound pro.</span>
      </h3>
      <p class="proHeroLead">${esc(PRO_LAUNCH_COPY.lead)}</p>
    </div>

    <section class="proMain" aria-label="Pro or credits">
      <div class="proSeg" role="tablist" aria-label="Pro or credits">
        <span class="proSegThumb" aria-hidden="true"></span>
        <button type="button" class="proSegTab isActive" role="tab" data-pro-tab="pro" aria-selected="true" id="proTabPro">Pro</button>
        <button type="button" class="proSegTab" role="tab" data-pro-tab="credits" aria-selected="false" id="proTabCredits">Credits</button>
      </div>

      <div class="proTabStage">
        <div class="proTabPanel isActive" data-pro-tab-panel="pro" role="tabpanel" aria-labelledby="proTabPro">
          <section class="proPlans" aria-label="Choose a plan">
            <div class="proPlanGrid">
              ${PRO_PLANS.map((p) => planCardHtml(p, _selectedPlan)).join("")}
            </div>
          </section>

          <div class="proCtaBlock">
            <button type="button" id="btnProSubscribe" class="primary proSubscribeBtn" data-pro-plan="${esc(plan.id)}">
              ${esc(ctaLabel(plan))}
            </button>
            <p id="proSubscribeSub" class="proSubscribeSub"></p>
          </div>

          <section class="proBenefits" aria-labelledby="proFeaturesTitle">
            <h3 id="proFeaturesTitle" class="proBenefitsTitle">Everything in Pro</h3>
            <ul class="proBenefitsList">${benefitsListHtml()}</ul>
            <ul id="proBenefitsDetails" class="proBenefitDetails" hidden>${benefitsDetailHtml()}</ul>
            <button type="button" id="btnProBenefitsToggle" class="proBenefitsToggle" aria-expanded="false">
              View all benefits
              <span class="proBenefitsChev" aria-hidden="true">›</span>
            </button>
          </section>
        </div>

        <div class="proTabPanel" data-pro-tab-panel="credits" role="tabpanel" aria-labelledby="proTabCredits" hidden>
          <header class="proCreditsHead">
            <h3 class="proCreditsHeadline">${esc(PRO_LAUNCH_COPY.packsHeadline)}</h3>
            <p class="proCreditsLead">${esc(packsLead)}</p>
          </header>
          <div class="proPackList">${CREDIT_PACKS.map((pack) => packRowHtml(pack)).join("")}</div>
        </div>
      </div>
    </section>

    <p class="proStatusNote">${esc(statusNote)}</p>
    <button type="button" class="proRestoreLink" data-pro-restore>Restore purchases</button>
  `;

  bindProPlanPageOnce();
  bindProBackOnce();
  paintProBackLink();
  paintCta();
  paintTabState({ animate: false });
  paintBenefitsExpanded();
}

function handleSubscribeClick() {
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
  _deps?.showToast?.(
    plan.trialDays > 0
      ? `Pro ${plan.label} (${plan.trialLabel}) — IAP wiring comes next.`
      : `Pro ${plan.label} — IAP wiring comes next.`,
    { durationMs: 3200 },
  );
}

function handlePackClick(packId) {
  const pack = CREDIT_PACKS.find((p) => p.id === packId);
  if (!pack) return;
  const native = isNativeIos();
  const loggedIn = typeof _deps?.isLoggedIn === "function" ? _deps.isLoggedIn() : false;
  if (!loggedIn) {
    _deps?.showToast?.("Sign in to buy credits.", { durationMs: 2800 });
    try {
      location.hash = "#/auth";
    } catch {}
    return;
  }
  if (!native) {
    _deps?.showToast?.("Credit packs are available in the NabadAi iPhone app.", { durationMs: 3200 });
    return;
  }
  _deps?.showToast?.(`${pack.label} pack (${pack.credits} credits) — IAP wiring comes next.`, { durationMs: 3000 });
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
    const tabBtn = ev.target?.closest?.(".proSegTab");
    if (tabBtn) {
      ev.preventDefault();
      setActiveTab(String(tabBtn.getAttribute("data-pro-tab") || ""));
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
      _deps?.showToast?.("Restore purchases — coming with App Store setup.", { durationMs: 2800 });
      return;
    }
    const packBtn = ev.target?.closest?.("[data-credit-pack]");
    if (packBtn) {
      ev.preventDefault();
      handlePackClick(String(packBtn.getAttribute("data-credit-pack") || ""));
    }
  });

  window.addEventListener("resize", () => {
    if ((document.body.getAttribute("data-route") || "") !== "pro") return;
    window.clearTimeout(_resizePaintTimer);
    _resizePaintTimer = window.setTimeout(() => paintTabState({ animate: false }), 120);
  }, { passive: true });
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
    paintPlanCards();
    paintTabState({ animate: false });
    paintBenefitsExpanded();
  }
}
