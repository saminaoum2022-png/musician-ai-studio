/**
 * Echo — ephemeral creator audio moments (24h).
 * Wired from app.js via initEcho(ctx).
 */

const ECHO_BAR_COUNT = 48;
const ECHO_MAX_MS = 60000;
const ECHO_MAX_BYTES = 768 * 1024;
const ECHO_HEARD_KEY = "nabad_echo_heard_v1";

let ctx = null;
let echoRecState = "idle";
let echoRecorder = null;
let echoStream = null;
let echoChunks = [];
let echoBlob = null;
let echoBlobUrl = "";
let echoDurationMs = 0;
let echoPeaks = [];
let echoStartedAt = 0;
let echoAutostopTimer = 0;
let echoTickRaf = 0;

let _echoStories = [];
let _echoStoriesByUser = new Map();
let _echoById = new Map();
let _echoRailGen = 0;
let _echoViewerOpen = false;
let _echoDeck = [];
let _echoDeckIndex = 0;
let _echoSlideIndex = 0;
let _echoAudio = null;
let _echoCtx = null;
let _echoAnalyser = null;
let _echoSource = null;
let _echoRaf = 0;
let _echoProgressTimer = 0;
let _echoListenMarked = false;
let _echoReplyToId = "";
let _pendingEchoCompose = false;

function c() {
  return ctx;
}

function escape(s) {
  return c().escapeHtml(String(s || ""));
}

function normalizePeaks(peaks) {
  const fn = c().statusVoiceNormalizePeaks;
  if (fn) return fn(peaks, ECHO_BAR_COUNT);
  const raw = Array.isArray(peaks) ? peaks : c().statusVoiceFallbackPeaks?.() || [];
  return raw.slice(0, ECHO_BAR_COUNT);
}

function peaksHtml(peaks, extraClass = "") {
  const norm = normalizePeaks(peaks);
  return norm
    .map((h, i) => {
      const ht = Math.max(0.1, Math.min(1, Number(h) || 0.3));
      const tint = i % 4 === 0 ? "echoBar--hi" : "";
      return `<span class="echoBar ${tint} ${extraClass}" style="--bar-h:${(ht * 100).toFixed(1)}%"></span>`;
    })
    .join("");
}

function loadHeardLocal() {
  try {
    const raw = localStorage.getItem(ECHO_HEARD_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveHeardLocal(id) {
  try {
    const set = loadHeardLocal();
    set.add(String(id));
    localStorage.setItem(ECHO_HEARD_KEY, JSON.stringify([...set].slice(-400)));
  } catch {}
}

function isEchoHeard(echo) {
  if (!echo) return false;
  if (echo.listened) return true;
  return loadHeardLocal().has(String(echo.id));
}

function mapEchoFromApi(e) {
  return {
    id: e.id,
    userId: e.userId,
    audioUrl: e.audioUrl,
    durationMs: Number(e.durationMs) || 0,
    waveformPeaks: e.waveformPeaks || [],
    body: String(e.body || "").trim(),
    listenOnce: Boolean(e.listenOnce),
    replyTo: e.replyTo || null,
    createdAt: e.createdAt,
    expiresAt: e.expiresAt,
    username: e.username || "",
    avatar: e.avatar || "",
    listened: Boolean(e.listened),
    reaction: String(e.reaction || ""),
    reactionCounts: e.reactionCounts || {},
  };
}

function indexEchoStories(stories) {
  _echoStories = Array.isArray(stories) ? stories : [];
  _echoStoriesByUser = new Map();
  _echoById = new Map();
  for (const story of _echoStories) {
    const uid = String(story.userId || "");
    if (!uid) continue;
    const slides = (story.echoes || []).map(mapEchoFromApi);
    _echoStoriesByUser.set(uid, { ...story, echoes: slides });
    slides.forEach((e) => _echoById.set(String(e.id), e));
  }
}

async function fetchEchoRail() {
  const uid = c().getAuthSession()?.user?.id;
  if (!uid) return [];
  try {
    const following = await c().fetchFollowingListViaSupabase();
    if (following === null) throw new Error("no direct");
    const authorIds = [...new Set([uid, ...following.map((f) => f.userId).filter(Boolean)])];
    if (!authorIds.length) return [];
    const nowIso = new Date().toISOString();
    const inList = authorIds.map((id) => encodeURIComponent(id)).join(",");
    const cols =
      "id,user_id,audio_url,duration_ms,waveform_peaks,body,listen_once,reply_to,created_at,expires_at";
    const r = await c().supabaseRestWithAuth(
      `social_echoes?user_id=in.(${inList})&expires_at=gt.${encodeURIComponent(nowIso)}&select=${cols}&order=created_at.desc&limit=60`,
    );
    if (!r?.ok) throw new Error("fetch");
    const raw = await r.json().catch(() => []);
    if (!Array.isArray(raw)) return [];
    const profIds = [...new Set(raw.map((row) => String(row.user_id || "").trim()).filter(Boolean))];
    const profMap = await c().fetchProfilesByUserIdsMap(profIds);
    const echoIds = raw.map((row) => row.id).filter(Boolean);
    let listenedSet = new Set();
    const reactMap = new Map();
    if (echoIds.length) {
      const inEcho = echoIds.map((id) => encodeURIComponent(id)).join(",");
      const lr = await c().supabaseRestWithAuth(
        `social_echo_listens?echo_id=in.(${inEcho})&user_id=eq.${encodeURIComponent(uid)}&select=echo_id`,
      );
      if (lr?.ok) {
        const listens = await lr.json().catch(() => []);
        if (Array.isArray(listens)) listenedSet = new Set(listens.map((x) => x.echo_id));
      }
      const rr = await c().supabaseRestWithAuth(
        `social_echo_reactions?echo_id=in.(${inEcho})&select=echo_id,reaction,user_id`,
      );
      if (rr?.ok) {
        const reacts = await rr.json().catch(() => []);
        if (Array.isArray(reacts)) {
          for (const row of reacts) {
            if (!reactMap.has(row.echo_id)) reactMap.set(row.echo_id, { counts: {}, mine: "" });
            const b = reactMap.get(row.echo_id);
            const k = String(row.reaction || "");
            b.counts[k] = (b.counts[k] || 0) + 1;
            if (row.user_id === uid) b.mine = k;
          }
        }
      }
    }
    const byUser = new Map();
    for (const row of raw) {
      const userId = String(row.user_id || "");
      if (!userId) continue;
      if (!byUser.has(userId)) byUser.set(userId, []);
      const prof = profMap.get(userId);
      const rx = reactMap.get(row.id) || { counts: {}, mine: "" };
      byUser.get(userId).push(
        mapEchoFromApi({
          id: row.id,
          userId,
          audioUrl: row.audio_url,
          durationMs: row.duration_ms,
          waveformPeaks: row.waveform_peaks,
          body: row.body,
          listenOnce: row.listen_once,
          replyTo: row.reply_to,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
          username: prof?.username || "",
          avatar: prof?.avatar || "",
          listened: listenedSet.has(row.id),
          reaction: rx.mine,
          reactionCounts: rx.counts,
        }),
      );
    }
    return [...byUser.entries()]
      .sort((a, b) => {
        const ta = new Date(a[1][0]?.createdAt || 0).getTime();
        const tb = new Date(b[1][0]?.createdAt || 0).getTime();
        return tb - ta;
      })
      .map(([userId, echoes]) => {
        const prof = profMap.get(userId);
        return {
          userId,
          username: prof?.username || "",
          avatar: prof?.avatar || "",
          echoes,
        };
      });
  } catch {
    try {
      const data = await c().socialApi("/api/social?type=echo_rail&limit=48");
      return Array.isArray(data?.echoes) ? data.echoes : [];
    } catch {
      return [];
    }
  }
}

function echoTileShellHtml(story, { isOwn = false, addTile = false } = {}) {
  const uid = String(story.userId || "");
  const echoes = story.echoes || [];
  const latest = echoes[0];
  const avatar = c().normalizeProfileAvatarForImg(String(story.avatar || "").trim());
  const handle = String(story.username || "").replace(/^@/, "") || "you";
  const heardAll = echoes.length > 0 && echoes.every((e) => isEchoHeard(e));
  const active = echoes.some((e) => !isEchoHeard(e));
  const listenOnce = Boolean(latest?.listenOnce);
  const peaks = latest?.waveformPeaks || [];

  if (addTile && isOwn) {
    return `<button type="button" class="echoTile echoTile--add" data-echo-add="1" aria-label="Drop an Echo">
      <span class="echoTileShell echoTileShell--add">
        <span class="echoTileAddIcon" aria-hidden="true">+</span>
      </span>
      <span class="echoTileLabel">Your Echo</span>
    </button>`;
  }

  const imgInner = avatar
    ? `<img class="echoTileAvatar" src="${escape(avatar)}" alt="" width="72" height="72" decoding="async" />`
    : `<span class="echoTileAvatarFallback">${escape(handle.slice(0, 2).toUpperCase())}</span>`;

  return `<button type="button" class="echoTile${heardAll ? " isViewed" : ""}${active ? " isActive" : ""}" data-echo-user-id="${escape(uid)}" aria-label="${escape(handle)} Echo">
    <span class="echoTileShell${active ? " echoTileShell--pulse" : ""}">
      <span class="echoTileMedia">${imgInner}</span>
      <span class="echoTileWave" aria-hidden="true">${peaksHtml(peaks, "echoBar--tile")}</span>
      ${listenOnce ? '<span class="echoTileOnce" aria-hidden="true">1×</span>' : ""}
    </span>
    <span class="echoTileLabel">${escape(isOwn ? "You" : handle)}</span>
  </button>`;
}

function renderEchoRail(stories) {
  const rail = document.getElementById("friendsEchoRail");
  const scroll = document.getElementById("friendsEchoRailScroll");
  if (!rail || !scroll) return;
  const uid = String(c().getAuthSession()?.user?.id || "");
  const own = _echoStoriesByUser.get(uid) || { userId: uid, username: "", avatar: "", echoes: [] };
  const others = _echoStories.filter((s) => String(s.userId) !== uid);
  const tiles = [echoTileShellHtml(own, { isOwn: true, addTile: true }), ...others.map((s) => echoTileShellHtml(s))];
  scroll.innerHTML = tiles.join("");
  rail.hidden = !uid;
}

export async function refreshEchoRail() {
  const gen = ++_echoRailGen;
  if (!c().getAuthSession()?.user?.id) {
    const rail = document.getElementById("friendsEchoRail");
    if (rail) rail.hidden = true;
    return;
  }
  const stories = await fetchEchoRail();
  if (gen !== _echoRailGen) return;
  indexEchoStories(stories);
  renderEchoRail(stories);
}

function stopEchoPlayback() {
  if (_echoProgressTimer) {
    window.clearInterval(_echoProgressTimer);
    _echoProgressTimer = 0;
  }
  if (_echoRaf) {
    cancelAnimationFrame(_echoRaf);
    _echoRaf = 0;
  }
  try {
    _echoAudio?.pause?.();
  } catch {}
  _echoAudio = null;
  try {
    _echoSource?.disconnect?.();
  } catch {}
  _echoSource = null;
  try {
    _echoCtx?.close?.();
  } catch {}
  _echoCtx = null;
  _echoAnalyser = null;
}

function currentEchoSlide() {
  const story = _echoDeck[_echoDeckIndex];
  return story?.echoes?.[_echoSlideIndex] || null;
}

function syncEchoViewerUi() {
  const sheet = document.getElementById("echoViewerSheet");
  const wave = document.getElementById("echoViewerWave");
  const who = document.getElementById("echoViewerWho");
  const timer = document.getElementById("echoViewerTimer");
  const caption = document.getElementById("echoViewerCaption");
  const reactions = document.getElementById("echoViewerReactions");
  const onceBadge = document.getElementById("echoViewerOnceBadge");
  const progress = document.getElementById("echoViewerProgressFill");
  const avatarImg = document.getElementById("echoViewerAvatarImg");
  const avatarFb = document.getElementById("echoViewerAvatarFallback");
  const slide = currentEchoSlide();
  const story = _echoDeck[_echoDeckIndex];
  if (!slide || !sheet) return;

  const handle = String(slide.username || story?.username || "").replace(/^@/, "") || "Creator";
  if (who) who.textContent = `@${handle}`;
  const av = c().normalizeProfileAvatarForImg(String(slide.avatar || story?.avatar || "").trim());
  if (avatarImg) {
    if (av) {
      avatarImg.src = av;
      avatarImg.hidden = false;
    } else avatarImg.hidden = true;
  }
  if (avatarFb) {
    avatarFb.textContent = handle.slice(0, 2).toUpperCase();
    avatarFb.hidden = Boolean(av);
  }
  if (wave) wave.innerHTML = peaksHtml(slide.waveformPeaks);
  if (caption) {
    caption.textContent = slide.body || "";
    caption.hidden = !slide.body;
  }
  if (onceBadge) onceBadge.hidden = !slide.listenOnce;
  const heard = isEchoHeard(slide) || _echoListenMarked;
  const ended = sheet.classList.contains("isEnded");
  if (reactions) reactions.hidden = !(heard || ended);
  if (timer && _echoAudio) {
    const cur = Math.floor(_echoAudio.currentTime || 0);
    const dur = Math.floor(_echoAudio.duration || slide.durationMs / 1000 || 0);
    timer.textContent = `${c().formatMsAsVoiceTime(cur * 1000)} · ${c().formatMsAsVoiceTime((dur || 1) * 1000)}`;
  }
  if (progress && _echoAudio && _echoAudio.duration) {
    progress.style.width = `${Math.min(100, (_echoAudio.currentTime / _echoAudio.duration) * 100)}%`;
  }
  document.querySelectorAll("[data-echo-react]").forEach((btn) => {
    btn.classList.toggle("isActive", btn.getAttribute("data-echo-react") === slide.reaction);
  });
}

function echoViewerTick() {
  const sheet = document.getElementById("echoViewerSheet");
  const mic = document.getElementById("echoViewerMicPulse");
  const wave = document.getElementById("echoViewerWave");
  if (!sheet?.classList.contains("isOpen") || !_echoAnalyser || !wave) {
    _echoRaf = 0;
    return;
  }
  const data = new Uint8Array(_echoAnalyser.frequencyBinCount);
  _echoAnalyser.getByteFrequencyData(data);
  const bars = wave.querySelectorAll(".echoBar");
  const step = Math.max(1, Math.floor(data.length / bars.length));
  let sum = 0;
  bars.forEach((bar, i) => {
    const v = data[Math.min(data.length - 1, i * step)] / 255;
    sum += v;
    const base = parseFloat(bar.style.getPropertyValue("--bar-h")) / 100 || 0.3;
    const h = Math.max(0.12, Math.min(1, base * 0.55 + v * 0.65));
    bar.style.setProperty("--bar-h", `${(h * 100).toFixed(1)}%`);
  });
  if (mic) mic.style.setProperty("--echo-mic", String(Math.min(1, sum / Math.max(1, bars.length * 0.85))));
  syncEchoViewerUi();
  _echoRaf = requestAnimationFrame(echoViewerTick);
}

async function markEchoListened(slide) {
  if (!slide?.id || _echoListenMarked) return;
  _echoListenMarked = true;
  saveHeardLocal(slide.id);
  slide.listened = true;
  const uid = c().getAuthSession()?.user?.id;
  if (!uid) return;
  try {
    await c().supabaseRestWithAuth("social_echo_listens", {
      method: "POST",
      prefer: "return=minimal",
      body: JSON.stringify({ echo_id: slide.id, user_id: uid }),
    });
  } catch {
    try {
      await c().socialApi("/api/social", {
        method: "POST",
        body: JSON.stringify({ action: "echo_listen", echoId: slide.id }),
      });
    } catch {}
  }
}

async function playEchoSlide(slide) {
  stopEchoPlayback();
  const sheet = document.getElementById("echoViewerSheet");
  if (!slide?.audioUrl || !sheet) return;
  const listenOnce = Boolean(slide.listenOnce);
  const alreadyHeard = isEchoHeard(slide);
  if (listenOnce && alreadyHeard) {
    sheet.classList.add("isLocked");
    syncEchoViewerUi();
    return;
  }
  sheet.classList.remove("isLocked", "isEnded");
  _echoListenMarked = false;
  const audio = new Audio(slide.audioUrl);
  audio.playsInline = true;
  _echoAudio = audio;
  try {
    const ac = new AudioContext();
    _echoCtx = ac;
    _echoAnalyser = ac.createAnalyser();
    _echoAnalyser.fftSize = 128;
    _echoSource = ac.createMediaElementSource(audio);
    _echoSource.connect(_echoAnalyser);
    _echoAnalyser.connect(ac.destination);
  } catch {}
  audio.addEventListener("play", () => {
    void markEchoListened(slide);
    if (!_echoRaf) _echoRaf = requestAnimationFrame(echoViewerTick);
  });
  audio.addEventListener("timeupdate", () => syncEchoViewerUi());
  audio.addEventListener("ended", () => {
    sheet.classList.add("isEnded");
    if (listenOnce) sheet.classList.add("isLocked");
    stopEchoPlayback();
    syncEchoViewerUi();
  });
  try {
    await audio.play();
  } catch {
    try {
      c().showToast("Tap to listen", { durationMs: 2200 });
    } catch {}
  }
  _echoProgressTimer = window.setInterval(() => syncEchoViewerUi(), 200);
  syncEchoViewerUi();
}

function buildDeckForUser(userId, slideIndex = 0) {
  const story = _echoStoriesByUser.get(String(userId || ""));
  if (!story?.echoes?.length) return;
  _echoDeck = [story];
  _echoDeckIndex = 0;
  _echoSlideIndex = Math.max(0, Math.min(slideIndex, story.echoes.length - 1));
}

export function openEchoViewer(userId, slideIndex = 0) {
  buildDeckForUser(userId, slideIndex);
  const slide = currentEchoSlide();
  if (!slide) return;
  const sheet = document.getElementById("echoViewerSheet");
  if (!sheet) return;
  sheet.hidden = false;
  sheet.setAttribute("aria-hidden", "false");
  sheet.classList.remove("isLocked", "isEnded");
  requestAnimationFrame(() => {
    sheet.classList.add("isOpen");
    void playEchoSlide(slide);
  });
  _echoViewerOpen = true;
  document.body.classList.add("echoViewerOpen");
}

export function closeEchoViewer() {
  const sheet = document.getElementById("echoViewerSheet");
  stopEchoPlayback();
  if (!sheet) return;
  sheet.classList.remove("isOpen");
  document.body.classList.remove("echoViewerOpen");
  window.setTimeout(() => {
    sheet.hidden = true;
    sheet.setAttribute("aria-hidden", "true");
    sheet.classList.remove("isLocked", "isEnded");
  }, 280);
  _echoViewerOpen = false;
  void refreshEchoRail();
}

async function postEchoReaction(reaction) {
  const slide = currentEchoSlide();
  if (!slide?.id) return;
  try {
    c().haptic("light");
  } catch {}
  slide.reaction = reaction;
  syncEchoViewerUi();
  try {
    await c().socialApi("/api/social", {
      method: "POST",
      body: JSON.stringify({ action: "echo_react", echoId: slide.id, reaction }),
    });
  } catch {
    try {
      const uid = c().getAuthSession()?.user?.id;
      if (uid) {
        await c().supabaseRestWithAuth("social_echo_reactions", {
          method: "POST",
          prefer: "resolution=merge-duplicates",
          body: JSON.stringify({ echo_id: slide.id, user_id: uid, reaction }),
        });
      }
    } catch {}
  }
}

function resetEchoCompose() {
  echoRecState = "idle";
  echoChunks = [];
  echoDurationMs = 0;
  echoPeaks = [];
  if (echoBlobUrl) {
    try {
      URL.revokeObjectURL(echoBlobUrl);
    } catch {}
  }
  echoBlobUrl = "";
  echoBlob = null;
  if (echoAutostopTimer) {
    window.clearTimeout(echoAutostopTimer);
    echoAutostopTimer = 0;
  }
  if (echoTickRaf) {
    cancelAnimationFrame(echoTickRaf);
    echoTickRaf = 0;
  }
  try {
    echoStream?.getTracks?.().forEach((t) => t.stop());
  } catch {}
  echoStream = null;
  echoRecorder = null;
}

function syncEchoComposeUi() {
  const status = document.getElementById("echoComposeStatus");
  const wave = document.getElementById("echoComposeWave");
  const publish = document.getElementById("btnEchoPublish");
  const mic = document.getElementById("btnEchoRecord");
  const hasBlob = Boolean(echoBlob?.size);
  const recording = echoRecState === "recording";
  if (mic) {
    mic.classList.toggle("isRecording", recording);
    mic.setAttribute("aria-pressed", recording ? "true" : "false");
  }
  if (status) {
    status.textContent = recording
      ? `Recording… ${c().formatMsAsVoiceTime(performance.now() - echoStartedAt)}`
      : hasBlob
        ? `Echo ready · ${c().formatMsAsVoiceTime(echoDurationMs)}`
        : "Hold the mic — hum, sing, or speak a raw idea";
  }
  if (publish) publish.disabled = !hasBlob || recording;
  if (wave) {
    wave.innerHTML = peaksHtml(hasBlob || recording ? echoPeaks : normalizePeaks([]), recording ? "echoBar--live" : "");
  }
}

async function startEchoRecording() {
  if (echoRecState === "recording") return;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch {
    try {
      c().showToast("Microphone permission needed.", { durationMs: 2800 });
    } catch {}
    return;
  }
  const mimeType = c().pickRecorderMimeType?.() || "";
  let rec;
  try {
    rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  } catch {
    try {
      c().showToast("Recording not supported here.", { durationMs: 2600 });
    } catch {}
    stream.getTracks().forEach((t) => t.stop());
    return;
  }
  echoStream = stream;
  echoRecorder = rec;
  echoChunks = [];
  echoRecState = "recording";
  echoStartedAt = performance.now();
  rec.ondataavailable = (e) => {
    if (e.data?.size) echoChunks.push(e.data);
  };
  rec.onstop = () => {
    echoRecState = "idle";
    const blob = new Blob(echoChunks, { type: rec.mimeType || "audio/webm" });
    echoBlob = blob.size ? blob : null;
    if (echoBlobUrl) {
      try {
        URL.revokeObjectURL(echoBlobUrl);
      } catch {}
    }
    echoBlobUrl = echoBlob ? URL.createObjectURL(echoBlob) : "";
    echoDurationMs = Math.min(ECHO_MAX_MS, performance.now() - echoStartedAt);
    void c().computeStatusWaveformPeaks(echoBlob, ECHO_BAR_COUNT).then((peaks) => {
      echoPeaks = peaks;
      syncEchoComposeUi();
    });
    try {
      echoStream?.getTracks?.().forEach((t) => t.stop());
    } catch {}
    echoStream = null;
    syncEchoComposeUi();
  };
  rec.start(200);
  syncEchoComposeUi();
  echoAutostopTimer = window.setTimeout(() => {
    if (echoRecState === "recording") stopEchoRecording();
  }, ECHO_MAX_MS);
}

function stopEchoRecording() {
  if (echoRecState !== "recording" || !echoRecorder) return;
  if (echoAutostopTimer) {
    window.clearTimeout(echoAutostopTimer);
    echoAutostopTimer = 0;
  }
  try {
    echoRecorder.stop();
  } catch {
    echoRecState = "idle";
    syncEchoComposeUi();
  }
}

export function openEchoComposeSheet({ replyTo = "" } = {}) {
  _echoReplyToId = String(replyTo || "").trim();
  resetEchoCompose();
  const sheet = document.getElementById("echoComposeSheet");
  if (!sheet) return;
  const once = document.getElementById("echoListenOnce");
  if (once) once.checked = false;
  const cap = document.getElementById("echoComposeCaption");
  if (cap) cap.value = "";
  sheet.hidden = false;
  sheet.setAttribute("aria-hidden", "false");
  sheet.classList.add("isOpen");
  document.body.classList.add("echoComposeOpen");
  syncEchoComposeUi();
}

export function closeEchoComposeSheet() {
  resetEchoCompose();
  const sheet = document.getElementById("echoComposeSheet");
  if (!sheet) return;
  sheet.classList.remove("isOpen");
  document.body.classList.remove("echoComposeOpen");
  window.setTimeout(() => {
    sheet.hidden = true;
    sheet.setAttribute("aria-hidden", "true");
  }, 240);
  _echoReplyToId = "";
}

async function publishEcho() {
  if (!echoBlob?.size) return;
  const publish = document.getElementById("btnEchoPublish");
  const onceEl = document.getElementById("echoListenOnce");
  const caption = String(document.getElementById("echoComposeCaption")?.value || "").trim().slice(0, 200);
  const listenOnce = Boolean(onceEl?.checked);
  if (publish) publish.disabled = true;
  try {
    const uploaded = await c().uploadStatusVoiceBlob(echoBlob);
    const peaks = echoPeaks.length ? echoPeaks : await c().computeStatusWaveformPeaks(echoBlob, ECHO_BAR_COUNT);
    const payload = {
      action: "post_echo",
      audioUrl: uploaded.url,
      durationMs: echoDurationMs,
      waveformPeaks: peaks,
      body: caption,
      listenOnce,
      replyTo: _echoReplyToId || null,
    };
    let ok = false;
    try {
      const data = await c().socialApi("/api/social", { method: "POST", body: JSON.stringify(payload) });
      ok = Boolean(data?.echo?.id);
    } catch {}
    if (!ok) {
      const uid = c().getAuthSession()?.user?.id;
      if (uid) {
        const expiresAt = new Date(Date.now() + 86400000).toISOString();
        const r = await c().supabaseRestWithAuth("social_echoes", {
          method: "POST",
          prefer: "return=representation",
          body: JSON.stringify({
            user_id: uid,
            audio_url: uploaded.url,
            duration_ms: echoDurationMs,
            waveform_peaks: peaks,
            body: caption || null,
            listen_once: listenOnce,
            reply_to: _echoReplyToId || null,
            expires_at: expiresAt,
          }),
        });
        ok = r?.ok;
      }
    }
    closeEchoComposeSheet();
    try {
      c().showToast("Echo is live for 24 hours", { icon: "✓", durationMs: 2400 });
    } catch {}
    void refreshEchoRail();
  } catch (e) {
    try {
      c().showToast(e?.message || "Could not post Echo", { durationMs: 3200 });
    } catch {}
  } finally {
    if (publish) publish.disabled = false;
  }
}

export function openEchoFromCreateChooser() {
  _pendingEchoCompose = true;
  const onFriends = String(location.hash || "") === "#/friends";
  if (!onFriends) {
    try {
      location.hash = "#/friends";
    } catch {}
  } else {
    c().enterFriendsRoute?.();
    window.setTimeout(() => {
      if (_pendingEchoCompose) {
        _pendingEchoCompose = false;
        openEchoComposeSheet();
      }
    }, 120);
  }
}

export function onEnterFriendsRoute() {
  void refreshEchoRail();
  if (_pendingEchoCompose) {
    _pendingEchoCompose = false;
    window.setTimeout(() => openEchoComposeSheet(), 160);
  }
}

function wireEchoOnce() {
  if (document.documentElement.dataset.echoWired) return;
  document.documentElement.dataset.echoWired = "1";

  document.getElementById("friendsEchoRailScroll")?.addEventListener("click", (e) => {
    const add = e.target.closest("[data-echo-add]");
    if (add) {
      e.preventDefault();
      try {
        c().haptic("light");
      } catch {}
      if (!c().getAuthSession()?.user?.id) {
        try {
          c().showToast("Sign in to drop an Echo", { durationMs: 2400 });
        } catch {}
        return;
      }
      openEchoComposeSheet();
      return;
    }
    const tile = e.target.closest("[data-echo-user-id]");
    if (!tile) return;
    e.preventDefault();
    try {
      c().haptic("light");
    } catch {}
    openEchoViewer(tile.getAttribute("data-echo-user-id"), 0);
  });

  document.getElementById("echoViewerBackdrop")?.addEventListener("click", () => closeEchoViewer());
  document.getElementById("btnEchoViewerClose")?.addEventListener("click", () => closeEchoViewer());
  document.getElementById("echoViewerTapPrev")?.addEventListener("click", () => {
    if (_echoSlideIndex > 0) {
      _echoSlideIndex -= 1;
      void playEchoSlide(currentEchoSlide());
    }
  });
  document.getElementById("echoViewerTapNext")?.addEventListener("click", () => {
    const story = _echoDeck[_echoDeckIndex];
    if (_echoSlideIndex < (story?.echoes?.length || 1) - 1) {
      _echoSlideIndex += 1;
      void playEchoSlide(currentEchoSlide());
    } else {
      closeEchoViewer();
    }
  });

  document.querySelectorAll("[data-echo-react]").forEach((btn) => {
    btn.addEventListener("click", () => {
      void postEchoReaction(btn.getAttribute("data-echo-react"));
    });
  });
  document.getElementById("btnEchoReply")?.addEventListener("click", () => {
    const slide = currentEchoSlide();
    closeEchoViewer();
    openEchoComposeSheet({ replyTo: slide?.id || "" });
  });

  document.getElementById("echoComposeBackdrop")?.addEventListener("click", () => closeEchoComposeSheet());
  document.getElementById("btnEchoComposeClose")?.addEventListener("click", () => closeEchoComposeSheet());
  document.getElementById("btnEchoRecord")?.addEventListener("click", () => {
    if (echoRecState === "recording") stopEchoRecording();
    else void startEchoRecording();
  });
  document.getElementById("btnEchoPublish")?.addEventListener("click", () => void publishEcho());

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (document.getElementById("echoComposeSheet")?.classList.contains("isOpen")) closeEchoComposeSheet();
    else if (document.getElementById("echoViewerSheet")?.classList.contains("isOpen")) closeEchoViewer();
  });
}

export function initEcho(appCtx) {
  ctx = appCtx;
  wireEchoOnce();
}
