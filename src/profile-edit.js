/**
 * Edit Profile — dedicated creator workspace (not Settings).
 */

import { openPhotoFrame } from "./photo-frame.js";
import { MUSIC_PREFERENCE_GENRES, parseMusicPreferencesFromProfile, markMusicPreferencesComplete, profileMusicStylesDisplaySlice } from "./music-preferences.js";
import { USERNAME_MAX_LENGTH, DISPLAY_NAME_MAX_LENGTH } from "./profile-limits.js";
import {
  GOLD_RINGS,
  GOLD_TOPPERS,
  goldRingAccent,
  applyGoldToAvatarWrap,
  applyGoldNameGradient,
  goldCanEdit,
  readLocalGoldStyle,
  saveOwnGoldStyle,
  sanitizeGoldStyle,
} from "./gold-style.js";

let _deps = null;
let _inited = false;
let _draft = null;
let _dirty = false;
let _activeSheet = "";
let _genresTouched = false;
let _usernameCheckTimer = 0;
let _originalUsername = "";

const SOCIAL_FIELDS = [
  { key: "instagram", label: "Instagram", placeholder: "instagram.com/you" },
  { key: "tiktok", label: "TikTok", placeholder: "tiktok.com/@you" },
  { key: "youtube", label: "YouTube", placeholder: "youtube.com/@you" },
  { key: "spotify", label: "Spotify", placeholder: "open.spotify.com/artist/…" },
];

function qs(sel, root = document) {
  return root.querySelector(sel);
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emptyDraft() {
  return {
    displayName: "",
    username: "",
    bio: "",
    avatar: "",
    genres: [],
    links: { instagram: "", tiktok: "", youtube: "", spotify: "" },
    personaId: "",
    artistAvatar: "",
    artistAvatarGallery: [],
    clearArtistAvatar: false,
    avatarRemoved: false,
  };
}

function normalizeUsername(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_.]/g, "")
    .slice(0, USERNAME_MAX_LENGTH);
}

function cleanBio(raw) {
  const t = String(raw || "").trim();
  return /^add a short bio/i.test(t) ? "" : t.slice(0, 280);
}

function profileFromDraft(base = {}) {
  const username = normalizeUsername(_draft.username) || normalizeUsername(base.username) || "guest";
  let genreLabels = Array.isArray(_draft.genres) ? _draft.genres.slice() : [];
  if (!genreLabels.length && !_genresTouched) {
    genreLabels = parseMusicPreferencesFromProfile(base);
  }
  return {
    ...base,
    displayName: normalizeDisplayName(_draft.displayName),
    username,
    bio: cleanBio(_draft.bio),
    avatar: _draft.avatarRemoved
      ? ""
      : String(_draft.avatar || base.avatar || "").trim(),
    genres: genreLabels.join(","),
    links: {
      instagram: String(_draft.links?.instagram || "").trim(),
      tiktok: String(_draft.links?.tiktok || "").trim(),
      youtube: String(_draft.links?.youtube || "").trim(),
      spotify: String(_draft.links?.spotify || "").trim(),
    },
    artistAvatar: _draft.clearArtistAvatar
      ? ""
      : String(_draft.artistAvatar || base.artistAvatar || "").trim(),
    artistAvatarUpdatedAt: _draft.clearArtistAvatar || (_draft.artistAvatar && _draft.artistAvatar !== base.artistAvatar)
      ? Date.now()
      : Number(base.artistAvatarUpdatedAt || 0),
    artistAvatarConsentedAt: _draft.clearArtistAvatar
      ? 0
      : (_draft.artistAvatarConsentedAt || Number(base.artistAvatarConsentedAt || 0)),
    artistAvatarGallery: _draft.clearArtistAvatar
      ? []
      : (Array.isArray(_draft.artistAvatarGallery) && _draft.artistAvatarGallery.length
        ? _draft.artistAvatarGallery
        : (Array.isArray(base.artistAvatarGallery) ? base.artistAvatarGallery : [])
      ).slice(-AA_GALLERY_MAX),
    clearArtistAvatar: Boolean(_draft.clearArtistAvatar) && !String(_draft.artistAvatar || "").trim(),
  };
}

export function hydrateProfileEditDraft(profile) {
  const p = profile || _deps?.getActiveProfile?.() || {};
  const genres = parseMusicPreferencesFromProfile(p);
  const personaId =
    String(_deps?.loadPersonaSelection?.() || "").trim() ||
    String(_deps?.getActivePersonaId?.() || "").trim();
  _photoFrameSrc = "";
  _goldDirty = false;
  _draft = {
    displayName: String(p.displayName || "").trim(),
    username: String(p.username || "").trim(),
    bio: cleanBio(p.bio),
    avatar: String(p.avatar || "").trim(),
    genres: genres.slice(),
    links: {
      instagram: String(p.links?.instagram || "").trim(),
      tiktok: String(p.links?.tiktok || "").trim(),
      youtube: String(p.links?.youtube || "").trim(),
      spotify: String(p.links?.spotify || "").trim(),
    },
    personaId,
    artistAvatar: String(p.artistAvatar || "").trim(),
    artistAvatarConsentedAt: Number(p.artistAvatarConsentedAt || 0),
    artistAvatarGallery: Array.isArray(p.artistAvatarGallery) ? p.artistAvatarGallery.slice(-AA_GALLERY_MAX) : [],
    clearArtistAvatar: false,
    avatarRemoved: false,
  };
  syncArtistAvatarDraftGalleryFromActive();
  try { _draft.goldStyle = readLocalGoldStyle(goldOwnUid()); } catch { _draft.goldStyle = null; }
  _dirty = false;
  _genresTouched = false;
  _originalUsername = normalizeUsername(_draft.username);
  renderProfileEditPage();
}

let _goldDirty = false;

function markDirty() {
  _dirty = true;
  syncSaveButton();
}

function syncSaveButton() {
  const btn = qs("#btnProfileEditPageSave");
  if (!btn) return;
  btn.disabled = !_dirty;
  btn.setAttribute("aria-disabled", _dirty ? "false" : "true");
}

function normalizeDisplayName(raw) {
  return String(raw || "")
    .trim()
    .replace(/^@+/, "")
    .slice(0, DISPLAY_NAME_MAX_LENGTH);
}

function displayNamePreview() {
  const friendly = normalizeDisplayName(_draft?.displayName);
  return friendly || "Add display name";
}

function bioPreview() {
  const bio = cleanBio(_draft?.bio);
  return bio || "Add a bio";
}

function genresPreview() {
  const list = _draft?.genres || [];
  if (!list.length) return "Choose genres";
  const { shown, extra } = profileMusicStylesDisplaySlice(list);
  if (!extra) return shown.join(" · ");
  return `${shown.join(" · ")} · +${extra}`;
}

function socialPreview(key) {
  return String(_draft?.links?.[key] || "").trim() || "Add link";
}

function personaPreview() {
  const id = String(_draft?.personaId || "").trim();
  if (!id) return "Default voice";
  const list = _deps?.loadPersonas?.() || [];
  const hit = list.find((x) => String(x.personaId) === id);
  return String(hit?.label || hit?.personaId || "Selected voice");
}

function artistAvatarPreview() {
  if (!_draft?.artistAvatar) return "Not set up";
  const n = Array.isArray(_draft.artistAvatarGallery) ? _draft.artistAvatarGallery.length : 0;
  const isProfilePic = _draft.avatar === _draft.artistAvatar;
  const suffix = isProfilePic ? " · profile pic" : n > 1 ? ` · ${n} saved` : "";
  return `Ready ✦${suffix}`;
}

function applyAvatarToEditPhoto() {
  const img = qs("#profileEditAvatar");
  const fallback = qs("#profileEditAvatarFallback");
  const shell = qs(".profileEditAvatarShell");
  const hint = qs("#profileEditPhotoHint");
  const av = String(_draft?.avatar || "").trim();
  if (shell) shell.classList.toggle("isEmpty", !av);
  if (hint) hint.textContent = av ? "Tap photo to manage" : "Tap photo to add";
  if (img) {
    if (av) {
      img.src = av;
      img.dataset.empty = "false";
      img.hidden = false;
    } else {
      img.removeAttribute("src");
      img.dataset.empty = "true";
      img.hidden = true;
    }
  }
  if (fallback) {
    fallback.hidden = Boolean(av);
    fallback.setAttribute("aria-hidden", av ? "true" : "false");
  }
  applyArtistRingToEditPhoto();
  // Keep on-photo upload / retry chrome if a sync is still in flight after a re-paint.
  if (_photoSyncPending) {
    const sync = qs("#profileEditPhotoSync");
    if (sync && sync.hidden) setMediaSyncUi("photo", sync.classList.contains("isError") ? "error" : "uploading");
  }
  if (_artistSyncPending) {
    const sync = qs("#profileEditArtistSync");
    if (sync && sync.hidden) setMediaSyncUi("artist", sync.classList.contains("isError") ? "error" : "uploading");
  }
}

function goldOwnUid() {
  return String(_deps?.getAuthSession?.()?.user?.id || _deps?.getActiveProfile?.()?.id || "").trim();
}

/** Gold frame/emblem edits are part of the profile DRAFT — they light up Save and only go live (device + Supabase) when Save is tapped. */
function goldStyleChanged(next) {
  _draft.goldStyle = sanitizeGoldStyle(next);
  _goldDirty = true;
  markDirty();
  try {
    document.querySelectorAll("[data-aa-ring]").forEach((ring) => applyGoldToAvatarWrap(ring, _draft.goldStyle));
  } catch {}
  try {
    ["profileDisplayNameText", "profileEditCoverName", "aaNamePreview"].forEach((id) => {
      applyGoldNameGradient(document.getElementById(id), _draft.goldStyle);
    });
  } catch {}
  try { applyArtistRingToEditPhoto(); } catch {}
}

/** Called from Save: persist the frame/emblem to this device and to the user's profile row in Supabase. */
async function commitGoldStyleFromDraft() {
  if (!_goldDirty) return;
  const uid = goldOwnUid();
  if (!uid) return;
  const r = await saveOwnGoldStyle(uid, _draft.goldStyle);
  _goldDirty = false;
  try { _deps?.onGoldStyleChanged?.(); } catch {}
  if (!r?.cloud) {
    try { _deps?.showToast?.("Frame saved on this device — cloud sync isn't set up yet.", { durationMs: 3600 }); } catch {}
  }
}

function aaGoldBlockHtml(style) {
  const ring = style?.ring || "";
  const topper = style?.topper || "";
  const nameGradient = style?.nameGradient || "";
  const chips = [{ id: "", label: "None", swatch: "" }, ...GOLD_RINGS].map((r) => `
      <button type="button" class="aaFrameOpt" role="radio" aria-checked="${r.id === ring ? "true" : "false"}" data-aa-frame="${r.id}">
        <span class="aaFrameDot${r.id ? "" : " aaFrameDot--none"}" ${r.swatch ? `style="background:${r.swatch}"` : ""}></span>
        <span class="aaFrameLabel">${r.label}</span>
      </button>`).join("");
  const toppers = [{ id: "", label: "None", svg: "" }, ...GOLD_TOPPERS].map((t) => `
      <button type="button" class="aaFrameOpt aaTopperOpt" role="radio" aria-checked="${t.id === topper ? "true" : "false"}" data-aa-topper="${t.id}">
        <span class="aaTopperGlyph${t.id ? "" : " aaTopperGlyph--none"}">${t.svg}</span>
        <span class="aaFrameLabel">${t.label}</span>
      </button>`).join("");
  // Same catalog/ids as the ring — "Aurora ring, Gold name" is a real combo, and one
  // id space keeps this picker structurally identical to Frame instead of a new system.
  const nameChips = [{ id: "", label: "None", swatch: "" }, ...GOLD_RINGS].map((r) => `
      <button type="button" class="aaFrameOpt" role="radio" aria-checked="${r.id === nameGradient ? "true" : "false"}" data-aa-name-gradient="${r.id}">
        <span class="aaNameSwatch${r.id ? "" : " aaNameSwatch--none"}" ${r.swatch ? `style="background-image:${r.swatch}"` : ""}>Aa</span>
        <span class="aaFrameLabel">${r.label}</span>
      </button>`).join("");
  const previewName = normalizeDisplayName(_draft?.displayName) || normalizeUsername(_draft?.username) || "Your Name";
  return `
    <section class="aaGold" id="aaGoldBlock" style="--aa-emblem:${goldRingAccent(ring)}" aria-label="Gold style">
      <div class="aaGoldHead"><span class="aaGoldTitle">Gold style</span><span class="aaGoldTag">GOLD</span></div>
      <div class="aaGoldLabel">Frame</div>
      <div class="aaFrameRow" id="aaFrameRow" role="radiogroup" aria-label="Avatar frame">${chips}</div>
      <div class="aaGoldLabel aaGoldLabel--gap">Emblem</div>
      <div class="aaFrameRow" id="aaTopperRow" role="radiogroup" aria-label="Avatar emblem">${toppers}</div>
      <div class="aaGoldLabel aaGoldLabel--gap">Name colour</div>
      <div class="aaNamePreview" id="aaNamePreview">${escapeHtml(previewName)}</div>
      <div class="aaFrameRow" id="aaNameGradientRow" role="radiogroup" aria-label="Display name colour">${nameChips}</div>
    </section>`;
}

/** Nested Artist + ring on the Edit Profile photo — empty dashed +, or live AA thumb. */
function applyArtistRingToEditPhoto() {
  const ring = qs("#profileEditArtistRing");
  const thumb = qs("#profileEditArtistRingThumb");
  if (!ring) return;
  const src = String(_draft?.artistAvatar || "").trim();
  const empty = !src;
  try { applyGoldToAvatarWrap(ring, empty ? null : (_draft?.goldStyle || null)); } catch {}
  ring.classList.toggle("profileEditArtistRing--empty", empty);
  ring.setAttribute("aria-label", empty ? "Create your Artist Avatar" : "Manage your Artist Avatar");
  if (thumb) {
    if (src) {
      if (thumb.getAttribute("src") !== src) thumb.src = src;
      thumb.hidden = false;
    } else {
      thumb.removeAttribute("src");
      thumb.hidden = true;
    }
  }
}

function showProfileEditBusy(text) {
  const el = qs("#profileEditBusy");
  const label = qs("#profileEditBusyText");
  if (label) label.textContent = text || "Saving…";
  if (el) {
    el.hidden = false;
    el.setAttribute("aria-hidden", "false");
  }
  document.body.classList.add("profileEditBusyOpen");
  try { _deps?.lockSheetScroll?.(); } catch {}
}

function hideProfileEditBusy() {
  const el = qs("#profileEditBusy");
  if (el) {
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
  }
  document.body.classList.remove("profileEditBusyOpen");
  try { _deps?.unlockSheetScroll?.(); } catch {}
}

/** Pending framed data URLs waiting for a successful cloud host — used by on-photo retry. */
let _photoSyncPending = "";
let _artistSyncPending = "";
let _photoSyncRetryBound = false;

/**
 * IG-style status on the photo / Artist ring.
 * status: "uploading" | "done" | "error" | "idle"
 * Done = Storage + profile URL written. Spinner/fill only clears after that.
 */
function setMediaSyncUi(which, status) {
  const isPhoto = which === "photo";
  const root = qs(isPhoto ? "#profileEditPhotoSync" : "#profileEditArtistSync");
  const retry = qs(isPhoto ? "#profileEditPhotoSyncRetry" : "#profileEditArtistSyncRetry");
  if (!root) return;
  root.classList.remove("isUploading", "isDone", "isError");
  if (status === "idle") {
    root.hidden = true;
    if (retry) retry.hidden = true;
    return;
  }
  root.hidden = false;
  if (status === "uploading") {
    root.classList.add("isUploading");
    if (retry) retry.hidden = true;
  } else if (status === "done") {
    root.classList.add("isDone");
    if (retry) retry.hidden = true;
    window.setTimeout(() => {
      if (root.classList.contains("isDone")) setMediaSyncUi(which, "idle");
    }, 550);
  } else if (status === "error") {
    root.classList.add("isError");
    if (retry) retry.hidden = false;
  }
}

function bindMediaSyncRetryOnce() {
  if (_photoSyncRetryBound) return;
  _photoSyncRetryBound = true;
  qs("#profileEditPhotoSyncRetry")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const pending = String(_photoSyncPending || "").trim();
    if (!pending) return;
    void retryPublishProfilePhoto(pending);
  });
  qs("#profileEditArtistSyncRetry")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const pending = String(_artistSyncPending || "").trim();
    if (!pending) return;
    void retryPublishArtistAvatar(pending);
  });
}

async function retryPublishProfilePhoto(dataUrl) {
  setMediaSyncUi("photo", "uploading");
  try {
    if (!_deps?.publishProfileAvatarChange) throw new Error("Could not sync photo");
    const hosted = await _deps.publishProfileAvatarChange(dataUrl, { toast: false });
    if (hosted) _draft.avatar = String(hosted);
    _photoSyncPending = "";
    renderProfileEditPage();
    setMediaSyncUi("photo", "done");
    try { _deps?.showToast?.("Photo updated", { icon: "✓", durationMs: 1600 }); } catch {}
  } catch (e) {
    _photoSyncPending = dataUrl;
    setMediaSyncUi("photo", "error");
    try { _deps?.showToast?.(e?.message || "Upload failed — tap retry on the photo", { icon: "!", durationMs: 2800 }); } catch {}
  }
}

async function retryPublishArtistAvatar(dataUrl) {
  setMediaSyncUi("artist", "uploading");
  try {
    _draft.artistAvatar = dataUrl;
    _draft.clearArtistAvatar = false;
    await persistArtistAvatarNow();
    _artistSyncPending = "";
    renderProfileEditPage();
    setMediaSyncUi("artist", "done");
    try { _deps?.showToast?.("Artist Avatar saved ✦", { icon: "✦", durationMs: 1600 }); } catch {}
  } catch (e) {
    _artistSyncPending = dataUrl;
    setMediaSyncUi("artist", "error");
    try { _deps?.showToast?.(e?.message || "Upload failed — tap retry on Artist", { icon: "!", durationMs: 2800 }); } catch {}
  }
}

function closePhotoActionSheet() {
  const sheet = qs("#profilePhotoActionSheet");
  if (!sheet) return;
  const wasOpen = sheet.classList.contains("isOpen") || !sheet.hidden;
  sheet.classList.remove("isOpen");
  sheet.hidden = true;
  sheet.setAttribute("aria-hidden", "true");
  if (wasOpen) {
    try { _deps?.unlockSheetScroll?.(); } catch {}
  }
}

function openPhotoActionSheet(title, rows) {
  const sheet = qs("#profilePhotoActionSheet");
  const titleEl = qs("#profilePhotoActionSheetTitle");
  const rowsEl = qs("#profilePhotoActionSheetRows");
  if (!sheet || !rowsEl) return;
  if (titleEl) titleEl.textContent = title;
  rowsEl.innerHTML = rows.map((row) => `
    <button type="button" class="userActionSheetRow${row.danger ? " userActionSheetRow--danger" : ""}" data-photo-action="${escapeHtml(row.id)}">${escapeHtml(row.label)}</button>
  `).join("");
  const alreadyOpen = sheet.classList.contains("isOpen") && !sheet.hidden;
  sheet.hidden = false;
  sheet.setAttribute("aria-hidden", "false");
  if (!alreadyOpen) {
    try { _deps?.lockSheetScroll?.(); } catch {}
  }
  requestAnimationFrame(() => sheet.classList.add("isOpen"));
  rowsEl.querySelectorAll("[data-photo-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-photo-action");
      closePhotoActionSheet();
      const hit = rows.find((r) => r.id === id);
      if (hit?.run) void hit.run();
    });
  });
}

function bindPhotoActionSheetOnce() {
  const sheet = qs("#profilePhotoActionSheet");
  if (!sheet || sheet.dataset.boundPhotoSheet === "1") return;
  sheet.dataset.boundPhotoSheet = "1";
  sheet.addEventListener("click", (e) => {
    if (e.target?.closest?.("[data-photo-sheet-dismiss]")) closePhotoActionSheet();
  });
}

function openProfilePhotoFlow() {
  const av = String(_draft?.avatar || "").trim();
  const usingArtistAsPic = Boolean(_draft?.artistAvatar) && _draft.avatar === _draft.artistAvatar;
  if (!av) {
    openChoosePhotoSheet();
    return;
  }
  const rows = [
    { id: "adjust", label: "Adjust framing", run: () => void adjustCurrentPhotoFraming() },
    { id: "choose", label: "Choose new photo", run: () => openChoosePhotoSheet() },
  ];
  if (usingArtistAsPic) {
    rows.push({
      id: "stop-artist",
      label: "Stop using Artist Avatar",
      danger: true,
      run: () => void stopArtistAvatarAsProfilePicNow(),
    });
  } else {
    rows.push({
      id: "remove",
      label: "Remove photo",
      danger: true,
      run: () => void removeProfilePhotoNow(),
    });
  }
  openPhotoActionSheet("Photo", rows);
}

function openChoosePhotoSheet() {
  openPhotoActionSheet("Choose photo", [
    { id: "camera", label: "Take photo", run: () => void pickProfilePhoto("camera") },
    { id: "library", label: "Photo library", run: () => void pickProfilePhoto("library") },
  ]);
}

async function pickProfilePhoto(source) {
  try {
    const Camera = window.Capacitor?.Plugins?.Camera;
    const native = Boolean(window.Capacitor?.isNativePlatform?.());
    if (native && Camera?.getPhoto) {
      showProfileEditBusy(source === "camera" ? "Opening camera…" : "Opening library…");
      let photo;
      try {
        photo = await Camera.getPhoto({
          quality: 92,
          allowEditing: false,
          resultType: "dataUrl",
          source: source === "camera" ? "CAMERA" : "PHOTOS",
        });
      } finally {
        hideProfileEditBusy();
      }
      const dataUrl = String(photo?.dataUrl || "").trim();
      if (!dataUrl) return;
      await frameAndPublishPhoto(dataUrl);
      return;
    }
  } catch (e) {
    hideProfileEditBusy();
    const msg = String(e?.message || e || "");
    if (/cancel|dismiss|user/i.test(msg)) return;
    // Fall through to file input if the plugin is unavailable.
  }
  triggerHiddenPhotoInput(source);
}

function triggerHiddenPhotoInput(source) {
  const input = qs("#profileAvatarFile");
  if (!input) return;
  try {
    if (source === "camera") input.setAttribute("capture", "environment");
    else input.removeAttribute("capture");
  } catch {}
  try { input.click(); } catch {}
}

/** Clear the profile photo and publish right away (no need to tap Save). */
async function removeProfilePhotoNow() {
  if (!_draft || !_deps) return;
  if (_draft.artistAvatar && _draft.avatar === _draft.artistAvatar) {
    await stopArtistAvatarAsProfilePicNow();
    return;
  }
  showProfileEditBusy("Removing photo…");
  try {
    _draft.avatar = "";
    _draft.artistAvatarPrevAvatar = "";
    _draft.avatarRemoved = true;
    _draft.avatarUpdatedAt = Date.now();
    renderProfileEditPage();
    const active = _deps.getActiveProfile?.() || {};
    const next = {
      ...active,
      avatar: "",
      clearAvatar: true,
      avatarUpdatedAt: Date.now(),
    };
    try { _deps.saveProfile(next); } catch {}
    try { _deps.syncProfileUi?.(next); } catch {}
    try { await _deps.supabaseUpsertProfile(next); } catch {}
    try { _deps?.showToast?.("Photo removed", { durationMs: 1800 }); } catch {}
  } finally {
    hideProfileEditBusy();
  }
}

async function stopArtistAvatarAsProfilePicNow() {
  setArtistAvatarAsProfilePic(false);
  renderProfileEditPage();
  try { _deps?.showToast?.("Artist Avatar is only on the cover flip now", { durationMs: 2200 }); } catch {}
}

async function onAvatarFileChange(file) {
  if (!file || !_draft) return;
  try {
    showProfileEditBusy("Preparing photo…");
    let objUrl = "";
    try { objUrl = URL.createObjectURL(file); } catch {}
    _photoFrameSrc = objUrl || "";
    hideProfileEditBusy();
    await frameAndPublishPhoto(objUrl || (await _deps.compressAvatarFile(file, { maxSize: 1600, type: "image/png" })));
  } catch (e) {
    hideProfileEditBusy();
    try { _deps?.showToast?.(`Could not load photo: ${e?.message || "error"}`, { icon: "!", durationMs: 2800 }); } catch {}
  }
}

let _photoFrameSrc = "";

async function adjustCurrentPhotoFraming() {
  const src = _photoFrameSrc || String(_draft?.avatar || "");
  if (!src) {
    openChoosePhotoSheet();
    return;
  }
  await frameAndPublishPhoto(src);
}

/** Open framing; Use photo paints immediately, then on-photo upload fill until cloud confirms. */
async function frameAndPublishPhoto(src) {
  if (!src) return;
  const res = await openPhotoFrame({
    src,
    title: "Frame your photo",
    doneLabel: "Use photo",
  });
  if (!res?.avatar) return;
  _draft.avatar = res.avatar;
  _draft.avatarRemoved = false;
  _draft.avatarUpdatedAt = Date.now();
  _photoSyncPending = res.avatar;
  renderProfileEditPage();
  setMediaSyncUi("photo", "uploading");
  try {
    if (_deps?.publishProfileAvatarChange) {
      const hosted = await _deps.publishProfileAvatarChange(res.avatar, { toast: false });
      if (hosted) _draft.avatar = String(hosted);
      _photoSyncPending = "";
      renderProfileEditPage();
      setMediaSyncUi("photo", "done");
      try { _deps?.showToast?.("Photo updated", { icon: "✓", durationMs: 1800 }); } catch {}
    } else {
      markDirty();
      setMediaSyncUi("photo", "idle");
      try { _deps?.showToast?.("Photo ready — tap Save to publish", { icon: "✓", durationMs: 1800 }); } catch {}
    }
  } catch (e) {
    markDirty();
    _photoSyncPending = res.avatar;
    setMediaSyncUi("photo", "error");
    try { _deps?.showToast?.(e?.message || "Upload failed — tap retry on the photo", { icon: "!", durationMs: 2800 }); } catch {}
  }
}

/** Ring / manage sheet: same framing UX as profile photo, with a circular guide. */
async function adjustArtistAvatarFraming(srcOverride) {
  const src = String(srcOverride || _draft?.artistAvatar || "").trim();
  if (!src) {
    openArtistAvatarEditor();
    return false;
  }
  return frameAndPublishArtistAvatar(src);
}

/**
 * Bake a square PNG framed for the circular Artist ring, then persist.
 * Replaces the active AA + matching gallery entry so flip badge stays in sync.
 */
async function frameAndPublishArtistAvatar(src) {
  if (!src) return false;
  const res = await openPhotoFrame({
    src,
    title: "Frame Artist Avatar",
    doneLabel: "Use photo",
    mode: "circle",
    guideLabel: "Artist ring preview",
  });
  if (!res?.avatar) return false;
  const framed = res.avatar;
  const prev = String(_draft?.artistAvatar || "").trim();
  const wasProfilePic = Boolean(prev) && _draft.avatar === prev;
  _draft.artistAvatar = framed;
  _draft.clearArtistAvatar = false;
  _draft.artistAvatarUpdatedAt = Date.now();
  const gallery = Array.isArray(_draft.artistAvatarGallery) ? _draft.artistAvatarGallery.slice() : [];
  let replaced = false;
  for (let i = 0; i < gallery.length; i++) {
    if (gallery[i] === prev || gallery[i] === src) {
      gallery[i] = framed;
      replaced = true;
    }
  }
  if (!replaced) gallery.push(framed);
  _draft.artistAvatarGallery = aaCapGallery(gallery);
  if (wasProfilePic) {
    _draft.avatar = framed;
    _draft.avatarRemoved = false;
    _draft.avatarUpdatedAt = Date.now();
    _photoSyncPending = framed;
  }
  _artistSyncPending = framed;
  markDirty();
  renderProfileEditPage();
  setMediaSyncUi("artist", "uploading");
  if (wasProfilePic) setMediaSyncUi("photo", "uploading");
  try {
    await persistArtistAvatarNow();
    if (wasProfilePic && _deps?.publishProfileAvatarChange) {
      try {
        const hosted = await _deps.publishProfileAvatarChange(framed, { toast: false });
        if (hosted) {
          _draft.avatar = String(hosted);
          _draft.artistAvatar = String(hosted);
          renderProfileEditPage();
        }
      } catch (photoErr) {
        _photoSyncPending = framed;
        setMediaSyncUi("photo", "error");
        throw photoErr;
      }
    }
    _artistSyncPending = "";
    if (wasProfilePic) _photoSyncPending = "";
    setMediaSyncUi("artist", "done");
    if (wasProfilePic) setMediaSyncUi("photo", "done");
    try { _deps?.showToast?.("Artist Avatar framed ✦", { icon: "✦", durationMs: 1800 }); } catch {}
    return true;
  } catch (e) {
    markDirty();
    _artistSyncPending = framed;
    setMediaSyncUi("artist", "error");
    try { _deps?.showToast?.(e?.message || "Upload failed — tap retry on Artist", { icon: "!", durationMs: 2600 }); } catch {}
    return false;
  }
}

/** Tap the nested Artist ring — create, or Adjust / Manage when one exists. */
/** Tapping the Artist Avatar ring goes straight into the Artist Avatar sheet — no
 *  "Adjust framing / Manage Artist Avatar" picker in between. Both of those already
 *  live as buttons inside that sheet's "manage" screen, so the extra menu was just a
 *  detour to the exact same place. The photo-action-sheet pattern stays reserved for
 *  the actual profile photo tap (openProfilePhotoFlow). */
function openArtistRingFlow() {
  openArtistAvatarEditor();
}

function usernamePreview() {
  const handle = normalizeUsername(_draft?.username);
  if (!handle) return "Choose username";
  const profile = _deps?.getActiveProfile?.() || {};
  const blockedUntil = _deps?.getUsernameCooldownUnlockTime?.(profile) || 0;
  if (blockedUntil > Date.now()) {
    const days = Math.ceil((blockedUntil - Date.now()) / (24 * 60 * 60 * 1000));
    return `@${handle} · ${days}d until next change`;
  }
  return `@${handle}`;
}

function usernameRowLocked() {
  const profile = _deps?.getActiveProfile?.() || {};
  return Boolean(_deps?.isUsernameChangeOnCooldown?.(profile));
}

function renderProfileEditPage() {
  const page = qs('[data-route="profile-edit"]');
  if (!page || !_draft) return;
  const setVal = (id, text, empty = false) => {
    const el = qs(id);
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("profileEditRowValue--empty", empty);
  };
  try {
    const cn = qs("#profileEditCoverName");
    const ch = qs("#profileEditCoverHandle");
    const friendly = normalizeDisplayName(_draft?.displayName);
    const handle = normalizeUsername(_draft?.username);
    if (cn) { cn.textContent = friendly || (handle ? `@${handle}` : "Your name"); }
    if (ch) { ch.textContent = friendly && handle ? `@${handle}` : ""; ch.hidden = !(friendly && handle); }
  } catch {}
  setVal("#profileEditDisplayNameVal", displayNamePreview(), !String(_draft.displayName || "").trim());
  setVal("#profileEditUsernameVal", usernamePreview(), !normalizeUsername(_draft?.username));
  setVal("#profileEditBioVal", bioPreview(), !cleanBio(_draft.bio));
  setVal("#profileEditGenresVal", genresPreview(), !_draft.genres.length);
  setVal("#profileEditPersonaVal", personaPreview(), !_draft.personaId);
  setVal("#profileEditArtistAvatarVal", artistAvatarPreview(), !_draft.artistAvatar);
  SOCIAL_FIELDS.forEach(({ key }) => {
    setVal(`#profileEditSocialVal-${key}`, socialPreview(key), !String(_draft.links?.[key] || "").trim());
  });
  applyAvatarToEditPhoto();
  syncUsernameRowUi();
  syncSaveButton();
}

function syncUsernameRowUi() {
  const row = qs('[data-profile-edit-field="username"]');
  if (!row) return;
  const locked = usernameRowLocked();
  row.classList.toggle("profileEditRow--locked", locked);
  const chev = row.querySelector(".profileEditRowChev");
  if (chev) chev.hidden = locked;
  row.setAttribute("aria-disabled", locked ? "true" : "false");
}

function closeProfileEditSheet() {
  const sheet = qs("#profileEditSheet");
  if (!sheet) return;
  const wasOpen = sheet.classList.contains("isOpen") || !sheet.hidden;
  sheet.hidden = true;
  sheet.classList.remove("isOpen");
  document.body.classList.remove("profileEditSheetOpen");
  if (wasOpen) {
    try { _deps?.unlockSheetScroll?.(); } catch {}
  }
  _activeSheet = "";
  const body = qs("#profileEditSheetBody");
  if (body) body.innerHTML = "";
  const spacer = qs("#profileEditSheetHeadSpacer");
  if (spacer) spacer.innerHTML = "";
}

function openProfileEditSheet(kind, title) {
  const sheet = qs("#profileEditSheet");
  const body = qs("#profileEditSheetBody");
  const titleEl = qs("#profileEditSheetTitle");
  if (!sheet || !body) return;
  const alreadyOpen = sheet.classList.contains("isOpen") && !sheet.hidden;
  _activeSheet = kind;
  if (titleEl) titleEl.textContent = title;
  body.innerHTML = "";
  // Header action icons (Artist Avatar's use-as-pfp/adjust/reset) are per-sheet —
  // never let a previous sheet's icons linger into this one.
  const spacer = qs("#profileEditSheetHeadSpacer");
  if (spacer) spacer.innerHTML = "";
  sheet.hidden = false;
  requestAnimationFrame(() => sheet.classList.add("isOpen"));
  document.body.classList.add("profileEditSheetOpen");
  if (!alreadyOpen) {
    try { _deps?.lockSheetScroll?.(); } catch {}
  }
  return body;
}

function bindSheetDismiss() {
  const sheet = qs("#profileEditSheet");
  if (!sheet || sheet.dataset.boundDismiss === "1") return;
  sheet.dataset.boundDismiss = "1";
  sheet.addEventListener("click", (e) => {
    if (e.target?.closest?.("[data-profile-edit-sheet-dismiss]")) closeProfileEditSheet();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && _activeSheet) closeProfileEditSheet();
  });
}

function openTextEditor({ title, value, placeholder, multiline = false, maxLength = 120, hint = "", onDone }) {
  const body = openProfileEditSheet("text", title);
  if (!body) return;
  const fieldId = "profileEditSheetField";
  const hintText = hint || (multiline ? "Share what makes your music yours." : "This is how others will recognize you.");
  body.innerHTML = `
    <div class="profileEditSheetFieldWrap">
      ${multiline
        ? `<textarea id="${fieldId}" class="profileEditSheetTextarea" maxlength="${maxLength}" placeholder="${escapeHtml(placeholder)}" rows="6">${escapeHtml(value)}</textarea>`
        : `<input id="${fieldId}" class="profileEditSheetInput" type="text" maxlength="${maxLength}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" autocapitalize="sentences" autocomplete="off" spellcheck="false" />`}
      <p class="profileEditSheetHint">${escapeHtml(hintText)}</p>
    </div>
    <div class="profileEditSheetActions">
      <button type="button" class="profileEditSheetDone" data-profile-edit-sheet-done="1">Done</button>
    </div>
  `;
  const field = qs(`#${fieldId}`);
  field?.focus();
  if (field && !multiline) {
    try { field.select(); } catch {}
  }
  body.querySelector("[data-profile-edit-sheet-done]")?.addEventListener("click", () => {
    onDone(String(field?.value || "").trim());
    closeProfileEditSheet();
    renderProfileEditPage();
    markDirty();
    try { _deps?.haptic?.("light"); } catch {}
  });
}

function openDisplayNameEditor() {
  openTextEditor({
    title: "Display name",
    value: normalizeDisplayName(_draft.displayName),
    placeholder: "Samy Naoum",
    maxLength: DISPLAY_NAME_MAX_LENGTH,
    hint: `Up to ${DISPLAY_NAME_MAX_LENGTH} characters · spaces allowed`,
    onDone: (val) => {
      _draft.displayName = normalizeDisplayName(val);
    },
  });
}

function openUsernameEditor() {
  const profile = _deps?.getActiveProfile?.() || {};
  const blockedUntil = _deps?.getUsernameCooldownUnlockTime?.(profile) || 0;
  if (blockedUntil > Date.now()) {
    try {
      _deps?.showToast?.(
        _deps?.formatUsernameCooldownHint?.(blockedUntil) || "Username is locked for now.",
        { icon: "!", durationMs: 3200 },
      );
    } catch {}
    return;
  }
  clearTimeout(_usernameCheckTimer);
  const body = openProfileEditSheet("username", "Username");
  if (!body) return;
  const startVal = normalizeUsername(_draft?.username) || _originalUsername;
  body.innerHTML = `
    <div class="profileEditSheetFieldWrap">
      <div class="profileEditSheetAtWrap">
        <span class="profileEditSheetAt" aria-hidden="true">@</span>
        <input id="profileEditSheetUsernameField" class="profileEditSheetInput profileEditSheetInput--at" type="text" maxlength="${USERNAME_MAX_LENGTH}" value="${escapeHtml(startVal)}" placeholder="yourname" autocapitalize="none" autocomplete="username" spellcheck="false" inputmode="text" aria-label="Username without @ prefix" />
      </div>
      <p class="profileEditSheetHint profileEditSheetHint--note">You can only change your username once every 30 days.</p>
      <p id="profileEditSheetUsernameStatus" class="profileEditSheetHint">Up to ${USERNAME_MAX_LENGTH} characters · letters, numbers, dots, and underscores</p>
    </div>
    <div class="profileEditSheetActions">
      <button type="button" class="profileEditSheetDone" data-profile-edit-sheet-done="1">Done</button>
    </div>
  `;
  const field = qs("#profileEditSheetUsernameField");
  const statusEl = qs("#profileEditSheetUsernameStatus");
  const doneBtn = body.querySelector("[data-profile-edit-sheet-done]");
  field?.focus();
  try { field?.select(); } catch {}

  const setStatus = (mode, text) => {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = `profileEditSheetHint profileEditSheetHint--${mode}`;
    if (doneBtn) {
      doneBtn.disabled = mode === "bad" || mode === "invalid" || mode === "checking";
    }
  };

  const scheduleCheck = (raw) => {
    clearTimeout(_usernameCheckTimer);
    const handle = normalizeUsername(raw);
    if (!handle || handle === "guest") {
      setStatus("invalid", "Enter a valid username.");
      return;
    }
    if (handle === _originalUsername) {
      setStatus("ok", "This is your current username.");
      return;
    }
    setStatus("checking", "Checking availability…");
    _usernameCheckTimer = setTimeout(async () => {
      const ok = await _deps?.checkUsernameAvailable?.(handle, _originalUsername);
      if (ok) setStatus("ok", `@${handle} is available`);
      else setStatus("bad", `@${handle} is already taken`);
    }, 400);
  };

  field?.addEventListener("input", () => scheduleCheck(field.value));
  scheduleCheck(startVal);

  doneBtn?.addEventListener("click", () => {
    if (doneBtn?.disabled) return;
    const handle = normalizeUsername(field?.value);
    if (!handle || handle === "guest") return;
    _draft.username = handle;
    closeProfileEditSheet();
    renderProfileEditPage();
    markDirty();
    try { _deps?.haptic?.("light"); } catch {}
  });
}

function openBioEditor() {
  openTextEditor({
    title: "Bio",
    value: cleanBio(_draft.bio),
    placeholder: "Tell listeners about your music…",
    multiline: true,
    maxLength: 280,
    onDone: (val) => {
      _draft.bio = val.slice(0, 280);
    },
  });
}

function openSocialEditor(key, label) {
  const spec = SOCIAL_FIELDS.find((s) => s.key === key);
  openTextEditor({
    title: label,
    value: String(_draft.links?.[key] || "").trim(),
    placeholder: spec?.placeholder || "https://",
    maxLength: 200,
    onDone: (val) => {
      _draft.links[key] = val.slice(0, 200);
    },
  });
}

function renderGenreChips(container) {
  const selected = new Set(_draft.genres || []);
  container.innerHTML = MUSIC_PREFERENCE_GENRES.map((g) => {
    const on = selected.has(g.label);
    return `<button type="button" class="profileEditGenreChip${on ? " isSelected" : ""}" data-genre-label="${escapeHtml(g.label)}" aria-pressed="${on ? "true" : "false"}">${escapeHtml(g.label)}</button>`;
  }).join("");
  container.querySelectorAll("[data-genre-label]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const label = chip.getAttribute("data-genre-label");
      if (!label) return;
      const set = new Set(_draft.genres || []);
      if (set.has(label)) set.delete(label);
      else set.add(label);
      _draft.genres = Array.from(set);
      renderGenreChips(container);
      markDirty();
      try { _deps?.haptic?.("light"); } catch {}
    });
  });
}

function openGenresEditor() {
  _genresTouched = true;
  const body = openProfileEditSheet("genres", "Music genres");
  if (!body) return;
  body.innerHTML = `
    <p class="profileEditSheetLead">Pick the styles that define your sound. You can choose as many as you like.</p>
    <div class="profileEditGenreGrid" id="profileEditGenreGrid"></div>
    <div class="profileEditSheetActions">
      <button type="button" class="profileEditSheetDone" data-profile-edit-sheet-done="1">Done</button>
    </div>
  `;
  const grid = qs("#profileEditGenreGrid", body);
  if (grid) renderGenreChips(grid);
  body.querySelector("[data-profile-edit-sheet-done]")?.addEventListener("click", () => {
    closeProfileEditSheet();
    renderProfileEditPage();
    try { _deps?.haptic?.("light"); } catch {}
  });
}

function openPersonaEditor() {
  const body = openProfileEditSheet("persona", "Voice persona");
  if (!body) return;
  const list = _deps?.loadPersonas?.() || [];
  const active = String(_draft.personaId || "").trim();
  const rows = [
    `<button type="button" class="profileEditPersonaRow${!active ? " isSelected" : ""}" data-persona-id="">
      <span class="profileEditPersonaRowTitle">Default voice</span>
      <span class="profileEditPersonaRowSub">No saved persona selected</span>
    </button>`,
  ].concat(
    list.map((p) => {
      const id = escapeHtml(String(p.personaId || ""));
      const label = escapeHtml(String(p.label || "Voice"));
      const meta = escapeHtml(String(_deps?.personaTypeLabel?.(p.type) || "Persona"));
      const sel = String(p.personaId) === active;
      return `<button type="button" class="profileEditPersonaRow${sel ? " isSelected" : ""}" data-persona-id="${id}">
        <span class="profileEditPersonaRowTitle">${label}</span>
        <span class="profileEditPersonaRowSub">${meta}</span>
      </button>`;
    })
  );
  body.innerHTML = `
    <p class="profileEditSheetLead">Choose the voice persona used when you create on Nabad.</p>
    <div class="profileEditPersonaList">${rows.join("")}</div>
  `;
  body.querySelectorAll("[data-persona-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      _draft.personaId = btn.getAttribute("data-persona-id") || "";
      markDirty();
      closeProfileEditSheet();
      renderProfileEditPage();
      try { _deps?.haptic?.("light"); } catch {}
    });
  });
}

/* ── Nabad Artist Avatar: manage/switch → consent → upload → generate → pick ── */
const AA_MIN_PHOTOS = 3;
const AA_MAX_PHOTOS = 5;
const AA_COST = 15;
const AA_GALLERY_MAX = 6; // every generated option is kept (not just the chosen one) so you can switch later, capped so the profile row doesn't grow unbounded
let _aaStep = "intro"; // manage | intro | upload | generating | pick | error
let _aaPhotos = [];    // data URLs, compressed
let _aaOptions = [];   // data URLs returned by the server
let _aaChosenIndex = -1;
let _aaConsent = false;
let _aaErrorMessage = "";
let _aaUseAsProfilePic = false; // pending checkbox state carried from "pick" into confirmArtistAvatarChoice

function artistAvatarHasManageableState(draft = _draft) {
  if (!draft) return false;
  if (String(draft.artistAvatar || "").trim()) return true;
  return Array.isArray(draft.artistAvatarGallery) && draft.artistAvatarGallery.length > 0;
}

/** Legacy rows often have `artist_avatar` set but an empty gallery — without this
 *  the editor opens on "Replace…" (intro) instead of manage + Gold ring/crown. */
function syncArtistAvatarDraftGalleryFromActive() {
  if (!_draft) return;
  const active = String(_draft.artistAvatar || "").trim();
  let gallery = Array.isArray(_draft.artistAvatarGallery) ? _draft.artistAvatarGallery.slice() : [];
  if (active && !gallery.includes(active)) gallery.push(active);
  if (!active && gallery.length) {
    _draft.artistAvatar = gallery[gallery.length - 1];
  }
  _draft.artistAvatarGallery = aaCapGallery(gallery);
}

function resetArtistAvatarState() {
  syncArtistAvatarDraftGalleryFromActive();
  _aaStep = artistAvatarHasManageableState() ? "manage" : "intro";
  _aaPhotos = [];
  _aaOptions = [];
  _aaChosenIndex = -1;
  _aaConsent = false;
  _aaErrorMessage = "";
  _aaUseAsProfilePic = false;
}

function aaCapGallery(list) {
  const seen = new Set();
  const out = [];
  for (const src of list || []) {
    if (!src || seen.has(src)) continue;
    seen.add(src);
    out.push(src);
  }
  return out.slice(-AA_GALLERY_MAX);
}

/** Every other row here (bio, genres, persona) only takes effect once the
 *  page-level Save is tapped — that's fine when you're actively looking at
 *  the Save button. It was the wrong call for Artist Avatar specifically:
 *  the generation itself already cost real credits, so "picked one, force-
 *  quit before remembering to tap Save, reopened to the old photo" is a
 *  real loss, not just an unsaved draft. Persist the avatar fields the
 *  moment they change — local write is immediate (survives a force-quit
 *  right away), cloud follows in the background. Never touches any other
 *  in-progress, still-unsaved draft field (bio/genres/etc). */
async function persistArtistAvatarNow() {
  if (!_deps) return;
  const active = _deps.getActiveProfile?.() || {};
  const clearing = Boolean(_draft.clearArtistAvatar) && !String(_draft.artistAvatar || "").trim();
  const next = {
    ...active,
    artistAvatar: clearing ? "" : (_draft.artistAvatar || ""),
    artistAvatarGallery: clearing ? [] : aaCapGallery(_draft.artistAvatarGallery || []),
    artistAvatarConsentedAt: clearing ? 0 : (_draft.artistAvatarConsentedAt || active.artistAvatarConsentedAt || 0),
    artistAvatarUpdatedAt: Date.now(),
    clearArtistAvatar: clearing,
    avatar: _draft.avatar || active.avatar || "",
    avatarUpdatedAt:
      String(_draft.avatar || "") !== String(active.avatar || "")
        ? Date.now()
        : Number(active.avatarUpdatedAt || 0),
    clearAvatar: Boolean(_draft.avatarRemoved) && !String(_draft.avatar || "").trim(),
  };
  try { _deps.saveProfile(next); } catch {}
  try { _deps.syncProfileUi?.(next); } catch {}
  try {
    let toCloud = next;
    const av = String(next.avatar || "").trim();
    if ((av.startsWith("data:") || av.startsWith("blob:")) && _deps.hostProfileAvatarUrl) {
      const hosted = await _deps.hostProfileAvatarUrl(av);
      toCloud = { ...toCloud, avatar: hosted, avatarUpdatedAt: Date.now() };
      _draft.avatar = hosted;
    }
    // Host the active Artist Avatar so the profile flip cover stays sharp
    // (local snaps used to shrink it to ~320px and the maximised flip looked soft).
    const aa = String(toCloud.artistAvatar || "").trim();
    if (!clearing && (aa.startsWith("data:") || aa.startsWith("blob:")) && _deps.hostArtistAvatarUrl) {
      const hostedAa = await _deps.hostArtistAvatarUrl(aa, "active");
      const gallery = aaCapGallery(
        (toCloud.artistAvatarGallery || []).map((s) => (s === aa ? hostedAa : s)),
      );
      if (!gallery.includes(hostedAa)) gallery.push(hostedAa);
      toCloud = {
        ...toCloud,
        artistAvatar: hostedAa,
        artistAvatarGallery: gallery,
        artistAvatarUpdatedAt: Date.now(),
      };
      _draft.artistAvatar = hostedAa;
      _draft.artistAvatarGallery = gallery;
      if (_draft.avatar === aa) _draft.avatar = hostedAa;
    }
    try { _deps.saveProfile(toCloud); } catch {}
    try { _deps.syncProfileUi?.(toCloud); } catch {}
    await _deps.supabaseUpsertProfile(toCloud);
  } catch (e) {
    try {
      _deps?.showToast?.("Saved on this phone — will sync once your connection is back", { durationMs: 3000 });
    } catch {}
  }
}

/** Merged hero-preview + options-grid carousel: swipe (or tap a peeking neighbor)
 *  to make a generated option active. Only touches classes/dots on scroll-settle —
 *  never a full re-render mid-gesture, or the rail would rebuild under your thumb
 *  and cancel its own scroll-snap animation. */
/** "Use as profile photo", "Adjust framing", and "Reset" used to be a checkbox and two
 *  full-width buttons stacked under the Gold style card — a lot of vertical space for
 *  three actions someone reaches for occasionally, not every visit. Moved into three
 *  small icon buttons in the sheet's own header instead, next to the title. Rebuilt on
 *  every "manage" render so the profile-photo toggle's active state stays in sync. */
function renderArtistAvatarHeaderActions() {
  const spacer = qs("#profileEditSheetHeadSpacer");
  if (!spacer) return;
  const isProfilePic = Boolean(_draft.artistAvatar) && _draft.avatar === _draft.artistAvatar;
  spacer.innerHTML = `
    <button type="button" id="aaHdrProfilePic" class="aaHeaderIconBtn${isProfilePic ? " isActive" : ""}" aria-pressed="${isProfilePic ? "true" : "false"}" aria-label="Use as my profile photo">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    </button>
    <button type="button" id="aaHdrAdjust" class="aaHeaderIconBtn" aria-label="Adjust framing">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/></svg>
    </button>
    <button type="button" id="aaHdrReset" class="aaHeaderIconBtn aaHeaderIconBtn--danger" aria-label="Reset Artist Avatar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
    </button>
  `;
  qs("#aaHdrProfilePic", spacer)?.addEventListener("click", () => {
    try { _deps?.haptic?.("light"); } catch {}
    const turningOn = !(Boolean(_draft.artistAvatar) && _draft.avatar === _draft.artistAvatar);
    setArtistAvatarAsProfilePic(turningOn);
    renderProfileEditPage();
    renderArtistAvatarHeaderActions();
    try {
      _deps?.showToast?.(turningOn ? "Using as your profile photo" : "Restored your real photo", { durationMs: 1800 });
    } catch {}
  });
  qs("#aaHdrAdjust", spacer)?.addEventListener("click", () => {
    try { _deps?.haptic?.("light"); } catch {}
    void adjustArtistAvatarFraming().then((ok) => {
      if (ok) renderArtistAvatarStep();
    });
  });
  qs("#aaHdrReset", spacer)?.addEventListener("click", () => {
    try { _deps?.haptic?.("light"); } catch {}
    void resetArtistAvatarCompletely();
  });
}

function wireArtistAvatarCarousel(body, gallery, activeIndex) {
  const rail = qs("#aaCarousel", body);
  if (!rail || !gallery.length) return;
  const items = Array.from(rail.querySelectorAll(".aaCarouselItem"));
  const dots = Array.from(qs("#aaCarouselDots", body)?.querySelectorAll(".aaDot") || []);
  let current = activeIndex;

  const setActiveVisual = (i) => {
    items.forEach((el, idx) => el.classList.toggle("isActive", idx === i));
    dots.forEach((el, idx) => el.classList.toggle("isActive", idx === i));
  };

  const scrollToIndex = (i, behavior) => {
    const target = items[i];
    if (!target) return;
    rail.scrollTo({ left: target.offsetLeft - (rail.clientWidth - target.clientWidth) / 2, behavior });
  };
  // Land on today's active avatar with no animation on first paint.
  requestAnimationFrame(() => scrollToIndex(activeIndex, "auto"));

  const nearestIndex = () => {
    const railCenter = rail.scrollLeft + rail.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    items.forEach((el, idx) => {
      const c = el.offsetLeft + el.clientWidth / 2;
      const d = Math.abs(c - railCenter);
      if (d < bestDist) { bestDist = d; best = idx; }
    });
    return best;
  };

  let settleTimer = 0;
  rail.addEventListener("scroll", () => {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      const i = nearestIndex();
      if (i === current) return;
      current = i;
      setActiveVisual(i);
      try { _deps?.haptic?.("light"); } catch {}
      switchActiveArtistAvatar(gallery[i]);
      try { renderProfileEditPage(); } catch {}
    }, 130);
  }, { passive: true });

  items.forEach((el, i) => {
    el.addEventListener("click", () => {
      if (i === current) return;
      scrollToIndex(i, "smooth");
    });
  });
}

/** Switch which generated portrait is "active" (shows on the profile flip) — free,
 *  no regeneration. If the previous active one was also standing in as the profile
 *  picture, the new one takes over that role too, so the two stay in sync. */
function switchActiveArtistAvatar(src) {
  if (!src) return;
  const wasProfilePic = Boolean(_draft.artistAvatar) && _draft.avatar === _draft.artistAvatar;
  _draft.artistAvatar = src;
  _draft.clearArtistAvatar = false;
  if (wasProfilePic) _draft.avatar = src;
  markDirty();
  void persistArtistAvatarNow();
}

/** Promote/demote the active Artist Avatar to be `avatar` itself — the photo that
 *  shows everywhere (tab bar, DMs, comments), not just the cover flip. Keeps a
 *  one-level backup of the real photo so turning it back off restores it instead
 *  of losing it. */
function setArtistAvatarAsProfilePic(on) {
  if (!_draft.artistAvatar) return;
  if (on) {
    if (_draft.avatar !== _draft.artistAvatar) {
      _draft.artistAvatarPrevAvatar = _draft.avatar || _draft.artistAvatarPrevAvatar || "";
      _draft.avatar = _draft.artistAvatar;
      _draft.avatarRemoved = false;
      _draft.avatarUpdatedAt = Date.now();
    }
  } else if (_draft.avatar === _draft.artistAvatar) {
    const restored = String(_draft.artistAvatarPrevAvatar || "").trim();
    _draft.avatar = restored;
    if (!restored) {
      _draft.avatarRemoved = true;
      _draft.avatarUpdatedAt = Date.now();
    } else {
      _draft.avatarRemoved = false;
      _draft.avatarUpdatedAt = Date.now();
    }
  }
  markDirty();
  void persistArtistAvatarNow();
}

/** Wipe the Artist Avatar (active + gallery + consent). If it was also the
 *  everywhere profile photo, restore the previous real photo (or clear it).
 *  Persists immediately — same reason generation does: force-quit before Save
 *  must not resurrect a deleted portrait from the cloud snap. */
async function resetArtistAvatarCompletely() {
  if (!_draft?.artistAvatar && !(Array.isArray(_draft?.artistAvatarGallery) && _draft.artistAvatarGallery.length)) {
    return;
  }
  const ok = typeof confirm === "function"
    ? confirm("Reset your Artist Avatar? Your generated portraits will be removed. You can create a new one anytime.")
    : true;
  if (!ok) return;

  if (_draft.artistAvatar && _draft.avatar === _draft.artistAvatar) {
    const restored = String(_draft.artistAvatarPrevAvatar || "").trim();
    _draft.avatar = restored;
    if (!restored) {
      _draft.avatarRemoved = true;
      _draft.avatarUpdatedAt = Date.now();
    } else {
      _draft.avatarRemoved = false;
      _draft.avatarUpdatedAt = Date.now();
    }
  }
  _draft.artistAvatar = "";
  _draft.artistAvatarGallery = [];
  _draft.artistAvatarConsentedAt = 0;
  _draft.artistAvatarPrevAvatar = "";
  _draft.clearArtistAvatar = true;
  resetArtistAvatarState();
  markDirty();
  await persistArtistAvatarNow();
  _draft.clearArtistAvatar = false;
  closeProfileEditSheet();
  renderProfileEditPage();
  try { _deps?.haptic?.("medium"); } catch {}
  try { _deps?.showToast?.("Artist Avatar reset", { durationMs: 2000 }); } catch {}
}

/** Centre-crop `src` inward by ~`zoom`x and return a square PNG data URL (falls back to the original on any failure). */
async function aaTrimEdges(src, zoom = 1.12, size = 1280) {
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("load"));
      im.src = src;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) return src;
    const crop = side / zoom;
    const sx = (img.naturalWidth - crop) / 2;
    const sy = (img.naturalHeight - crop) / 2;
    const out = Math.min(size, Math.round(crop));
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, crop, crop, 0, 0, out, out);
    return canvas.toDataURL("image/png");
  } catch {
    return src;
  }
}

function aaThumbGridHtml() {
  const thumbs = _aaPhotos.map((src, i) => `
    <div class="aaThumb" style="background-image:url('${src}')">
      <button type="button" class="aaThumbRemove" data-aa-remove="${i}" aria-label="Remove photo">✕</button>
    </div>`).join("");
  const canAddMore = _aaPhotos.length < AA_MAX_PHOTOS;
  const addTile = canAddMore ? `<button type="button" class="aaThumbAdd" id="aaAddTile" aria-label="Add photo">+</button>` : "";
  return thumbs + addTile;
}

function renderArtistAvatarStep() {
  const body = qs("#profileEditSheetBody");
  if (!body) return;
  // Header icon actions only make sense once there's an avatar to act on — cleared by
  // default, and only the "manage" branch below repopulates them.
  const headerSpacer = qs("#profileEditSheetHeadSpacer");
  if (headerSpacer && _aaStep !== "manage") headerSpacer.innerHTML = "";

  if (_aaStep === "manage") {
    const gallery = aaCapGallery(_draft.artistAvatarGallery);
    const isProfilePic = Boolean(_draft.artistAvatar) && _draft.avatar === _draft.artistAvatar;
    const active = String(_draft.artistAvatar || gallery[gallery.length - 1] || "").trim();
    let activeIndex = gallery.indexOf(active);
    if (activeIndex < 0) activeIndex = Math.max(0, gallery.length - 1);
    const showGold = goldCanEdit();
    const style = _draft.goldStyle || { ring: "", topper: "" };
    // Hero preview and the "pick one" grid used to be two separate things — a static
    // photo up top, then tap a small thumbnail below to change it. Merged into one
    // swipeable rail instead: every generated option shown full-size, live inside the
    // real Gold ring, so trying one on IS looking at it, not judging a tiny square.
    const items = gallery.map((src, i) => `
      <div class="aaCarouselItem${i === activeIndex ? " isActive" : ""}" data-aa-switch="${i}">
        <div class="aaCarouselRing" data-aa-ring="1">
          <div class="aaCarouselPhoto" style="background-image:url('${src}')"></div>
        </div>
      </div>
    `).join("");
    const dots = gallery.map((_, i) => `<span class="aaDot${i === activeIndex ? " isActive" : ""}"></span>`).join("");
    body.innerHTML = `
      <div class="aaCarouselWrap">
        <div class="aaCarousel" id="aaCarousel">${items}</div>
        <div class="aaCarouselDots" id="aaCarouselDots">${dots}</div>
        <div class="aaHeroCaption">Your Artist Avatar</div>
        ${gallery.length > 1 ? `<div class="aaCarouselHint">← swipe to try your other options →</div>` : ""}
      </div>
      ${showGold ? aaGoldBlockHtml(style) : ""}
      <button type="button" id="aaGenerateMoreBtn" class="aaPrimaryBtn">Generate new photos · ${AA_COST} credits</button>
    `;
    try {
      body.querySelectorAll("[data-aa-ring]").forEach((ring) => applyGoldToAvatarWrap(ring, _draft.goldStyle || null));
      applyGoldNameGradient(qs("#aaNamePreview", body), _draft.goldStyle || null);
    } catch {}
    renderArtistAvatarHeaderActions();
    wireArtistAvatarCarousel(body, gallery, activeIndex);
    if (showGold) {
      let cur = { ring: style.ring || "", topper: style.topper || "", nameGradient: style.nameGradient || "" };
      qs("#aaFrameRow", body)?.addEventListener("click", (e) => {
        const btn = e.target?.closest?.("[data-aa-frame]");
        if (!btn) return;
        try { _deps?.haptic?.("light"); } catch {}
        cur = { ...cur, ring: String(btn.getAttribute("data-aa-frame") || "") };
        try { qs("#aaGoldBlock", body)?.style.setProperty("--aa-emblem", goldRingAccent(cur.ring)); } catch {}
        body.querySelectorAll("[data-aa-frame]").forEach((b) => {
          b.setAttribute("aria-checked", b === btn ? "true" : "false");
        });
        goldStyleChanged(cur);
      });
      qs("#aaTopperRow", body)?.addEventListener("click", (e) => {
        const btn = e.target?.closest?.("[data-aa-topper]");
        if (!btn) return;
        try { _deps?.haptic?.("light"); } catch {}
        cur = { ...cur, topper: String(btn.getAttribute("data-aa-topper") || "") };
        body.querySelectorAll("[data-aa-topper]").forEach((b) => {
          b.setAttribute("aria-checked", b === btn ? "true" : "false");
        });
        goldStyleChanged(cur);
      });
      qs("#aaNameGradientRow", body)?.addEventListener("click", (e) => {
        const btn = e.target?.closest?.("[data-aa-name-gradient]");
        if (!btn) return;
        try { _deps?.haptic?.("light"); } catch {}
        cur = { ...cur, nameGradient: String(btn.getAttribute("data-aa-name-gradient") || "") };
        body.querySelectorAll("[data-aa-name-gradient]").forEach((b) => {
          b.setAttribute("aria-checked", b === btn ? "true" : "false");
        });
        goldStyleChanged(cur);
      });
    }
    qs("#aaGenerateMoreBtn", body)?.addEventListener("click", () => {
      _aaStep = "intro";
      _aaPhotos = [];
      _aaConsent = false;
      renderArtistAvatarStep();
    });
    return;
  }

  if (_aaStep === "intro") {
    const replacing = Boolean(_draft.artistAvatar);
    body.innerHTML = `
      <div class="aaStepKick">NABAD ARTIST AVATAR</div>
      <h2 class="aaStepTitle">${replacing ? "Replace your Artist Avatar" : "Your music, your face,<br />one house style"}</h2>
      <p class="aaStepBody">Upload 3–5 clear photos of your face. Nabad generates three stylized portrait options in one consistent look — pick your favorite and it becomes your Artist Avatar, ready to flip to on your profile.</p>
      <label class="aaConsentRow" for="aaConsentCheck">
        <input type="checkbox" id="aaConsentCheck" ${_aaConsent ? "checked" : ""} />
        <span>I consent to Nabad using these photos only to generate my Artist Avatar. Photos aren't shared or shown publicly.</span>
      </label>
      <button type="button" id="aaChoosePhotosBtn" class="aaPrimaryBtn" ${_aaConsent ? "" : "disabled"}>${replacing ? "Choose new photos" : "Choose photos"}</button>
      <input type="file" id="aaPhotoInput" accept="image/*" multiple hidden />
    `;
    qs("#aaConsentCheck", body)?.addEventListener("change", (e) => {
      _aaConsent = Boolean(e.target.checked);
      const btn = qs("#aaChoosePhotosBtn", body);
      if (btn) btn.disabled = !_aaConsent;
    });
    qs("#aaChoosePhotosBtn", body)?.addEventListener("click", () => {
      qs("#aaPhotoInput", body)?.click();
    });
    qs("#aaPhotoInput", body)?.addEventListener("change", (e) => onArtistAvatarFilesChosen(e.target.files));
    return;
  }

  if (_aaStep === "upload") {
    const ready = _aaPhotos.length >= AA_MIN_PHOTOS && _aaPhotos.length <= AA_MAX_PHOTOS;
    body.innerHTML = `
      <div class="aaStepKick">YOUR PHOTOS</div>
      <p class="aaStepBody">Add ${AA_MIN_PHOTOS}–${AA_MAX_PHOTOS} clear photos — different angles help. (${_aaPhotos.length}/${AA_MAX_PHOTOS})</p>
      <div class="aaThumbGrid" id="aaThumbGrid">${aaThumbGridHtml()}</div>
      <input type="file" id="aaPhotoInput" accept="image/*" multiple hidden />
      <button type="button" id="aaGenerateBtn" class="aaPrimaryBtn" ${ready ? "" : "disabled"}>Generate my Avatar · ${AA_COST} credits</button>
    `;
    qs("#aaAddTile", body)?.addEventListener("click", () => qs("#aaPhotoInput", body)?.click());
    qs("#aaPhotoInput", body)?.addEventListener("change", (e) => onArtistAvatarFilesChosen(e.target.files));
    body.querySelectorAll("[data-aa-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-aa-remove"));
        _aaPhotos.splice(i, 1);
        renderArtistAvatarStep();
      });
    });
    qs("#aaGenerateBtn", body)?.addEventListener("click", () => void startArtistAvatarGeneration());
    return;
  }

  if (_aaStep === "generating") {
    body.innerHTML = `
      <div class="aaStep--generating">
        <div class="aaSpinner" aria-hidden="true"></div>
        <p class="aaStepBody">Creating your Nabad Artist Avatar…</p>
      </div>
    `;
    return;
  }

  if (_aaStep === "pick") {
    const options = _aaOptions.map((src, i) => `
      <button type="button" class="aaOption${i === _aaChosenIndex ? " isChosen" : ""}" style="background-image:url('${src}')" data-aa-pick="${i}" aria-label="Option ${i + 1}"></button>
    `).join("");
    body.innerHTML = `
      <div class="aaStepKick">PICK ONE</div>
      <p class="aaStepBody">All ${_aaOptions.length} are saved — you can switch between them later. Choose one to make active now.</p>
      <div class="aaOptionsGrid" id="aaOptionsGrid">${options}</div>
      <label class="aaConsentRow" for="aaUseAsProfileCheckPick">
        <input type="checkbox" id="aaUseAsProfileCheckPick" ${_aaUseAsProfilePic ? "checked" : ""} />
        <span>Use as my profile photo too</span>
      </label>
      <button type="button" id="aaUseChosenBtn" class="aaPrimaryBtn" ${_aaChosenIndex >= 0 ? "" : "disabled"}>Use this one</button>
      <button type="button" id="aaRegenBtn" class="aaSecondaryBtn">Try different photos</button>
    `;
    body.querySelectorAll("[data-aa-pick]").forEach((btn) => {
      btn.addEventListener("click", () => {
        _aaChosenIndex = Number(btn.getAttribute("data-aa-pick"));
        try { _deps?.haptic?.("light"); } catch {}
        renderArtistAvatarStep();
      });
    });
    qs("#aaUseAsProfileCheckPick", body)?.addEventListener("change", (e) => {
      _aaUseAsProfilePic = Boolean(e.target.checked);
    });
    qs("#aaUseChosenBtn", body)?.addEventListener("click", () => void confirmArtistAvatarChoice());
    qs("#aaRegenBtn", body)?.addEventListener("click", () => {
      _aaStep = "upload";
      _aaPhotos = [];
      _aaOptions = [];
      _aaChosenIndex = -1;
      renderArtistAvatarStep();
    });
    return;
  }

  if (_aaStep === "error") {
    body.innerHTML = `
      <p class="aaStepBody">${escapeHtml(_aaErrorMessage || "Something went wrong — try again.")}</p>
      <button type="button" id="aaErrorRetryBtn" class="aaPrimaryBtn">Try again</button>
    `;
    qs("#aaErrorRetryBtn", body)?.addEventListener("click", () => {
      _aaStep = "upload";
      renderArtistAvatarStep();
    });
    return;
  }
}

async function onArtistAvatarFilesChosen(fileList) {
  const files = Array.from(fileList || []).slice(0, AA_MAX_PHOTOS - _aaPhotos.length);
  if (!files.length) return;
  for (const f of files) {
    try {
      const dataUrl = await _deps.compressAvatarFile(f, { maxSize: 768, quality: 0.85 });
      if (dataUrl) _aaPhotos.push(dataUrl);
    } catch {}
  }
  _aaStep = "upload";
  renderArtistAvatarStep();
}

async function startArtistAvatarGeneration() {
  if (_aaPhotos.length < AA_MIN_PHOTOS) return;
  _aaStep = "generating";
  renderArtistAvatarStep();
  try {
    const token = _deps?.getAuthToken?.();
    const r = await fetch(_deps.apiUrl("/api/music/artist-avatar-generate"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ consent: true, photos: _aaPhotos.slice(0, AA_MAX_PHOTOS) }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 402 || d?.code === "insufficient_credits") {
      const need = Number(d?.needed ?? AA_COST);
      const have = Number(d?.balance || 0);
      try { _deps?.showOutOfCreditsPrompt?.({ needed: need, balance: have }); } catch {}
      _aaStep = "upload";
      renderArtistAvatarStep();
      return;
    }
    if (r.status === 401) {
      _aaErrorMessage = "Sign in to create your Artist Avatar.";
      _aaStep = "error";
      renderArtistAvatarStep();
      return;
    }
    if (!r.ok || !d?.ok || !Array.isArray(d?.options) || !d.options.length) {
      _aaErrorMessage = d?.error === "not_enough_photos"
        ? `Add at least ${AA_MIN_PHOTOS} clear photos of your face.`
        : "Couldn't generate your avatar this time — try again.";
      _aaStep = "error";
      renderArtistAvatarStep();
      return;
    }
    if (Number.isFinite(Number(d?.balance)) && _deps?.setCreditsBalance) {
      try { _deps.setCreditsBalance(Number(d.balance)); } catch {}
    }
    // The generator leaves a faint rim/glow arc near the edges that shows up as an "inner circle"
    // once the portrait is clipped round. Trim the outer margin off every option up front, so
    // every avatar (picked now or switched to later) is clean without needing a manual re-frame.
    d.options = await Promise.all(d.options.map((o) => aaTrimEdges(o)));
    _aaOptions = d.options;
    _aaChosenIndex = -1;
    _aaUseAsProfilePic = false;
    // Save all generated options, not just whichever gets picked — "switch between
    // them later" only works if the ones not chosen right now aren't thrown away.
    _draft.artistAvatarGallery = aaCapGallery([...(_draft.artistAvatarGallery || []), ...d.options]);
    _draft.clearArtistAvatar = false;
    markDirty();
    // These already cost real credits — persist the gallery right away so a
    // force-quit before tapping "Use this one" doesn't throw the batch away.
    void persistArtistAvatarNow();
    _aaStep = "pick";
    renderArtistAvatarStep();
  } catch (e) {
    _aaErrorMessage = "Network hiccup — try again.";
    _aaStep = "error";
    renderArtistAvatarStep();
  }
}

async function confirmArtistAvatarChoice() {
  if (_aaChosenIndex < 0 || !_aaOptions[_aaChosenIndex]) return;
  const chosen = _aaOptions[_aaChosenIndex];
  // Frame for the circular ring before saving — same tool as profile photo.
  const res = await openPhotoFrame({
    src: chosen,
    title: "Frame Artist Avatar",
    doneLabel: "Use photo",
    mode: "circle",
    guideLabel: "Artist ring preview",
  });
  if (!res?.avatar) return; // cancelled — stay on pick
  const framed = res.avatar;
  _aaOptions[_aaChosenIndex] = framed;
  _draft.artistAvatar = framed;
  _draft.artistAvatarConsentedAt = _draft.artistAvatarConsentedAt || Date.now();
  _draft.clearArtistAvatar = false;
  _draft.artistAvatarGallery = aaCapGallery(
    (_draft.artistAvatarGallery || []).map((s) => (s === chosen ? framed : s)),
  );
  if (_aaUseAsProfilePic) setArtistAvatarAsProfilePic(true);
  markDirty();
  void persistArtistAvatarNow();
  closeProfileEditSheet();
  renderProfileEditPage();
  try { _deps?.haptic?.("medium"); } catch {}
  try { _deps?.showToast?.("Artist Avatar saved ✦", { icon: "✦", durationMs: 2200 }); } catch {}
}

function openArtistAvatarEditor() {
  resetArtistAvatarState();
  const body = openProfileEditSheet("artist-avatar", "Artist Avatar");
  if (!body) return;
  renderArtistAvatarStep();
}

export async function saveProfileEditDraft({ navigateBack = true } = {}) {
  if (!_draft || !_deps) return false;
  const base = _deps.getActiveProfile();
  const next = profileFromDraft(base);
  const nextHandle = normalizeUsername(next.username);
  const prevHandle = normalizeUsername(_originalUsername || base.username);
  if (nextHandle && nextHandle !== prevHandle) {
    const blockedUntil = _deps?.getUsernameChangeBlockedUntil?.(base, nextHandle) || 0;
    if (blockedUntil > Date.now()) {
      try {
        _deps.showToast?.(
          _deps?.formatUsernameCooldownHint?.(blockedUntil) || "Username is locked for now.",
          { icon: "!", durationMs: 3200 },
        );
      } catch {}
      return false;
    }
  }
  // Only ask the server when the handle actually changed (an unchanged one is already yours).
  if (nextHandle && nextHandle !== "guest" && nextHandle !== prevHandle) {
    const available = await _deps.checkUsernameAvailable?.(nextHandle, _originalUsername || normalizeUsername(base.username));
    if (!available) {
      try {
        _deps.showToast?.(`@${nextHandle} is already taken`, { icon: "!", durationMs: 2800 });
      } catch {}
      return false;
    }
  }
  const email = String(_deps.getAuthSession?.()?.user?.email || base.email || "").trim().toLowerCase();
  const authId = String(_deps.getAuthSession?.()?.user?.id || "").trim();
  const id = authId || String(base.id || "").trim() || (email ? email : `user:${next.username}`);
  const usernameWillChange =
    nextHandle &&
    nextHandle !== prevHandle &&
    !(_deps?.isPlaceholderUsername?.(nextHandle));
  const payload = {
    ...base,
    ...next,
    displayName: normalizeDisplayName(next.displayName),
    id,
    email,
    usernameChangedAt: Number(base.usernameChangedAt || 0),
    voiceTimbre: base.voiceTimbre || "",
    isPublic: base.isPublic !== false,
    clearAvatar: Boolean(_draft.avatarRemoved) && !String(_draft.avatar || "").trim(),
    clearArtistAvatar: Boolean(_draft.clearArtistAvatar) && !String(next.artistAvatar || "").trim(),
  };
  if (payload.clearAvatar) {
    payload.avatar = "";
    payload.avatarUpdatedAt = Date.now();
  }
  if (payload.clearArtistAvatar) {
    payload.artistAvatar = "";
    payload.artistAvatarGallery = [];
    payload.artistAvatarConsentedAt = 0;
    payload.artistAvatarUpdatedAt = Date.now();
  }
  if (String(payload.avatar || "").startsWith("data:") || String(payload.avatar || "").startsWith("blob:")) {
    payload.avatarUpdatedAt = Date.now();
  } else if (payload.clearAvatar) {
    // already cleared above
  } else if (String(payload.avatar || "").trim() && String(payload.avatar || "").trim() !== String(base.avatar || "").trim()) {
    payload.avatarUpdatedAt = Date.now();
  } else {
    payload.avatarUpdatedAt = Number(base.avatarUpdatedAt || 0);
  }
  showProfileEditBusy("Saving profile…");
  const saveBtn = qs("#btnProfileEditPageSave");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.setAttribute("aria-disabled", "true");
    saveBtn.textContent = "Saving…";
  }
  try {
    _deps.saveProfile(payload);
    const uid = String(_deps.getAuthSession?.()?.user?.id || payload.id || "").trim();
    if (uid && parseMusicPreferencesFromProfile(payload).length) {
      try { markMusicPreferencesComplete(uid); } catch {}
    }
    if (_draft.personaId !== (_deps.loadPersonaSelection?.() || "")) {
      _deps.savePersonaSelection?.(_draft.personaId || "");
      if (_deps.els?.sunoPersonaId) {
        _deps.els.sunoPersonaId.value = _draft.personaId || "";
      }
    }
    _deps.syncProfileUi?.(payload);

    let toCloud = payload;
    const av = String(payload.avatar || "").trim();
    if ((av.startsWith("data:") || av.startsWith("blob:")) && _deps.hostProfileAvatarUrl) {
      const hosted = await _deps.hostProfileAvatarUrl(av);
      toCloud = { ...payload, avatar: hosted, avatarUpdatedAt: Date.now() };
      try { _deps.saveProfile(toCloud); } catch {}
      try { _deps.syncProfileUi?.(toCloud); } catch {}
    }
    try {
      await _deps.supabaseUpsertProfile(toCloud);
      if (usernameWillChange) {
        toCloud = { ...toCloud, usernameChangedAt: Date.now() };
        _deps.saveProfile(toCloud);
        try { await _deps.supabaseUpsertProfile(toCloud); } catch {}
      }
    } catch (err) {
      _deps.setStatus?.(`Saved locally. Cloud sync skipped: ${err?.message || String(err)}`);
      try { _deps.scheduleProfileCloudSync?.({ delayMs: 3000 }); } catch {}
      try { _deps.showToast?.("Saved on this device — syncing when the connection is back.", { durationMs: 3200 }); } catch {}
    }

    try { await commitGoldStyleFromDraft(); } catch {}
    _dirty = false;
    syncSaveButton();
    try { _deps.showToast?.("Profile saved.", { icon: "✓", durationMs: 2000 }); } catch {}
    if (navigateBack) {
      try { location.hash = "#/profile"; } catch {}
      try { _deps.applyRoute?.(); } catch {}
    }
    return true;
  } finally {
    hideProfileEditBusy();
    if (saveBtn) {
      saveBtn.textContent = "Save";
      syncSaveButton();
    }
  }
}

export function onProfileEditRouteActive() {
  hydrateProfileEditDraft(_deps?.getActiveProfile?.());
}

export function initProfileEditOnce(deps) {
  if (_inited) return;
  _deps = deps;
  _inited = true;
  bindSheetDismiss();
  bindPhotoActionSheetOnce();
  bindMediaSyncRetryOnce();

  const page = qs('[data-route="profile-edit"]');
  if (!page || page.dataset.boundProfileEdit === "1") return;
  page.dataset.boundProfileEdit = "1";

  qs("#btnProfileEditPageSave")?.addEventListener("click", async () => {
    if (!_dirty) return;
    try { _deps?.haptic?.("medium"); } catch {}
    await saveProfileEditDraft({ navigateBack: true });
  });

  qs("#profileEditAvatarWrap")?.addEventListener("click", (e) => {
    e.preventDefault();
    try { _deps?.haptic?.("light"); } catch {}
    openProfilePhotoFlow();
  });

  qs("#profileEditArtistRing")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    try { _deps?.haptic?.("light"); } catch {}
    openArtistRingFlow();
  });

  page.addEventListener("click", (e) => {
    const row = e.target?.closest?.("[data-profile-edit-field]");
    if (!row) return;
    e.preventDefault();
    const field = row.getAttribute("data-profile-edit-field");
    try { _deps?.haptic?.("light"); } catch {}
    if (field === "displayName") openDisplayNameEditor();
    else if (field === "username") openUsernameEditor();
    else if (field === "bio") openBioEditor();
    else if (field === "genres") openGenresEditor();
    else if (field === "persona") openPersonaEditor();
    else if (field === "artist-avatar") openArtistAvatarEditor();
    else if (field?.startsWith("social:")) openSocialEditor(field.slice(7), row.querySelector(".profileEditRowLabel")?.textContent || "Link");
  });

  const avatarInput = qs("#profileAvatarFile");
  if (avatarInput && avatarInput.dataset.profileEditBound !== "1") {
    avatarInput.dataset.profileEditBound = "1";
    avatarInput.addEventListener("change", async () => {
      const f = avatarInput.files?.[0];
      await onAvatarFileChange(f);
      try { avatarInput.value = ""; } catch {}
      try { avatarInput.removeAttribute("capture"); } catch {}
    });
  }
}

export function openProfileEditPage() {
  try { location.hash = "#/profile-edit"; } catch {}
  try { _deps?.applyRoute?.(); } catch {}
}

/** Entry point for the "Create your Artist Avatar" promo banner on the main
 *  profile page — jumps straight to Edit Profile AND pops the Artist Avatar
 *  editor open, instead of making someone land on the list and hunt for the
 *  row themselves. applyRoute() hydrates the draft synchronously (see
 *  onProfileEditRouteActive), so it's already ready by the time we open it. */
export function openArtistAvatarEditorFromProfile() {
  // applyRoute() is scheduled via requestAnimationFrame (see scheduleApplyRoute
  // in app.js) — it would hydrate the draft too late for the sheet we're about
  // to open. initProfileEditOnce() already ran at boot (module-level init, not
  // route-gated) so the sheet's DOM and dismiss handlers are ready regardless;
  // hydrate the draft ourselves right now instead of waiting on that pipeline.
  hydrateProfileEditDraft(_deps?.getActiveProfile?.());
  openProfileEditPage();
  openArtistAvatarEditor();
}
