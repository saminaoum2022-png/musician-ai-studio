/**
 * Pro Singer — applications, performance requests, and roster picker.
 */

export const PRO_SINGER_PACKAGES = Object.freeze([
  {
    tier: "re_vocal",
    label: "Pro Re-vocal",
    priceUsd: 49,
    blurb: "Your existing song, sung by a pro.",
    requiresSong: true,
  },
  {
    tier: "occasion",
    label: "Occasion song",
    priceUsd: 99,
    blurb: "We create the base track + pro vocal.",
    requiresSong: false,
  },
  {
    tier: "premium",
    label: "Premium",
    priceUsd: 149,
    blurb: "Rush delivery, WAV, and 2 revisions.",
    requiresSong: false,
  },
]);

export const PRO_SINGER_SPECIFIC_ADDON_USD = 20;

let _deps = null;
let _requestCtx = null;
let _requestStep = 0;
let _roster = [];
let _singerChoice = "best_match";
let _selectedPackage = "re_vocal";
let _submitting = false;
let _applicationState = null;
let _applyPhotoUrl = "";
let _singerGigs = [];
let _gigResponding = false;

async function apiPatch(path, body) {
  if (_deps?.ensureNativeNetworkReady) await _deps.ensureNativeNetworkReady();
  const token = _deps?.getAuthToken?.();
  if (!token) throw new Error("Sign in to continue.");
  const url = resolveProSingerApiUrl(path);
  const doFetch = _deps?.apiFetch || fetch;
  const r = await doFetch(url, {
    method: "POST",
    headers: proSingerFetchHeaders({
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(body || {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(String(data?.error || `Request failed (${r.status})`));
  return data;
}

function el(id) {
  return document.getElementById(id);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setSheetOpen(id, open) {
  const sheet = el(id);
  if (!sheet) return;
  sheet.hidden = !open;
  sheet.setAttribute("aria-hidden", open ? "false" : "true");
}

function resolveProSingerApiUrl(path) {
  const p = String(path || "").startsWith("/") ? path : `/${path}`;
  try {
    const baked = String(window.__NABAD_CLIENT_ENV__?.apiBase || "").trim().replace(/\/$/, "");
    if (baked) return `${baked}${p}`;
  } catch {}
  return _deps?.apiUrl ? _deps.apiUrl(path) : p;
}

function proSingerFetchHeaders(extra = {}) {
  const headers = { ...(extra || {}) };
  if (typeof _deps?.getApiFetchHeaders === "function") {
    return _deps.getApiFetchHeaders(headers);
  }
  return headers;
}

async function apiGet(path) {
  if (_deps?.ensureNativeNetworkReady) await _deps.ensureNativeNetworkReady();
  const token = _deps?.getAuthToken?.();
  if (!token) throw new Error("Sign in to continue.");
  const url = resolveProSingerApiUrl(path);
  const doFetch = _deps?.apiFetch || fetch;
  const r = await doFetch(url, {
    headers: proSingerFetchHeaders({ Authorization: `Bearer ${token}` }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = String(data?.error || "");
    if (r.status === 404) {
      throw new Error("Pro singer API not found. Close the app fully and reopen — staging API should be used.");
    }
    throw new Error(msg || `Request failed (${r.status})`);
  }
  return data;
}

async function apiPost(path, body) {
  if (_deps?.ensureNativeNetworkReady) await _deps.ensureNativeNetworkReady();
  const token = _deps?.getAuthToken?.();
  if (!token) throw new Error("Sign in to continue.");
  const url = resolveProSingerApiUrl(path);
  const doFetch = _deps?.apiFetch || fetch;
  const r = await doFetch(url, {
    method: "POST",
    headers: proSingerFetchHeaders({
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(body || {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = String(data?.error || "");
    if (r.status === 404) {
      throw new Error("Pro singer API not found. Close the app fully and reopen — staging API should be used.");
    }
    if (msg.includes("not set up yet") || msg.includes("pro_singer") || msg.includes("singer_applications")) {
      throw new Error("Pro singer backend is not ready yet — run supabase/pro_singers.sql in Supabase.");
    }
    throw new Error(msg || `Request failed (${r.status})`);
  }
  return data;
}

function packageByTier(tier) {
  return PRO_SINGER_PACKAGES.find((p) => p.tier === tier) || PRO_SINGER_PACKAGES[0];
}

function computePriceUsd() {
  const pkg = packageByTier(_selectedPackage);
  let total = pkg.priceUsd;
  if (_singerChoice !== "best_match") total += PRO_SINGER_SPECIFIC_ADDON_USD;
  return total;
}

function requestSteps() {
  const hasSong = Boolean(_requestCtx?.songId);
  if (hasSong) return ["brief", "singer", "package", "review"];
  return ["mode", "brief", "singer", "package", "review"];
}

function paintRequestSteps() {
  const mount = el("proSingerRequestSteps");
  const dots = el("proSingerRequestDots");
  if (!mount) return;
  const steps = requestSteps();
  const stepKey = steps[_requestStep] || steps[0];
  if (dots) {
    dots.innerHTML = steps
      .map((_, i) => `<span class="proSingerDot${i === _requestStep ? " isActive" : i < _requestStep ? " isDone" : ""}"></span>`)
      .join("");
  }

  const song = _requestCtx || {};
  const art = song.artUrl || "./assets/icons/splash-mark.png";
  const title = song.title || "Your song";

  if (stepKey === "mode") {
    mount.innerHTML = `
      <p class="proSingerLead">Don't have a song yet? Tell us the occasion — we'll create the base track and have a pro singer perform it.</p>
      <label class="proSingerField">
        <span>Occasion</span>
        <select id="proSingerOccasion">
          <option value="anniversary">Anniversary</option>
          <option value="wedding">Wedding</option>
          <option value="birthday">Birthday</option>
          <option value="love">Love song</option>
          <option value="other">Other</option>
        </select>
      </label>`;
    return;
  }

  if (stepKey === "brief") {
    mount.innerHTML = `
      ${song.songId ? `
      <div class="proSingerSongCard">
        <img src="${escapeHtml(art)}" alt="" class="proSingerSongArt" />
        <div>
          <div class="proSingerSongTitle">${escapeHtml(title)}</div>
          <div class="proSingerSongSub">This track will be re-vocalized</div>
        </div>
      </div>` : `
      <label class="proSingerField">
        <span>Occasion</span>
        <select id="proSingerOccasion">
          <option value="anniversary">Anniversary</option>
          <option value="wedding">Wedding</option>
          <option value="birthday">Birthday</option>
          <option value="love">Love song</option>
          <option value="other">Other</option>
        </select>
      </label>`}
      <label class="proSingerField">
        <span>Story & details</span>
        <textarea id="proSingerBrief" rows="4" maxlength="2000" placeholder="Names, tone, language, what the singer should feel…"></textarea>
      </label>
      <label class="proSingerField">
        <span>Notes for singer (optional)</span>
        <textarea id="proSingerSingerNotes" rows="2" maxlength="1000" placeholder="Soft and emotional, female voice, Arabic…"></textarea>
      </label>
      <label class="proSingerField">
        <span>Your Instagram (optional)</span>
        <input id="proSingerContactIg" type="text" inputmode="text" autocomplete="off" placeholder="@you" />
      </label>`;
    return;
  }

  if (stepKey === "singer") {
    const rosterHtml = _roster.length
      ? _roster.map((s) => {
        const id = s.userId;
        const selected = _singerChoice === id;
        const avatar = s.avatar || "./assets/icons/splash-mark.png";
        return `
        <button type="button" class="proSingerPick${selected ? " isSelected" : ""}" data-singer-pick="${escapeHtml(id)}">
          <img src="${escapeHtml(avatar)}" alt="" class="proSingerPickArt" />
          <span class="proSingerPickBody">
            <span class="proSingerPickName">${escapeHtml(s.displayName)}</span>
            <span class="proSingerPickMeta">${escapeHtml(s.genres || s.languages || "Worldwide")}${s.instagram ? ` · @${escapeHtml(s.instagram)}` : ""}</span>
          </span>
        </button>`;
      }).join("")
      : `<p class="proSingerMuted">Our roster is growing — choose Best match and we'll assign the right singer.</p>`;

    mount.innerHTML = `
      <p class="proSingerLead">Choose a singer or let us pick the best match for your song.</p>
      <button type="button" class="proSingerPick proSingerPick--best${_singerChoice === "best_match" ? " isSelected" : ""}" data-singer-pick="best_match">
        <span class="proSingerPickIco" aria-hidden="true">✦</span>
        <span class="proSingerPickBody">
          <span class="proSingerPickName">Best match</span>
          <span class="proSingerPickMeta">Recommended — we assign the right singer</span>
        </span>
      </button>
      ${rosterHtml}
      ${_roster.length ? `<p class="proSingerAddonNote">Choosing a specific singer adds $${PRO_SINGER_SPECIFIC_ADDON_USD}.</p>` : ""}`;
    return;
  }

  if (stepKey === "package") {
    const cards = PRO_SINGER_PACKAGES.map((p) => {
      const disabled = p.requiresSong && !song.songId;
      const selected = _selectedPackage === p.tier;
      return `
      <button type="button" class="proSingerPkg${selected ? " isSelected" : ""}${disabled ? " isDisabled" : ""}" data-pro-pkg="${p.tier}"${disabled ? " disabled" : ""}>
        <span class="proSingerPkgPrice">$${p.priceUsd}</span>
        <span class="proSingerPkgLabel">${escapeHtml(p.label)}</span>
        <span class="proSingerPkgBlurb">${escapeHtml(p.blurb)}</span>
      </button>`;
    }).join("");
    mount.innerHTML = `
      <p class="proSingerLead">Fixed packages — payment link sent after you submit.</p>
      <div class="proSingerPkgGrid">${cards}</div>`;
    return;
  }

  if (stepKey === "review") {
    const pkg = packageByTier(_selectedPackage);
    const singerLabel = _singerChoice === "best_match"
      ? "Best match"
      : (_roster.find((s) => s.userId === _singerChoice)?.displayName || "Selected singer");
    mount.innerHTML = `
      <div class="proSingerReviewCard">
        <div class="proSingerReviewRow"><span>Package</span><strong>${escapeHtml(pkg.label)}</strong></div>
        <div class="proSingerReviewRow"><span>Singer</span><strong>${escapeHtml(singerLabel)}</strong></div>
        <div class="proSingerReviewRow"><span>Song</span><strong>${escapeHtml(song.title || "Occasion — we create it")}</strong></div>
        <div class="proSingerReviewRow proSingerReviewTotal"><span>Total</span><strong>$${computePriceUsd()}</strong></div>
      </div>
      <p class="proSingerMuted">We'll contact you within 24 hours with a Stripe payment link. Turnaround is usually 5–7 days (2–3 for Premium).</p>`;
  }
}

function collectRequestPayload() {
  const song = _requestCtx || {};
  const brief = String(el("proSingerBrief")?.value || "").trim();
  const singerNotes = String(el("proSingerSingerNotes")?.value || "").trim();
  const occasion = String(el("proSingerOccasion")?.value || song.occasion || "").trim();
  const contactInstagram = String(el("proSingerContactIg")?.value || "").trim();
  const bestMatch = _singerChoice === "best_match";
  return {
    packageTier: _selectedPackage,
    songId: song.songId || "",
    songTitle: song.title || "",
    songArtUrl: song.artUrl || "",
    occasion,
    brief,
    singerNotes,
    contactInstagram,
    bestMatch,
    singerId: bestMatch ? null : _singerChoice,
  };
}

async function loadRoster() {
  try {
    const data = await apiGet("/api/music/pro-singers");
    _roster = Array.isArray(data.singers) ? data.singers : [];
  } catch {
    _roster = [];
  }
}

export async function openProSingerRequestSheet(track = null) {
  if (!_deps?.getAuthToken?.()) {
    _deps?.showToast?.("Sign in to request a pro singer.");
    return;
  }
  _requestStep = 0;
  _singerChoice = "best_match";
  _selectedPackage = track?.id || track?.localId ? "re_vocal" : "occasion";
  _requestCtx = track
    ? {
      songId: String(track.cloudSongId || track.songId || track.id || track.localId || "").trim(),
      title: String(track.title || track.name || "Untitled").trim(),
      artUrl: String(track.artUrl || track.imageUrl || track.cover || track.imageThumb || "").trim(),
    }
    : { songId: "", title: "", artUrl: "" };
  await loadRoster();
  paintRequestSteps();
  updateRequestNav();
  setSheetOpen("proSingerRequestSheet", true);
}

function updateRequestNav() {
  const steps = requestSteps();
  const back = el("btnProSingerBack");
  const next = el("btnProSingerNext");
  const submit = el("btnProSingerSubmit");
  if (back) back.hidden = _requestStep <= 0;
  if (next) next.hidden = _requestStep >= steps.length - 1;
  if (submit) submit.hidden = _requestStep < steps.length - 1;
}

export function closeProSingerRequestSheet() {
  setSheetOpen("proSingerRequestSheet", false);
  _requestCtx = null;
  _requestStep = 0;
  _submitting = false;
}

async function advanceRequestStep() {
  const steps = requestSteps();
  const stepKey = steps[_requestStep];
  if (stepKey === "brief") {
    const brief = String(el("proSingerBrief")?.value || "").trim();
    if (!brief && !_requestCtx?.songId) {
      _deps?.showToast?.("Tell us about the occasion or story.");
      return;
    }
    if (_requestCtx?.songId && !brief) {
      _deps?.showToast?.("Add a short brief for the singer.");
      return;
    }
  }
  if (stepKey === "package") {
    const pkg = packageByTier(_selectedPackage);
    if (pkg.requiresSong && !_requestCtx?.songId) {
      _deps?.showToast?.("Pro Re-vocal requires a library song.");
      return;
    }
  }
  if (_requestStep >= steps.length - 1) return;
  _requestStep += 1;
  paintRequestSteps();
  updateRequestNav();
}

function backRequestStep() {
  if (_requestStep <= 0) return;
  _requestStep -= 1;
  paintRequestSteps();
  updateRequestNav();
}

async function submitProSingerRequest() {
  if (_submitting) return;
  _submitting = true;
  const submitBtn = el("btnProSingerSubmit");
  if (submitBtn) submitBtn.disabled = true;
  try {
    const data = await apiPost("/api/music/pro-singer-requests", collectRequestPayload());
    closeProSingerRequestSheet();
    _deps?.showToast?.(data.message || "Request submitted — we'll contact you soon.");
  } catch (err) {
    const msg = String(err?.message || "");
    if (/load failed|failed to fetch|network/i.test(msg)) {
      _deps?.showToast?.("Could not reach the server — check your connection or try again in a moment.");
    } else {
      _deps?.showToast?.(msg || "Could not submit request.");
    }
  } finally {
    _submitting = false;
    if (submitBtn) submitBtn.disabled = false;
  }
}

function setApplySubmitVisible(visible) {
  const foot = el("proSingerApplySheet")?.querySelector(".proSingerFoot");
  if (foot) foot.hidden = !visible;
}

function paintApplicationForm() {
  const mount = el("proSingerApplyForm");
  const status = el("proSingerApplyStatus");
  if (!mount) return;
  const app = _applicationState?.application;
  if (_applicationState?.isApprovedSinger) {
    if (status) status.textContent = "You're an approved NabadAi Singer — thank you!";
    mount.innerHTML = `<p class="proSingerMuted">Open <strong>NabadAi Singer Studio</strong> from Settings to view and respond to gigs.</p>`;
    setApplySubmitVisible(false);
    return;
  }
  if (app?.status === "pending") {
    if (status) status.textContent = "Application under review — we'll reply within a few days.";
    mount.innerHTML = `<p class="proSingerMuted">Applied as @${escapeHtml(app.instagram)}. You can close this sheet.</p>`;
    setApplySubmitVisible(false);
    return;
  }
  setApplySubmitVisible(true);
  if (app?.status === "rejected") {
    if (status) status.textContent = app.adminNotes || "Not accepted this round — you may re-apply below.";
  } else if (status) {
    status.textContent = "Join the NabadAi Singers community — perform for creators worldwide.";
  }
  mount.innerHTML = `
    <label class="proSingerField proSingerPhotoField">
      <span>Profile photo</span>
      <div class="proSingerPhotoRow">
        <img id="proSingerApplyPhotoPreview" class="proSingerPhotoPreview" src="${escapeHtml(_applyPhotoUrl || app?.photoUrl || "./assets/icons/splash-mark.png")}" alt="" />
        <button type="button" class="btnGhost proSingerPhotoBtn" id="btnProSingerApplyPhoto">Upload photo</button>
        <input id="proSingerApplyPhotoInput" type="file" accept="image/*" hidden />
      </div>
    </label>
    <label class="proSingerField">
      <span>Stage name</span>
      <input id="proSingerApplyName" type="text" maxlength="80" value="${escapeHtml(app?.displayName || "")}" />
    </label>
    <label class="proSingerField">
      <span>Instagram @</span>
      <input id="proSingerApplyIg" type="text" maxlength="80" placeholder="your.handle" value="${escapeHtml(app?.instagram || "")}" />
    </label>
    <label class="proSingerField">
      <span>Languages</span>
      <input id="proSingerApplyLang" type="text" maxlength="200" placeholder="Arabic, English, French…" value="${escapeHtml(app?.languages || "")}" />
    </label>
    <label class="proSingerField">
      <span>Genres</span>
      <input id="proSingerApplyGenres" type="text" maxlength="200" placeholder="Pop, wedding, khaleeji…" value="${escapeHtml(app?.genres || "")}" />
    </label>
    <label class="proSingerField">
      <span>Demo link (optional)</span>
      <input id="proSingerApplyDemo" type="url" maxlength="500" placeholder="Instagram reel or YouTube" value="${escapeHtml(app?.demoUrl || "")}" />
    </label>
    <label class="proSingerField">
      <span>Short bio</span>
      <textarea id="proSingerApplyBio" rows="3" maxlength="1000" placeholder="Tell us about your voice and experience…">${escapeHtml(app?.bio || "")}</textarea>
    </label>`;
  _applyPhotoUrl = String(app?.photoUrl || _applyPhotoUrl || "").trim();
  el("btnProSingerApplyPhoto")?.addEventListener("click", () => el("proSingerApplyPhotoInput")?.click());
  el("proSingerApplyPhotoInput")?.addEventListener("change", async (ev) => {
    const file = ev.target?.files?.[0];
    if (!file) return;
    try {
      const dataUrl = _deps?.compressAvatarFile
        ? await _deps.compressAvatarFile(file, { maxSize: 480, quality: 0.85 })
        : "";
      if (!dataUrl) {
        _deps?.showToast?.("Could not read photo.");
        return;
      }
      _applyPhotoUrl = dataUrl;
      const img = el("proSingerApplyPhotoPreview");
      if (img) img.src = dataUrl;
    } catch {
      _deps?.showToast?.("Could not process photo.");
    }
  });
}

export async function openSingerApplicationSheet() {
  if (!_deps?.getAuthToken?.()) {
    _deps?.showToast?.("Sign in to apply.");
    return;
  }
  try {
    _applicationState = await apiGet("/api/music/singer-applications");
    _applyPhotoUrl = String(_applicationState?.application?.photoUrl || "").trim();
  } catch (err) {
    const msg = String(err?.message || "");
    if (/load failed|failed to fetch|network/i.test(msg)) {
      _deps?.showToast?.("Could not reach the server — try again in a moment.");
    } else {
      _deps?.showToast?.(msg || "Could not load application.");
    }
    return;
  }
  paintApplicationForm();
  setSheetOpen("proSingerApplySheet", true);
}

export function closeSingerApplicationSheet() {
  setSheetOpen("proSingerApplySheet", false);
}

async function submitSingerApplication() {
  if (_applicationState?.isApprovedSinger || _applicationState?.application?.status === "pending") {
    return;
  }
  if (!_applyPhotoUrl) {
    _deps?.showToast?.("Profile photo is required.");
    return;
  }
  const btn = el("btnProSingerApplySubmit");
  if (btn) btn.disabled = true;
  try {
    const data = await apiPost("/api/music/singer-applications", {
      displayName: String(el("proSingerApplyName")?.value || "").trim(),
      instagram: String(el("proSingerApplyIg")?.value || "").trim(),
      languages: String(el("proSingerApplyLang")?.value || "").trim(),
      genres: String(el("proSingerApplyGenres")?.value || "").trim(),
      demoUrl: String(el("proSingerApplyDemo")?.value || "").trim(),
      bio: String(el("proSingerApplyBio")?.value || "").trim(),
      photoUrl: _applyPhotoUrl,
    });
    _applicationState = { application: data.application, isApprovedSinger: false };
    paintApplicationForm();
    _deps?.showToast?.(data.message || "Application submitted.");
  } catch (err) {
    _deps?.showToast?.(err?.message || "Could not submit application.");
  } finally {
    if (btn) btn.disabled = false;
  }
}

function statusLabel(status) {
  const map = {
    submitted: "Submitted",
    confirmed: "Confirmed",
    in_progress: "In production",
    review: "Almost ready",
    delivered: "Ready to listen",
    closed: "Complete",
    cancelled: "Cancelled",
  };
  return map[status] || status;
}

export async function openMySingerRequestsSheet() {
  if (!_deps?.getAuthToken?.()) {
    _deps?.showToast?.("Sign in to view your requests.");
    return;
  }
  const mount = el("proSingerRequestsList");
  if (mount) mount.innerHTML = `<p class="proSingerMuted">Loading…</p>`;
  setSheetOpen("proSingerRequestsSheet", true);
  try {
    const data = await apiGet("/api/music/pro-singer-requests");
    const rows = Array.isArray(data.requests) ? data.requests : [];
    if (!rows.length) {
      mount.innerHTML = `<p class="proSingerMuted">No requests yet. Open a song in your library → ⋯ → Request real singer.</p>`;
      return;
    }
    mount.innerHTML = rows.map((r) => `
      <article class="proSingerReqRow">
        <div class="proSingerReqHead">
          <strong>${escapeHtml(r.songTitle || r.occasion || "Performance request")}</strong>
          <span class="proSingerReqBadge">${escapeHtml(r.statusLabel || statusLabel(r.status))}</span>
        </div>
        <p class="proSingerReqMeta">${escapeHtml(r.packageTier || "")} · $${Number(r.priceUsd || 0)} · Payment: ${escapeHtml(r.paymentStatus || "pending")}</p>
        <p class="proSingerReqDate">${r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ""}</p>
      </article>`).join("");
  } catch (err) {
    if (mount) mount.innerHTML = `<p class="proSingerMuted">${escapeHtml(err?.message || "Could not load requests.")}</p>`;
  }
}

export function closeMySingerRequestsSheet() {
  setSheetOpen("proSingerRequestsSheet", false);
}

function assignmentBadgeClass(status) {
  if (status === "pending") return "proSingerReqBadge proSingerReqBadge--pending";
  if (status === "accepted") return "proSingerReqBadge proSingerReqBadge--accepted";
  if (status === "declined") return "proSingerReqBadge proSingerReqBadge--declined";
  return "proSingerReqBadge";
}

function paintSingerStudioList() {
  const mount = el("proSingerStudioList");
  if (!mount) return;
  if (!_singerGigs.length) {
    mount.innerHTML = `<p class="proSingerMuted">No gigs assigned yet. When admin matches you to a request, it will appear here.</p>`;
    return;
  }
  mount.innerHTML = _singerGigs.map((g) => {
    const art = g.songArtUrl || "./assets/icons/splash-mark.png";
    const title = g.songTitle || g.occasion || "Performance request";
    const pending = g.assignmentStatus === "pending";
    const actions = pending
      ? `<div class="proSingerGigActions">
          <button type="button" class="btnPrimary" data-gig-action="accept" data-gig-id="${escapeHtml(g.id)}">Accept</button>
          <button type="button" class="btnGhost" data-gig-action="decline" data-gig-id="${escapeHtml(g.id)}">Decline</button>
        </div>`
      : "";
    return `
      <article class="proSingerGigRow" data-gig-id="${escapeHtml(g.id)}">
        <div class="proSingerSongCard">
          <img src="${escapeHtml(art)}" alt="" class="proSingerSongArt" />
          <div>
            <div class="proSingerSongTitle">${escapeHtml(title)}</div>
            <div class="proSingerSongSub">${escapeHtml(g.packageTier || "")} · ${escapeHtml(g.statusLabel || g.status || "")}</div>
          </div>
          <span class="${assignmentBadgeClass(g.assignmentStatus)}">${escapeHtml(g.assignmentLabel || g.assignmentStatus || "")}</span>
        </div>
        ${g.brief ? `<p class="proSingerGigBrief">${escapeHtml(g.brief)}</p>` : ""}
        ${g.singerNotes ? `<p class="proSingerGigNotes"><strong>Singer notes:</strong> ${escapeHtml(g.singerNotes)}</p>` : ""}
        ${actions}
      </article>`;
  }).join("");
}

export async function openSingerStudioSheet() {
  if (!_deps?.getAuthToken?.()) {
    _deps?.showToast?.("Sign in to open Singer Studio.");
    return;
  }
  const mount = el("proSingerStudioList");
  const sub = el("proSingerStudioSub");
  if (mount) mount.innerHTML = `<p class="proSingerMuted">Loading gigs…</p>`;
  setSheetOpen("proSingerStudioSheet", true);
  try {
    const data = await apiGet("/api/music/pro-singer-gigs");
    _singerGigs = Array.isArray(data.gigs) ? data.gigs : [];
    if (sub) {
      const pending = Number(data.pendingCount || 0);
      sub.textContent = pending
        ? `${pending} gig${pending === 1 ? "" : "s"} awaiting your response`
        : "Your assigned performance requests";
    }
    paintSingerStudioList();
  } catch (err) {
    const msg = String(err?.message || "");
    if (/403|approved/i.test(msg)) {
      if (mount) mount.innerHTML = `<p class="proSingerMuted">Singer Studio opens after you're approved as a NabadAi Singer.</p>`;
    } else if (mount) {
      mount.innerHTML = `<p class="proSingerMuted">${escapeHtml(msg || "Could not load gigs.")}</p>`;
    }
  }
}

export function closeSingerStudioSheet() {
  setSheetOpen("proSingerStudioSheet", false);
}

async function respondToGig(requestId, action) {
  if (_gigResponding || !requestId) return;
  let declineReason = "";
  if (action === "decline") {
    declineReason = String(window.prompt("Optional: why are you declining this gig?", "") || "").trim();
  }
  _gigResponding = true;
  try {
    const data = await apiPatch("/api/music/pro-singer-gigs", {
      requestId,
      action,
      declineReason,
    });
    _deps?.showToast?.(data.message || (action === "accept" ? "Gig accepted." : "Gig declined."));
    await openSingerStudioSheet();
    syncSettingsProSingerRows();
  } catch (err) {
    _deps?.showToast?.(err?.message || "Could not update gig.");
  } finally {
    _gigResponding = false;
  }
}

export function syncSettingsProSingerRows() {
  const applyRow = el("btnSettingsProSingerApply");
  const applyTitle = applyRow?.querySelector(".settingsRowTitle");
  const applySub = el("settingsProSingerApplySub");
  const studioRow = el("btnSettingsProSingerStudio");
  const studioSub = el("settingsProSingerStudioSub");
  const reqSub = el("settingsProSingerRequestsSub");
  if (!applySub && !reqSub && !studioRow) return;
  if (!_deps?.getAuthToken?.()) {
    if (applySub) applySub.textContent = "Sign in to apply";
    if (studioSub) studioSub.textContent = "For approved singers";
    if (studioRow) studioRow.hidden = true;
    if (reqSub) reqSub.textContent = "Sign in to view requests";
    return;
  }
  void apiGet("/api/music/singer-applications")
    .then((data) => {
      _applicationState = data;
      const approved = Boolean(data.isApprovedSinger);
      if (studioRow) studioRow.hidden = !approved;
      if (approved && applyTitle) applyTitle.textContent = "NabadAi Singer application";
      else if (applyTitle) applyTitle.textContent = "Become a NabadAi Singer";
      if (applySub) {
        if (approved) applySub.textContent = "Approved — open Singer Studio for gigs";
        else if (data.application?.status === "pending") applySub.textContent = "Application pending";
        else applySub.textContent = "Perform for creators worldwide";
      }
      if (approved && studioSub) {
        void apiGet("/api/music/pro-singer-gigs")
          .then((gigData) => {
            const pending = Number(gigData.pendingCount || 0);
            studioSub.textContent = pending
              ? `${pending} new gig${pending === 1 ? "" : "s"} · Open Singer Studio`
              : "View assigned gigs";
          })
          .catch(() => {
            studioSub.textContent = "View assigned gigs";
          });
      }
    })
    .catch(() => {
      if (applySub) applySub.textContent = "Perform for creators worldwide";
    });
  void apiGet("/api/music/pro-singer-requests")
    .then((data) => {
      const n = Array.isArray(data.requests) ? data.requests.length : 0;
      if (reqSub) reqSub.textContent = n ? `${n} request${n === 1 ? "" : "s"}` : "Track your pro singer orders";
    })
    .catch(() => {
      if (reqSub) reqSub.textContent = "Track your pro singer orders";
    });
}

function bindProSingerSheetsOnce() {
  const reqSheet = el("proSingerRequestSheet");
  if (reqSheet && reqSheet.dataset.bound !== "1") {
    reqSheet.dataset.bound = "1";
    reqSheet.addEventListener("click", (e) => {
      if (e.target.closest("[data-pro-singer-dismiss]")) closeProSingerRequestSheet();
      const pick = e.target.closest("[data-singer-pick]");
      if (pick) {
        _singerChoice = pick.getAttribute("data-singer-pick") || "best_match";
        paintRequestSteps();
      }
      const pkg = e.target.closest("[data-pro-pkg]");
      if (pkg && !pkg.disabled) {
        _selectedPackage = pkg.getAttribute("data-pro-pkg") || "re_vocal";
        paintRequestSteps();
      }
    });
    el("btnProSingerBack")?.addEventListener("click", backRequestStep);
    el("btnProSingerNext")?.addEventListener("click", () => void advanceRequestStep());
    el("btnProSingerSubmit")?.addEventListener("click", () => void submitProSingerRequest());
  }

  const applySheet = el("proSingerApplySheet");
  if (applySheet && applySheet.dataset.bound !== "1") {
    applySheet.dataset.bound = "1";
    applySheet.addEventListener("click", (e) => {
      if (e.target.closest("[data-pro-singer-dismiss]")) closeSingerApplicationSheet();
    });
    el("btnProSingerApplySubmit")?.addEventListener("click", () => void submitSingerApplication());
  }

  const listSheet = el("proSingerRequestsSheet");
  if (listSheet && listSheet.dataset.bound !== "1") {
    listSheet.dataset.bound = "1";
    listSheet.addEventListener("click", (e) => {
      if (e.target.closest("[data-pro-singer-dismiss]")) closeMySingerRequestsSheet();
    });
    el("btnProSingerNewRequest")?.addEventListener("click", () => {
      closeMySingerRequestsSheet();
      void openProSingerRequestSheet(null);
    });
  }

  const studioSheet = el("proSingerStudioSheet");
  if (studioSheet && studioSheet.dataset.bound !== "1") {
    studioSheet.dataset.bound = "1";
    studioSheet.addEventListener("click", (e) => {
      if (e.target.closest("[data-pro-singer-dismiss]")) closeSingerStudioSheet();
      const btn = e.target.closest("[data-gig-action]");
      if (btn) {
        const action = btn.getAttribute("data-gig-action") || "";
        const gigId = btn.getAttribute("data-gig-id") || "";
        if (action === "accept" || action === "decline") void respondToGig(gigId, action);
      }
    });
  }
}

export function initProSinger(deps) {
  _deps = deps || {};
  bindProSingerSheetsOnce();
}

export function openProSingerRequestForLibraryTrack(track) {
  void openProSingerRequestSheet(track);
}
