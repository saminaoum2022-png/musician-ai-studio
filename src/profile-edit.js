/**
 * Edit Profile — dedicated creator workspace (not Settings).
 */

import { MUSIC_PREFERENCE_GENRES, parseMusicPreferencesFromProfile, markMusicPreferencesComplete } from "./music-preferences.js";
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
  };
}

export function hydrateProfileEditDraft(profile) {
  const p = profile || _deps?.getActiveProfile?.() || {};
  const genres = parseMusicPreferencesFromProfile(p);
  const personaId =
    String(_deps?.loadPersonaSelection?.() || "").trim() ||
    String(_deps?.getActivePersonaId?.() || "").trim();
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
  if (list.length <= 3) return list.join(" · ");
  return `${list.slice(0, 3).join(" · ")} · +${list.length - 3}`;
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

function applyAvatarToEditPhoto() {
  const img = qs("#profileEditAvatar");
  const fallback = qs("#profileEditAvatarFallback");
  const av = String(_draft?.avatar || "").trim();
  const handle = normalizeUsername(_draft?.username) || "na";
  const initials = handle.slice(0, 2).toUpperCase();
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

function triggerPhotoPicker() {
  const input = qs("#profileAvatarFile");
  if (!input) return;
  try { input.click(); } catch {}
}

async function onAvatarFileChange(file) {
  if (!file || !_draft) return;
  try {
    const dataUrl = await _deps.compressAvatarFile(file, { maxSize: 320, quality: 0.82 });
    if (!dataUrl) throw new Error("Could not read photo");
    _draft.avatar = dataUrl;
    markDirty();
    renderProfileEditPage();
    try { _deps?.showToast?.("Photo updated — tap Save to publish", { icon: "✓", durationMs: 1800 }); } catch {}
  } catch (e) {
    try { _deps?.showToast?.(`Could not load photo: ${e?.message || "error"}`, { icon: "!", durationMs: 2800 }); } catch {}
  }
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
  if (nextHandle && nextHandle !== "guest") {
    const available = await _deps.checkUsernameAvailable?.(nextHandle, _originalUsername || normalizeUsername(base.username));
    if (!available) {
      try {
        _deps.showToast?.(`@${nextHandle} is already taken`, { icon: "!", durationMs: 2800 });
      } catch {}
      return false;
    }
  }
  const email = String(_deps.getAuthSession?.()?.user?.email || base.email || "").trim().toLowerCase();
  const id = email || `user:${next.username}`;
  let usernameChangedAt = Number(base.usernameChangedAt || 0);
  if (
    nextHandle &&
    nextHandle !== prevHandle &&
    !(_deps?.isPlaceholderUsername?.(nextHandle))
  ) {
    usernameChangedAt = Date.now();
  }
  const payload = {
    ...base,
    ...next,
    displayName: normalizeDisplayName(next.displayName),
    id,
    email,
    usernameChangedAt,
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
  try {
    await _deps.supabaseUpsertProfile(payload);
  } catch (e) {
    _deps.setStatus?.(`Saved locally. Cloud sync skipped: ${e?.message || String(e)}`);
  }
  _deps.syncProfileUi?.(payload);
  _dirty = false;
  syncSaveButton();
  try { _deps.showToast?.("Profile saved.", { icon: "✓", durationMs: 2000 }); } catch {}
  if (navigateBack) {
    try { location.hash = "#/profile"; } catch {}
    try { _deps.applyRoute?.(); } catch {}
  }
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
