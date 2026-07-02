/**
 * Edit Profile — dedicated creator workspace (not Settings).
 */

import { MUSIC_PREFERENCE_GENRES, parseMusicPreferencesFromProfile, markMusicPreferencesComplete } from "./music-preferences.js";

let _deps = null;
let _inited = false;
let _draft = null;
let _dirty = false;
let _activeSheet = "";
let _genresTouched = false;

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
    .slice(0, 32);
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
    displayName: String(_draft.displayName || "").trim().slice(0, 48),
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

function displayNamePreview() {
  const friendly = String(_draft?.displayName || "").trim();
  if (friendly) return friendly;
  const handle = normalizeUsername(_draft?.username);
  return handle ? `@${handle}` : "Add display name";
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
  setVal("#profileEditBioVal", bioPreview(), !cleanBio(_draft.bio));
  setVal("#profileEditGenresVal", genresPreview(), !_draft.genres.length);
  setVal("#profileEditPersonaVal", personaPreview(), !_draft.personaId);
  SOCIAL_FIELDS.forEach(({ key }) => {
    setVal(`#profileEditSocialVal-${key}`, socialPreview(key), !String(_draft.links?.[key] || "").trim());
  });
  applyAvatarToEditPhoto();
  syncSaveButton();
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

function openTextEditor({ title, value, placeholder, multiline = false, maxLength = 120, onDone }) {
  const body = openProfileEditSheet("text", title);
  if (!body) return;
  const fieldId = "profileEditSheetField";
  body.innerHTML = `
    <div class="profileEditSheetFieldWrap">
      ${multiline
        ? `<textarea id="${fieldId}" class="profileEditSheetTextarea" maxlength="${maxLength}" placeholder="${escapeHtml(placeholder)}" rows="6">${escapeHtml(value)}</textarea>`
        : `<input id="${fieldId}" class="profileEditSheetInput" type="text" maxlength="${maxLength}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" autocapitalize="sentences" autocomplete="off" spellcheck="false" />`}
      <p class="profileEditSheetHint">${multiline ? "Share what makes your music yours." : "This is how others will recognize you."}</p>
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
    value: String(_draft.displayName || "").trim() || normalizeUsername(_draft.username),
    placeholder: "Your name",
    maxLength: 48,
    onDone: (val) => {
      _draft.displayName = val.slice(0, 48);
    },
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
  const email = String(_deps.getAuthSession?.()?.user?.email || base.email || "").trim().toLowerCase();
  const id = email || `user:${next.username}`;
  const payload = {
    ...base,
    ...next,
    id,
    email,
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
    if (e.target?.closest?.("button")) return;
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
