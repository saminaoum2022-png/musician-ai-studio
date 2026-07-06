/**
 * Post gifts — send paid credits to another creator from a published post.
 */

const GIFT_TIERS = [1, 3, 5];

let _deps = null;
let _pending = null;
let _sending = false;

function el(id) {
  return document.getElementById(id);
}

function closeGiftSheet() {
  const sheet = el("giftSheet");
  if (!sheet) return;
  sheet.hidden = true;
  sheet.setAttribute("aria-hidden", "true");
  _pending = null;
}

function setGiftSheetOpen(open) {
  const sheet = el("giftSheet");
  if (!sheet) return;
  sheet.hidden = !open;
  sheet.setAttribute("aria-hidden", open ? "false" : "true");
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
  avail.textContent = `${_deps?.formatCreditsAmount?.(giftable) ?? giftable} paid credits available to gift`;
  if (note) {
    note.textContent =
      giftable > 0
        ? "Only purchased (paid) credits can be gifted. Received gift credits stay in your balance for creating."
        : "You need paid credits to gift. Promo and received gift credits cannot be sent.";
  }
  const tierWrap = el("giftSheetTiers");
  if (tierWrap) {
    tierWrap.querySelectorAll("[data-gift-tier]").forEach((btn) => {
      const tier = Number(btn.getAttribute("data-gift-tier"));
      const disabled = !Number.isFinite(tier) || tier > giftable || _sending;
      btn.disabled = disabled;
      btn.setAttribute("aria-disabled", disabled ? "true" : "false");
    });
  }
}

export function initGifts(deps) {
  _deps = deps || {};
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
    try {
      _deps?.haptic?.("success");
    } catch {}
    _deps?.showToast?.(`Gift sent · ${amount} credit${amount === 1 ? "" : "s"}`, {
      icon: "🎁",
      durationMs: 2600,
    });
    closeGiftSheet();
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
    paintGiftSheet();
  }
}
