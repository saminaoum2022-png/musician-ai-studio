/**
 * Post gifts — send included Pro, paid or promo credits to another creator (never re-gift received gifts).
 * Daily cap is enforced by the API; the sheet only mirrors it so people see what is left.
 */

import { GIFT_TIER_OPTIONS, giftTierSheetIconHtml } from "./gift-tier-icons.js";
import { showGiftSentOverlay, previewGiftSent, hideGiftSentOverlay } from "./gift-sent-overlay.js";

const GIFT_TIERS = GIFT_TIER_OPTIONS.map((o) => o.tier);
const PREVIEW_HOLD_MS = 380;
/** Mid-song tip nudge on the existing player-rail gift box (once per listen). */
const GIFT_RAIL_NUDGE_AT = 0.58;
const GIFT_RAIL_NUDGE_CLASS = "isGiftNudge";

let _deps = null;
let _pending = null;
let _sending = false;
let _sendingTier = 0;
let _giftRailNudgeKey = "";
let _giftRailNudgeFired = false;

function el(id) {
  return document.getElementById(id);
}

function closeGiftSheet() {
  const sheet = el("giftSheet");
  if (!sheet) return;
  sheet.hidden = true;
  sheet.setAttribute("aria-hidden", "true");
  _pending = null;
  _sendingTier = 0;
}

function setGiftSheetOpen(open) {
  const sheet = el("giftSheet");
  if (!sheet) return;
  sheet.hidden = !open;
  sheet.setAttribute("aria-hidden", open ? "false" : "true");
}

function mountGiftTierButtons() {
  const wrap = el("giftSheetTiers");
  if (!wrap || wrap.dataset.mounted === "1") return;
  wrap.dataset.mounted = "1";
  wrap.innerHTML = GIFT_TIER_OPTIONS.map(
    (opt) => `
    <button
      type="button"
      class="giftSheetTier giftSheetTier--${opt.key}"
      data-gift-tier="${opt.tier}"
      aria-label="Send ${opt.name} gift, ${opt.creditsLabel}">
      ${giftTierSheetIconHtml(opt.key)}
      <span class="giftSheetTierName">${opt.name}</span>
      <span class="giftSheetTierValue">${opt.creditsLabel}</span>
    </button>`,
  ).join("");
}

function paintGiftSheet() {
  const sub = el("giftSheetSub");
  const balanceAmount = el("giftSheetBalanceAmount");
  if (!sub || !balanceAmount) return;
  const p = _pending || {};
  sub.textContent = p.recipientHandle ? `to @${p.recipientHandle}` : "to this creator";
  const giftable = Number(_deps?.getGiftableBalance?.() || 0);
  balanceAmount.textContent = String(_deps?.formatCreditsAmount?.(giftable) ?? giftable);
  const dailyLeftRaw = _deps?.getGiftDailyRemaining?.();
  const dailyLeft = Number.isFinite(Number(dailyLeftRaw)) ? Number(dailyLeftRaw) : Infinity;
  const caption = el("giftSheetBalanceCaption");
  if (caption) {
    caption.textContent = Number.isFinite(dailyLeft)
      ? `Credits Available · ${_deps?.formatCreditsAmount?.(dailyLeft) ?? dailyLeft} left to gift today`
      : "Credits Available";
  }
  const tierWrap = el("giftSheetTiers");
  if (tierWrap) {
    tierWrap.querySelectorAll("[data-gift-tier]").forEach((btn) => {
      const tier = Number(btn.getAttribute("data-gift-tier"));
      const disabled = !Number.isFinite(tier) || tier > giftable || tier > dailyLeft || _sending;
      btn.disabled = disabled;
      btn.setAttribute("aria-disabled", disabled ? "true" : "false");
      btn.classList.toggle("isSending", _sending && tier === _sendingTier);
    });
  }
}

function bindGiftTierPreviewHold() {
  const wrap = el("giftSheetTiers");
  if (!wrap || wrap.dataset.previewBound === "1") return;
  wrap.dataset.previewBound = "1";
  wrap.querySelectorAll("[data-gift-tier]").forEach((btn) => {
    const tier = Number(btn.getAttribute("data-gift-tier"));
    if (!Number.isFinite(tier)) return;
    let holdTimer = null;
    let previewed = false;

    const clearHold = () => {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    };

    btn.addEventListener("pointerdown", () => {
      previewed = false;
      clearHold();
      holdTimer = setTimeout(() => {
        previewed = true;
        previewGiftSent(tier, { haptic: _deps?.haptic });
      }, PREVIEW_HOLD_MS);
    });

    btn.addEventListener("pointerup", clearHold);
    btn.addEventListener("pointerleave", clearHold);
    btn.addEventListener("pointercancel", clearHold);

    btn.addEventListener(
      "click",
      (e) => {
        if (!previewed) return;
        e.preventDefault();
        e.stopPropagation();
        previewed = false;
      },
      true,
    );
  });
}

export function initGifts(deps) {
  _deps = deps || {};
  mountGiftTierButtons();
  bindGiftTierPreviewHold();
  try {
    if (typeof globalThis !== "undefined") {
      globalThis.previewGiftSent = (tier) => previewGiftSent(tier, { haptic: _deps?.haptic });
    }
  } catch {}
  const sheet = el("giftSheet");
  if (!sheet || sheet.dataset.giftsBound === "1") return;
  sheet.dataset.giftsBound = "1";

  sheet.addEventListener("click", (e) => {
    if (e.target.closest("[data-gift-dismiss]")) {
      e.preventDefault();
      closeGiftSheet();
      return;
    }
    const tierBtn = e.target.closest("[data-gift-tier]");
    if (!tierBtn || tierBtn.disabled || !_pending) return;
    e.preventDefault();
    void sendGift(Number(tierBtn.getAttribute("data-gift-tier")));
  });
}

function playerGiftMetaFromDom() {
  const handleEl = document.querySelector("#playerCreatorIdentity .playerCreatorHandle");
  const avatar = document.getElementById("playerSocialCreatorAvatar");
  const handle = String(
    avatar?.dataset?.userHandle ||
    handleEl?.textContent ||
    "",
  )
    .trim()
    .replace(/^@/, "");
  const title = String(document.getElementById("playerTitle")?.textContent || "").trim();
  const recipientUserId = String(avatar?.dataset?.userId || "").trim();
  return { handle, title, recipientUserId };
}

export function openGiftSheetForTarget({
  targetKind = "song",
  targetId = "",
  recipientUserId = "",
  songTitle = "",
  recipientHandle = "",
} = {}) {
  if (!_deps?.getAuthUserId?.()) {
    _deps?.showToast?.("Sign in to send a gift.", { icon: "!" });
    return;
  }
  const targetIdNorm = String(targetId || "").trim();
  const recipientUserIdNorm = String(recipientUserId || "").trim();
  if (!targetIdNorm || !recipientUserIdNorm) {
    _deps?.showToast?.("Gifts are available on published songs.", { icon: "!" });
    return;
  }
  if (targetKind !== "song") {
    _deps?.showToast?.("Gifts are available on published songs.", { icon: "!" });
    return;
  }
  if (recipientUserIdNorm === _deps.getAuthUserId()) return;

  _pending = {
    targetKind,
    targetId: targetIdNorm,
    recipientUserId: recipientUserIdNorm,
    songTitle: String(songTitle || "").trim(),
    recipientHandle: String(recipientHandle || "").trim().replace(/^@/, ""),
  };
  _sendingTier = 0;
  paintGiftSheet();
  setGiftSheetOpen(true);
  try {
    _deps?.haptic?.("light");
  } catch {}
}

export function openGiftSheetFromButton(btn) {
  if (!_deps?.getAuthUserId?.()) {
    _deps?.showToast?.("Sign in to send a gift.", { icon: "!" });
    return;
  }
  const row = btn?.closest?.(".followActActions[data-friends-act-row], .playerSocialActions");
  if (!row) return;
  const targetKind = row.getAttribute("data-friends-act-target-kind") || "";
  const targetId = row.getAttribute("data-friends-act-id") || "";
  let recipientUserId = row.getAttribute("data-friends-act-uid") || "";

  const article = row.closest(".followAct");
  const titleEl = article?.querySelector?.(".followActSong, .discoverFeedSongTitle");
  const handleEl = article?.querySelector?.(".followActUser, .followActUserLink strong");
  let songTitle = titleEl?.textContent?.trim() || "";
  let recipientHandle = handleEl?.textContent?.replace(/^@/, "").trim() || "";

  if (row.classList.contains("playerSocialActions")) {
    const playerMeta = playerGiftMetaFromDom();
    if (!recipientUserId) recipientUserId = playerMeta.recipientUserId;
    if (!songTitle) songTitle = playerMeta.title;
    if (!recipientHandle) recipientHandle = playerMeta.handle;
  }

  openGiftSheetForTarget({
    targetKind,
    targetId,
    recipientUserId,
    songTitle,
    recipientHandle,
  });
}

async function sendGift(amount) {
  if (_sending || !_pending) return;
  if (!GIFT_TIERS.includes(amount)) return;
  const token = _deps?.getAuthToken?.();
  if (!token) {
    _deps?.showToast?.("Sign in to send a gift.", { icon: "!" });
    return;
  }

  const payload = {
    targetKind: _pending.targetKind,
    targetId: _pending.targetId,
    recipientUserId: _pending.recipientUserId,
    amount,
  };
  const giftedTarget = {
    targetKind: _pending.targetKind,
    targetId: _pending.targetId,
  };

  _sending = true;
  _sendingTier = amount;
  paintGiftSheet();
  closeGiftSheet();
  showGiftSentOverlay(amount, { haptic: _deps?.haptic });

  try {
    const r = await fetch(_deps.apiUrl("/api/gifts/send"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      hideGiftSentOverlay();
      const msg = String(d?.error || "Could not send gift.");
      if (d?.code === "gifts_not_migrated") {
        _deps?.showToast?.("Gifts backend not ready — run supabase/gifts.sql first.", {
          icon: "!",
          durationMs: 3600,
        });
      } else {
        _deps?.showToast?.(msg, { icon: "!", durationMs: 3200 });
      }
      try {
        _deps?.haptic?.("error");
      } catch {}
      return;
    }

    if (typeof _deps?.refreshCredits === "function") {
      void _deps.refreshCredits({ silent: true });
    }
    _deps?.markPostGifted?.(giftedTarget.targetKind, giftedTarget.targetId);
  } catch (e) {
    hideGiftSentOverlay();
    _deps?.showToast?.(e?.message || "Gift failed.", { icon: "!", durationMs: 3200 });
    try {
      _deps?.haptic?.("error");
    } catch {}
  } finally {
    _sending = false;
    _sendingTier = 0;
    paintGiftSheet();
  }
}

function giftRailNudgeSongKey() {
  const row = document.querySelector(".playerSocialActions");
  const songId = String(row?.getAttribute("data-friends-act-id") || "").trim();
  return songId || "";
}

function clearGiftRailNudgeClass() {
  document
    .querySelectorAll(`.playerSocialAct--gift.${GIFT_RAIL_NUDGE_CLASS}, [data-friends-act="gift"].${GIFT_RAIL_NUDGE_CLASS}`)
    .forEach((btn) => btn.classList.remove(GIFT_RAIL_NUDGE_CLASS));
}

/**
 * Once near mid/late song, pulse the existing rail gift box to tip the creator.
 * Does not change gift tiers, sheet layout, or icons.
 */
export function tickGiftRailNudge(audio) {
  try {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      return;
    }
    const a = audio;
    if (!a || a.paused || a.ended) return;
    const dur = Number(a.duration);
    const cur = Number(a.currentTime);
    if (!Number.isFinite(dur) || dur < 12 || !Number.isFinite(cur) || cur < 0) return;

    const key = giftRailNudgeSongKey();
    if (!key) {
      if (_giftRailNudgeKey) {
        _giftRailNudgeKey = "";
        _giftRailNudgeFired = false;
        clearGiftRailNudgeClass();
      }
      return;
    }
    if (key !== _giftRailNudgeKey) {
      _giftRailNudgeKey = key;
      _giftRailNudgeFired = false;
      clearGiftRailNudgeClass();
    }
    if (_giftRailNudgeFired) return;
    if (cur / dur < GIFT_RAIL_NUDGE_AT) return;

    const btn = document.querySelector(
      '.playerSocialActions [data-friends-act="gift"]:not([hidden])',
    );
    if (!btn || btn.hidden || btn.classList.contains("isGifted")) return;

    _giftRailNudgeFired = true;
    btn.classList.remove(GIFT_RAIL_NUDGE_CLASS);
    // Restart CSS animation if class was somehow left on
    void btn.offsetWidth;
    btn.classList.add(GIFT_RAIL_NUDGE_CLASS);
    try {
      _deps?.haptic?.("light");
    } catch {}
    window.setTimeout(() => {
      btn.classList.remove(GIFT_RAIL_NUDGE_CLASS);
    }, 2400);
  } catch {
    /* ignore */
  }
}

export function resetGiftRailNudge() {
  _giftRailNudgeKey = "";
  _giftRailNudgeFired = false;
  clearGiftRailNudgeClass();
}
