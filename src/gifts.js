/**
 * Post gifts — send paid or promo credits to another creator (never re-gift received gifts).
 */

import { GIFT_TIER_OPTIONS } from "./gift-tier-icons.js";
import { showGiftSentOverlay } from "./gift-sent-overlay.js";

const GIFT_TIERS = GIFT_TIER_OPTIONS.map((o) => o.tier);

let _deps = null;
let _pending = null;
let _sending = false;
let _sendingTier = 0;

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
      class="giftSheetTier"
      data-gift-tier="${opt.tier}"
      aria-label="Send ${opt.name} gift, ${opt.creditsLabel}">
      <span class="giftSheetTierIcon" aria-hidden="true">${opt.icon()}</span>
      <span class="giftSheetTierName">${opt.name}</span>
      <span class="giftSheetTierValue">${opt.creditsLabel}</span>
    </button>`,
  ).join("");
}

function paintGiftSheet() {
  const sub = el("giftSheetSub");
  const avail = el("giftSheetAvailable");
  const note = el("giftSheetNote");
  if (!sub || !avail) return;
  const p = _pending || {};
  const title = String(p.songTitle || "this post").trim() || "this post";
  sub.textContent = p.recipientHandle
    ? `Support @${p.recipientHandle} · ${title}`
    : `Support this creator · ${title}`;
  const giftable = Number(_deps?.getGiftableBalance?.() || 0);
  avail.textContent = `${_deps?.formatCreditsAmount?.(giftable) ?? giftable} credits available to gift`;
  if (note) {
    note.textContent =
      giftable > 0
        ? "Paid and promo credits can be gifted. Received gift credits are for creating only."
        : "You need paid or promo credits to gift. Received gift credits cannot be sent.";
  }
  const tierWrap = el("giftSheetTiers");
  if (tierWrap) {
    tierWrap.querySelectorAll("[data-gift-tier]").forEach((btn) => {
      const tier = Number(btn.getAttribute("data-gift-tier"));
      const disabled = !Number.isFinite(tier) || tier > giftable || _sending;
      btn.disabled = disabled;
      btn.setAttribute("aria-disabled", disabled ? "true" : "false");
      btn.classList.toggle("isSending", _sending && tier === _sendingTier);
    });
  }
}

export function initGifts(deps) {
  _deps = deps || {};
  mountGiftTierButtons();
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

export function openGiftSheetFromButton(btn) {
  if (!_deps?.getAuthUserId?.()) {
    _deps?.showToast?.("Sign in to send a gift.", { icon: "!" });
    return;
  }
  const row = btn?.closest?.(".followActActions[data-friends-act-row]");
  if (!row) return;
  const targetKind = row.getAttribute("data-friends-act-target-kind") || "";
  const targetId = row.getAttribute("data-friends-act-id") || "";
  const recipientUserId = row.getAttribute("data-friends-act-uid") || "";
  if (!targetId || !recipientUserId) return;
  if (targetKind !== "song") {
    _deps?.showToast?.("Gifts are available on published songs.", { icon: "!" });
    return;
  }
  if (recipientUserId === _deps.getAuthUserId()) return;

  const article = row.closest(".followAct");
  const titleEl = article?.querySelector?.(".followActSong, .discoverFeedSongTitle");
  const handleEl = article?.querySelector?.(".followActUser, .followActUserLink strong");
  _pending = {
    targetKind,
    targetId,
    recipientUserId,
    songTitle: titleEl?.textContent?.trim() || "",
    recipientHandle: handleEl?.textContent?.replace(/^@/, "").trim() || "",
  };
  _sendingTier = 0;
  paintGiftSheet();
  setGiftSheetOpen(true);
  try {
    _deps?.haptic?.("light");
  } catch {}
}

async function sendGift(amount) {
  if (_sending || !_pending) return;
  if (!GIFT_TIERS.includes(amount)) return;
  const token = _deps?.getAuthToken?.();
  if (!token) {
    _deps?.showToast?.("Sign in to send a gift.", { icon: "!" });
    return;
  }
  _sending = true;
  _sendingTier = amount;
  paintGiftSheet();
  try {
    const r = await fetch(_deps.apiUrl("/api/gifts/send"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        targetKind: _pending.targetKind,
        targetId: _pending.targetId,
        recipientUserId: _pending.recipientUserId,
        amount,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
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
    closeGiftSheet();
    showGiftSentOverlay(amount, { haptic: _deps?.haptic });
    if (typeof _deps?.refreshCredits === "function") {
      await _deps.refreshCredits({ silent: true });
    }
  } catch (e) {
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
