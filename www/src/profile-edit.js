/**
 * Edit Profile — dedicated creator workspace (not Settings).
 */

import { openPhotoFrame } from "./photo-frame.js";
import { MUSIC_PREFERENCE_GENRES, parseMusicPreferencesFromProfile, markMusicPreferencesComplete, profileMusicStylesDisplaySlice } from "./music-preferences.js";
import { USERNAME_MAX_LENGTH, DISPLAY_NAME_MAX_LENGTH } from "./profile-limits.js";

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
    avatar: String(_draft.avatar || base.avatar || "").trim(),
    genres: genreLabels.join(","),
    links: {
      instagram: String(_draft.links?.instagram || "").trim(),
      tiktok: String(_draft.links?.tiktok || "").trim(),
      youtube: String(_draft.links?.youtube || "").trim(),
      spotify: String(_draft.links?.spotify || "").trim(),
    },
    artistAvatar: String(_draft.artistAvatar || base.artistAvatar || "").trim(),
    artistAvatarUpdatedAt: _draft.artistAvatar && _draft.artistAvatar !== base.artistAvatar
      ? Date.now()
      : Number(base.artistAvatarUpdatedAt || 0),
    artistAvatarConsentedAt: _draft.artistAvatarConsentedAt || Number(base.artistAvatarConsentedAt || 0),
    artistAvatarGallery: (Array.isArray(_draft.artistAvatarGallery) && _draft.artistAvatarGallery.length
      ? _draft.artistAvatarGallery
      : (Array.isArray(base.artistAvatarGallery) ? base.artistAvatarGallery : [])
    ).slice(-AA_GALLERY_MAX),
  };
}

export function hydrateProfileEditDraft(profile) {
  const p = profile || _deps?.getActiveProfile?.() || {};
  const genres = parseMusicPreferencesFromProfile(p);
  const personaId =
    String(_deps?.loadPersonaSelection?.() || "").trim() ||
    String(_deps?.getActivePersonaId?.() || "").trim();
  _photoFrameSrc = "";
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
  };
  _dirty = false;
  _genresTouched = false;
  _originalUsername = normalizeUsername(_draft.username);
  renderProfileEditPage();
}

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
  const av = String(_draft?.avatar || "").trim();
  const handle = normalizeUsername(_draft?.username) || "na";
  const initials = handle.slice(0, 2).toUpperCase();
  if (img) {
    const adj = qs("#btnProfileEditAdjustPhoto");
    if (adj) adj.hidden = !av;
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
    fallback.textContent = initials;
    fallback.hidden = Boolean(av);
  }
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
  sheet.hidden = true;
  sheet.classList.remove("isOpen");
  document.body.classList.remove("profileEditSheetOpen");
  _activeSheet = "";
  const body = qs("#profileEditSheetBody");
  if (body) body.innerHTML = "";
}

function openProfileEditSheet(kind, title) {
  const sheet = qs("#profileEditSheet");
  const body = qs("#profileEditSheetBody");
  const titleEl = qs("#profileEditSheetTitle");
  if (!sheet || !body) return;
  _activeSheet = kind;
  if (titleEl) titleEl.textContent = title;
  body.innerHTML = "";
  sheet.hidden = false;
  requestAnimationFrame(() => sheet.classList.add("isOpen"));
  document.body.classList.add("profileEditSheetOpen");
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

function resetArtistAvatarState() {
  _aaStep = (Array.isArray(_draft?.artistAvatarGallery) && _draft.artistAvatarGallery.length) ? "manage" : "intro";
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
  const next = {
    ...active,
    artistAvatar: _draft.artistAvatar || "",
    artistAvatarGallery: aaCapGallery(_draft.artistAvatarGallery || []),
    artistAvatarConsentedAt: _draft.artistAvatarConsentedAt || active.artistAvatarConsentedAt || 0,
    artistAvatarUpdatedAt: Date.now(),
    avatar: _draft.avatar || active.avatar || "",
  };
  try { _deps.saveProfile(next); } catch {}
  try { _deps.syncProfileUi?.(next); } catch {}
  try {
    await _deps.supabaseUpsertProfile(next);
  } catch (e) {
    try {
      _deps?.showToast?.("Saved on this phone — will sync once your connection is back", { durationMs: 3000 });
    } catch {}
  }
}

/** Switch which generated portrait is "active" (shows on the profile flip) — free,
 *  no regeneration. If the previous active one was also standing in as the profile
 *  picture, the new one takes over that role too, so the two stay in sync. */
function switchActiveArtistAvatar(src) {
  if (!src) return;
  const wasProfilePic = Boolean(_draft.artistAvatar) && _draft.avatar === _draft.artistAvatar;
  _draft.artistAvatar = src;
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
    }
  } else if (_draft.avatar === _draft.artistAvatar) {
    _draft.avatar = _draft.artistAvatarPrevAvatar || "";
  }
  markDirty();
  void persistArtistAvatarNow();
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

  if (_aaStep === "manage") {
    const gallery = aaCapGallery(_draft.artistAvatarGallery);
    const isProfilePic = Boolean(_draft.artistAvatar) && _draft.avatar === _draft.artistAvatar;
    const thumbs = gallery.map((src, i) => `
      <button type="button" class="aaOption${src === _draft.artistAvatar ? " isChosen" : ""}" style="background-image:url('${src}')" data-aa-switch="${i}" aria-label="Avatar option ${i + 1}"></button>
    `).join("");
    body.innerHTML = `
      <div class="aaStepKick">YOUR ARTIST AVATARS</div>
      <p class="aaStepBody">Tap one to make it active on your profile's flip. It's free to switch between ones you've already made.</p>
      <div class="aaOptionsGrid" id="aaGalleryGrid">${thumbs}</div>
      <label class="aaConsentRow" for="aaUseAsProfileCheck">
        <input type="checkbox" id="aaUseAsProfileCheck" ${isProfilePic ? "checked" : ""} />
        <span>Also use as my profile picture everywhere — not just the cover flip</span>
      </label>
      <button type="button" id="aaGenerateMoreBtn" class="aaPrimaryBtn">Generate new photos · ${AA_COST} credits</button>
    `;
    body.querySelectorAll("[data-aa-switch]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-aa-switch"));
        switchActiveArtistAvatar(gallery[i]);
        try { _deps?.haptic?.("light"); } catch {}
        renderProfileEditPage();
        renderArtistAvatarStep();
      });
    });
    qs("#aaUseAsProfileCheck", body)?.addEventListener("change", (e) => {
      setArtistAvatarAsProfilePic(Boolean(e.target.checked));
      renderProfileEditPage();
      renderArtistAvatarStep();
    });
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
        <span>Also use as my profile picture everywhere — not just the cover flip</span>
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
    qs("#aaUseChosenBtn", body)?.addEventListener("click", () => confirmArtistAvatarChoice());
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
    _aaOptions = d.options;
    _aaChosenIndex = -1;
    _aaUseAsProfilePic = false;
    // Save all generated options, not just whichever gets picked — "switch between
    // them later" only works if the ones not chosen right now aren't thrown away.
    _draft.artistAvatarGallery = aaCapGallery([...(_draft.artistAvatarGallery || []), ...d.options]);
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

function confirmArtistAvatarChoice() {
  if (_aaChosenIndex < 0 || !_aaOptions[_aaChosenIndex]) return;
  _draft.artistAvatar = _aaOptions[_aaChosenIndex];
  _draft.artistAvatarConsentedAt = _draft.artistAvatarConsentedAt || Date.now();
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

function triggerPhotoPicker() {
  const input = qs("#profileAvatarFile");
  if (!input) return;
  try { input.click(); } catch {}
}

async function onAvatarFileChange(file) {
  if (!file || !_draft) return;
  try {
    const dataUrl = await _deps.compressAvatarFile(file, { maxSize: 720, quality: 0.86 });
    if (!dataUrl) throw new Error("Could not read photo");
    _draft.avatar = dataUrl;
    markDirty();
    renderProfileEditPage();
    // Let the person frame it right away (Cancel keeps the automatic crop).
    let objUrl = "";
    try { objUrl = URL.createObjectURL(file); } catch {}
    _photoFrameSrc = objUrl;
    if (objUrl) await frameCurrentPhoto(objUrl);
    try { _deps?.showToast?.("Photo updated — tap Save to publish", { icon: "✓", durationMs: 1800 }); } catch {}
  } catch (e) {
    try { _deps?.showToast?.(`Could not load photo: ${e?.message || "error"}`, { icon: "!", durationMs: 2800 }); } catch {}
  }
}

let _photoFrameSrc = "";

/** Open the framing sheet on `src`; on Done the framed square replaces the draft photo. */
async function frameCurrentPhoto(src) {
  if (!src) return;
  const res = await openPhotoFrame({ src });
  if (!res) return;
  _draft.avatar = res.avatar;
  markDirty();
  renderProfileEditPage();
  try { _deps?.showToast?.("Framing updated — tap Save to publish", { icon: "✓", durationMs: 1800 }); } catch {}
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
  };
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
  // Everything the person sees is saved locally by now. Update the UI and leave immediately; the cloud
  // profile row sync continues in the background instead of making them wait on the network.
  _deps.syncProfileUi?.(payload);
  _dirty = false;
  syncSaveButton();
  try { _deps.showToast?.("Profile saved.", { icon: "✓", durationMs: 2000 }); } catch {}
  if (navigateBack) {
    try { location.hash = "#/profile"; } catch {}
    try { _deps.applyRoute?.(); } catch {}
  }
  void (async () => {
    let cloudSaved = false;
    try {
      await _deps.supabaseUpsertProfile(payload);
      cloudSaved = true;
    } catch (err) {
      _deps.setStatus?.(`Saved locally. Cloud sync skipped: ${err?.message || String(err)}`);
      try { _deps.scheduleProfileCloudSync?.({ delayMs: 3000 }); } catch {}
      try { _deps.showToast?.("Saved on this device — syncing when the connection is back.", { durationMs: 3200 }); } catch {}
    }
    if (cloudSaved && usernameWillChange) {
      payload.usernameChangedAt = Date.now();
      _deps.saveProfile(payload);
      try { await _deps.supabaseUpsertProfile(payload); } catch {}
    }
  })();
  return true;
}

export function onProfileEditRouteActive() {
  hydrateProfileEditDraft(_deps?.getActiveProfile?.());
}

export function initProfileEditOnce(deps) {
  if (_inited) return;
  _deps = deps;
  _inited = true;
  bindSheetDismiss();

  const page = qs('[data-route="profile-edit"]');
  if (!page || page.dataset.boundProfileEdit === "1") return;
  page.dataset.boundProfileEdit = "1";

  qs("#btnProfileEditPageSave")?.addEventListener("click", async () => {
    if (!_dirty) return;
    try { _deps?.haptic?.("medium"); } catch {}
    await saveProfileEditDraft({ navigateBack: true });
  });

  qs("#btnProfileEditAdjustPhoto")?.addEventListener("click", async () => {
    try { _deps?.haptic?.("light"); } catch {}
    // Best source first: this session's original file, otherwise the saved avatar.
    const src = _photoFrameSrc || String(_draft?.avatar || "");
    await frameCurrentPhoto(src);
  });
  qs("#btnProfileEditChangePhoto")?.addEventListener("click", () => {
    try { _deps?.haptic?.("light"); } catch {}
    triggerPhotoPicker();
  });
  qs("#profileEditAvatarWrap")?.addEventListener("click", (e) => {
    e.preventDefault();
    try { _deps?.haptic?.("light"); } catch {}
    triggerPhotoPicker();
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
