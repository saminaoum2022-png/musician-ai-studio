/**
 * Hum Track — hum a melody, get a solo instrumental on a chosen instrument.
 * Wired from app.js via initHumTrack(ctx).
 */
import { HUM_TRACK_INSTRUMENTS, getHumTrackPreset } from "./hum-track-instruments.js";
import { humTrackIconMarkup } from "./hum-track-icons.js";

let ctx = null;
let wired = false;
let humTrackInstrument = "piano";
let humTrackBlob = null;
let humTrackSource = "";
let humTrackRecorder = null;
let humTrackStream = null;
let humTrackChunks = [];
let humTrackRecordSession = 0;
let humTrackPollTimer = null;
let humTrackTaskId = "";
let humTrackGenerating = false;

function el(id) {
  return document.getElementById(id);
}

function instrumentLabel(id) {
  return getHumTrackPreset(id).label;
}

const HUM_TRACK_MIN_BYTES = 6000;

async function humBlobLooksUsable(blob) {
  if (!blob || blob.size < HUM_TRACK_MIN_BYTES) return false;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return true;
    const ac = new AudioCtx();
    const buf = await blob.arrayBuffer();
    const audio = await ac.decodeAudioData(buf.slice(0));
    await ac.close();
    const data = audio.getChannelData(0);
    if (!data?.length) return false;
    let sum = 0;
    const step = Math.max(1, Math.floor(data.length / 4000));
    let n = 0;
    for (let i = 0; i < data.length; i += step) {
      sum += data[i] * data[i];
      n += 1;
    }
    const rms = Math.sqrt(sum / Math.max(1, n));
    return rms > 0.006;
  } catch {
    return blob.size >= HUM_TRACK_MIN_BYTES;
  }
}

function vocalFilenameForMime(mime) {
  const t = String(mime || "").toLowerCase();
  if (t.includes("mp4") || t.includes("aac") || t.includes("mpeg")) return "hum-track.m4a";
  if (t.includes("webm")) return "hum-track.webm";
  if (t.includes("ogg")) return "hum-track.ogg";
  return "hum-track.m4a";
}

function syncHumTrackRecordIcon() {
  const host = el("humTrackRecordIconHost");
  if (!host) return;
  host.innerHTML = humTrackIconMarkup(humTrackInstrument, { className: "humTrackRecordIco" });
}

function syncHumTrackUi() {
  const sheet = el("humTrackSheet");
  if (!sheet) return;
  const hasRecording = Boolean(humTrackBlob && humTrackBlob.size > 0);
  const isRecording = Boolean(humTrackRecorder && humTrackRecorder.state === "recording");
  const statusEl = el("humTrackRecordStatus");
  const metaEl = el("humTrackRecordMeta");
  const btnRecord = el("btnHumTrackRecord");
  const btnGenerate = el("btnHumTrackGenerate");
  const chipRow = el("humTrackInstrumentRow");

  syncHumTrackRecordIcon();

  if (chipRow) {
    chipRow.querySelectorAll("[data-hum-instrument]").forEach((btn) => {
      const id = btn.getAttribute("data-hum-instrument") || "";
      const active = id === humTrackInstrument;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
      const iconHost = btn.querySelector(".humTrackChipIco");
      if (iconHost) iconHost.innerHTML = humTrackIconMarkup(id, { className: "humTrackChipSvg" });
    });
  }

  if (btnRecord) {
    btnRecord.classList.toggle("isRecording", isRecording);
    btnRecord.setAttribute("aria-label", isRecording ? "Stop recording" : "Record hum");
  }

  if (statusEl) {
    if (humTrackGenerating) {
      statusEl.textContent = "Generating in the background — check the Coach orb.";
    } else if (isRecording) {
      statusEl.textContent = "Recording… hum your melody, then tap again to stop.";
    } else if (hasRecording) {
      statusEl.textContent = "Melody captured. Tap Generate when ready.";
    } else {
      statusEl.textContent = "Hum a short melody (15–30 seconds works best).";
    }
  }

  if (metaEl) {
    if (hasRecording && !isRecording) {
      const kb = Math.max(1, Math.round(humTrackBlob.size / 1024));
      const src = humTrackSource === "upload" ? "Uploaded" : "Recorded";
      metaEl.textContent = `${instrumentLabel(humTrackInstrument)} · ${src} · ${kb} KB`;
      metaEl.hidden = false;
    } else {
      metaEl.textContent = "";
      metaEl.hidden = true;
    }
  }

  if (btnGenerate) {
    btnGenerate.disabled = humTrackGenerating || !hasRecording || isRecording;
    btnGenerate.textContent = humTrackGenerating ? "Generating…" : "Generate track";
  }

  sheet.querySelectorAll("[data-hum-track-dismiss]").forEach((node) => {
    if (node instanceof HTMLButtonElement) node.disabled = humTrackGenerating;
  });
}

function resetHumTrackSession() {
  stopHumTrackRecording(false);
  humTrackBlob = null;
  humTrackSource = "";
  humTrackInstrument = "piano";
  humTrackTaskId = "";
  humTrackGenerating = false;
  stopHumTrackPolling();
  const sheet = el("humTrackSheet");
  sheet?.classList.remove("isGenerating");
  syncHumTrackUi();
}

function stopHumTrackPolling() {
  if (humTrackPollTimer) {
    clearInterval(humTrackPollTimer);
    humTrackPollTimer = null;
  }
}

function stopHumTrackRecording(finalize = true) {
  humTrackRecordSession += 1;
  try {
    if (humTrackRecorder && humTrackRecorder.state !== "inactive") {
      humTrackRecorder.stop();
    }
  } catch {}
  if (!finalize) {
    humTrackRecorder = null;
    humTrackChunks = [];
  }
  try {
    if (humTrackStream) {
      for (const tr of humTrackStream.getTracks()) tr.stop();
    }
  } catch {}
  humTrackStream = null;
}

function dismissHumTrackSheetToCreate() {
  const sheet = el("humTrackSheet");
  if (sheet) {
    sheet.hidden = true;
    sheet.setAttribute("aria-hidden", "true");
    sheet.classList.remove("isGenerating");
    document.body.classList.remove("humTrackSheetOpen");
  }
  try {
    location.hash = "#/challenges";
  } catch {}
  ctx?.scheduleApplyRoute?.();
}

function trackFromSunoRow(raw) {
  if (!raw || typeof raw !== "object") return null;
  const audioUrl =
    raw.sourceAudioUrl ||
    raw.source_audio_url ||
    raw.sourceStreamAudioUrl ||
    raw.source_stream_audio_url ||
    raw.audioUrl ||
    raw.audio_url ||
    raw.streamAudioUrl ||
    raw.stream_audio_url ||
    "";
  if (!audioUrl) return null;
  const imageUrl =
    raw.sourceImageUrl ||
    raw.source_image_url ||
    raw.imageUrl ||
    raw.image_url ||
    raw.coverUrl ||
    raw.cover_url ||
    "";
  const title = raw.title || raw.songTitle || raw.song_title || "";
  const audioId = raw.id || raw.audioId || raw.audio_id || raw.songId || raw.song_id || "";
  return { audioUrl, imageUrl, title, audioId };
}

function parseSunoStatusPayload(data) {
  const inner = data?.data || data || {};
  const status = String(inner.status || data?.status || "").toUpperCase();
  const successFlag = String(inner.successFlag || data?.successFlag || "").toUpperCase();
  const errorMessage = String(
    inner.errorMessage || data?.errorMessage || inner.msg || data?.msg || data?.error || "",
  ).trim();
  const genData =
    inner.response?.sunoData ||
    inner.response?.suno_data ||
    data?.data?.response?.sunoData ||
    data?.data?.response?.suno_data ||
    inner.sunoData ||
    [];
  const list = Array.isArray(genData) ? genData : [];
  const tracks = [];
  for (let i = 0; i < list.length && i < 2; i++) {
    const t = trackFromSunoRow(list[i]);
    if (t) tracks.push(t);
  }
  if (!tracks.length) {
    const fallback = trackFromSunoRow(inner.response || inner);
    if (fallback) tracks.push(fallback);
  }
  return {
    status,
    successFlag,
    errorMessage,
    tracks,
    hasAudio: tracks.length > 0,
  };
}

function finishHumTrackSuccess(taskId, instrumentId, tracks) {
  stopHumTrackPolling();
  humTrackGenerating = false;
  humTrackTaskId = "";
  const label = instrumentLabel(instrumentId);
  const baseTitle = `Hum Track · ${label}`;
  const savedEntries = [];
  tracks.slice(0, 2).forEach((t, i) => {
    const fallbackTitle = i === 0 ? baseTitle : `${baseTitle} B`;
    const title = String(t.title || "").trim() || fallbackTitle;
    const proxyUrl = ctx.toAudioProxyUrl(t.audioUrl);
    savedEntries.push(
      ctx.addToLibrary({
        title,
        artUrl: t.imageUrl || "",
        url: proxyUrl || t.audioUrl,
        taskId,
        audioId: t.audioId || "",
        kind: "instrumental",
        meta: {
          humTrack: true,
          instrument: instrumentId,
          instrumentLabel: label,
          variant: i === 0 ? "A" : "B",
        },
      }),
    );
  });
  ctx?.clearGenerationPending?.(taskId);
  try {
    ctx?.pushLocalGenerationReadyActivity?.(savedEntries.filter(Boolean));
  } catch {
    try {
      ctx?.finishCoachGenerationReady?.({ variantCount: savedEntries.filter(Boolean).length || 1 });
    } catch {}
  }
  try {
    ctx?.voidRefreshProfile?.();
  } catch {}
  const n = savedEntries.filter(Boolean).length;
  ctx?.showToast?.(
    n > 1 ? `${label} tracks are ready in your library.` : `${label} track is ready in your library.`,
    { icon: "✓", durationMs: 5200 },
  );
}

function failHumTrackGeneration(taskId, message) {
  stopHumTrackPolling();
  humTrackGenerating = false;
  humTrackTaskId = "";
  ctx?.clearGenerationPending?.(taskId);
  try {
    ctx?.cancelCoachGenerationStatus?.();
  } catch {}
  ctx?.showToast?.(message || "Generation failed. Try recording again.", {
    icon: "✗",
    durationMs: 9000,
  });
}

function startHumTrackPolling(taskId, instrumentId) {
  stopHumTrackPolling();
  let tries = 0;
  const maxTries = 160;
  humTrackPollTimer = setInterval(async () => {
    tries += 1;
    try {
      const r = await fetch(ctx.apiUrl(`/api/suno/status?taskId=${encodeURIComponent(taskId)}`));
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || "Status check failed");
      const state = parseSunoStatusPayload(data);
      const failed =
        state.status === "FAILED" ||
        (state.successFlag &&
          state.successFlag !== "SUCCESS" &&
          state.successFlag !== "PENDING" &&
          state.successFlag !== "TEXT_SUCCESS" &&
          state.successFlag !== "FIRST_SUCCESS" &&
          !state.hasAudio);
      if (failed && !state.hasAudio) {
        failHumTrackGeneration(taskId, state.errorMessage || "Generation failed. Try recording again.");
        return;
      }
      if (state.status === "SUCCESS" && state.hasAudio) {
        finishHumTrackSuccess(taskId, instrumentId, state.tracks);
        return;
      }
      if (tries >= maxTries) {
        try {
          ctx?.bumpCoachGenerationStillWorking?.();
        } catch {}
        ctx?.showToast?.("Still creating — the Coach will notify you when it's ready.", {
          durationMs: 6000,
        });
        stopHumTrackPolling();
      }
    } catch (err) {
      if (tries >= 10) {
        failHumTrackGeneration(taskId, err?.message || "Lost connection while generating.");
      }
    }
  }, 4500);
}

function armHumTrackGeneration(taskId, instrumentId, label) {
  humTrackTaskId = taskId;
  humTrackGenerating = true;
  ctx?.setGenerationPending?.({
    taskId,
    title: `Hum Track · ${label}`,
    variantCount: ctx?.generationVariantCount || 2,
    source: "hum_track",
    instrumentId,
  });
  ctx?.syncGenerationPendingLibraryUi?.();
  try {
    ctx?.beginCoachGenerationStatus?.({
      variantCount: ctx?.generationVariantCount || 2,
      pillText: ctx?.coachHumTrackGeneratingPillText?.(label),
    });
  } catch {}
  dismissHumTrackSheetToCreate();
  startHumTrackPolling(taskId, instrumentId);
}

async function submitHumTrackGeneration() {
  if (humTrackGenerating) return;
  if (!humTrackBlob || !humTrackBlob.size) {
    ctx?.showToast?.("Record a hum first.", { icon: "!", durationMs: 4000 });
    return;
  }
  const usable = await humBlobLooksUsable(humTrackBlob);
  if (!usable) {
    ctx?.showToast?.(
      "Your hum looks empty or too quiet — re-record, upload an audio file, or try on your iPhone.",
      { icon: "!", durationMs: 8000 },
    );
    return;
  }
  if (!ctx?.getAuthSession?.()?.user?.id) {
    ctx?.setPostAuthReturnHash?.("#/challenges");
    try {
      location.hash = "#/auth";
    } catch {}
    ctx?.scheduleApplyRoute?.();
    return;
  }

  humTrackGenerating = true;
  el("humTrackSheet")?.classList.add("isGenerating");
  syncHumTrackUi();
  ctx?.haptic?.("impact");

  const instrumentId = humTrackInstrument;
  const preset = getHumTrackPreset(instrumentId);
  const label = preset.label;
  const sendFile = new File([humTrackBlob], vocalFilenameForMime(humTrackBlob.type), {
    type: humTrackBlob.type || "audio/webm",
  });

  try {
    await ctx.trackCreditsAround("Hum Track", async () => {
      const fd = new FormData();
      fd.append("action", "add_instrumental");
      fd.append("referenceMode", "vocal_instrumental");
      fd.append("instrumentPreset", instrumentId);
      fd.append("style", preset.style);
      fd.append("negativeTags", preset.negativeTags);
      fd.append("file", sendFile, sendFile.name);
      fd.append("fileName", sendFile.name);
      fd.append("fileType", sendFile.type);
      fd.append("title", `Hum Track · ${label}`);
      fd.append("model", ctx.latestSunoModel || "V5_5");
      fd.append("audioWeight", "0.95");
      fd.append("styleWeight", "0.22");
      const fp = await ctx.computeBytesFingerprint(sendFile);
      if (fp) fd.append("clientFingerprint", fp);

      const tok = ctx.getSupabaseAuthToken?.();
      const rr = await fetch(ctx.apiUrl("/api/suno/stems"), {
        method: "POST",
        headers: tok ? { Authorization: `Bearer ${tok}` } : undefined,
        body: fd,
      });
      const dd = await rr.json().catch(() => ({}));
      if (rr.status === 402 || dd?.code === "insufficient_credits") {
        const need = Number(dd?.needed ?? 10);
        const have = Number(dd?.balance || 0);
        throw new Error(
          `Not enough credits (you have ${have}, need ${need}). Open Profile → Credits to redeem a code.`,
        );
      }
      if (!rr.ok) {
        const more = dd?.detailMessage || dd?.details?.message || dd?.details?.error || dd?.error || "";
        throw new Error(more || "Upload failed");
      }
      if (typeof dd?.code !== "undefined" && Number(dd.code) !== 200) {
        throw new Error(dd?.msg || dd?.message || "Generation failed to start");
      }
      const taskId = ctx.extractTaskIdLoose(dd);
      if (!taskId) throw new Error("No task id returned from server");
      armHumTrackGeneration(taskId, instrumentId, label);
    });
  } catch (e) {
    humTrackGenerating = false;
    humTrackTaskId = "";
    el("humTrackSheet")?.classList.remove("isGenerating");
    syncHumTrackUi();
    ctx?.showToast?.(e?.message || "Could not start generation.", { icon: "✗", durationMs: 9000 });
  }
}

function resumeHumTrackIfPending() {
  const pending = ctx?.getGenerationPending?.();
  if (!pending?.taskId || pending.source !== "hum_track") return;
  humTrackTaskId = pending.taskId;
  humTrackInstrument = pending.instrumentId || "piano";
  humTrackGenerating = true;
  const label = instrumentLabel(humTrackInstrument);
  try {
    ctx?.beginCoachGenerationStatus?.({
      variantCount: pending.variantCount || ctx?.generationVariantCount || 2,
      pillText: ctx?.coachHumTrackGeneratingPillText?.(label),
    });
  } catch {}
  startHumTrackPolling(pending.taskId, humTrackInstrument);
}

export function openHumTrackSheet() {
  if (humTrackGenerating) {
    dismissHumTrackSheetToCreate();
    return;
  }
  if (!ctx?.getAuthSession?.()?.user?.id) {
    ctx?.setPostAuthReturnHash?.("#/challenges");
    try {
      location.hash = "#/auth";
    } catch {}
    ctx?.scheduleApplyRoute?.();
    ctx?.showToast?.("Sign in to use Hum Track.", { durationMs: 4500 });
    return;
  }
  ctx?.mountFixedOverlaysToBody?.();
  const sheet = el("humTrackSheet");
  if (!sheet) return;
  resetHumTrackSession();
  sheet.hidden = false;
  sheet.setAttribute("aria-hidden", "false");
  document.body.classList.add("humTrackSheetOpen");
  syncHumTrackUi();
}

export function closeHumTrackSheet() {
  if (humTrackGenerating) {
    dismissHumTrackSheetToCreate();
    return;
  }
  const sheet = el("humTrackSheet");
  if (!sheet) return;
  stopHumTrackRecording(false);
  stopHumTrackPolling();
  sheet.hidden = true;
  sheet.setAttribute("aria-hidden", "true");
  document.body.classList.remove("humTrackSheetOpen");
  resetHumTrackSession();
}

function renderHumTrackInstrumentChips() {
  const row = el("humTrackInstrumentRow");
  if (!row || row.dataset.rendered === "1") return;
  row.dataset.rendered = "1";
  row.innerHTML = HUM_TRACK_INSTRUMENTS.map(
    (inst) =>
      `<button type="button" class="humTrackChip" data-hum-instrument="${inst.id}" aria-pressed="${inst.id === humTrackInstrument ? "true" : "false"}"><span class="humTrackChipIco" aria-hidden="true"></span><span class="humTrackChipLabel">${inst.label}</span></button>`,
  ).join("");
}

function wireHumTrackSheetOnce() {
  if (wired) return;
  wired = true;
  renderHumTrackInstrumentChips();

  const sheet = el("humTrackSheet");
  if (!sheet) return;

  sheet.addEventListener("click", (e) => {
    const chip = e.target?.closest?.("[data-hum-instrument]");
    if (chip && sheet.contains(chip)) {
      if (humTrackGenerating) return;
      humTrackInstrument = String(chip.getAttribute("data-hum-instrument") || "piano");
      ctx?.haptic?.("light");
      syncHumTrackUi();
      return;
    }
    if (e.target?.closest?.("[data-hum-track-dismiss]")) {
      closeHumTrackSheet();
      return;
    }
    if (e.target?.closest?.("#btnHumTrackRecord")) {
      if (humTrackGenerating) return;
      void startHumTrackRecording().catch((err) => {
        ctx?.showToast?.(err?.message || "Microphone access failed.", { icon: "⚠", durationMs: 6000 });
      });
      return;
    }
    if (e.target?.closest?.("#btnHumTrackGenerate")) {
      void submitHumTrackGeneration();
      return;
    }
  });

  el("humTrackUploadInput")?.addEventListener("change", (e) => {
    const file = e.target?.files?.[0];
    if (!file || humTrackGenerating) return;
    stopHumTrackRecording(false);
    humTrackBlob = file;
    humTrackSource = "upload";
    void (async () => {
      const ok = await humBlobLooksUsable(humTrackBlob);
      if (!ok) {
        humTrackBlob = null;
        humTrackSource = "";
        ctx?.showToast?.("That file looks empty or too quiet — try another take.", { icon: "!", durationMs: 6000 });
      }
      syncHumTrackUi();
    })();
    syncHumTrackUi();
    try {
      e.target.value = "";
    } catch {}
  });

  el("btnCloseHumTrack")?.addEventListener("click", () => {
    closeHumTrackSheet();
  });

  resumeHumTrackIfPending();
}

async function startHumTrackRecording() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone needs the NabadAi app or a secure (HTTPS) page.");
  }
  if (humTrackRecorder && humTrackRecorder.state === "recording") {
    humTrackRecorder.stop();
    return;
  }

  humTrackRecordSession += 1;
  const session = humTrackRecordSession;
  humTrackBlob = null;
  humTrackSource = "";
  humTrackChunks = [];

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: { ideal: true },
        noiseSuppression: { ideal: true },
        autoGainControl: { ideal: true },
      },
      video: false,
    });
  }

  if (session !== humTrackRecordSession) {
    try {
      for (const tr of stream.getTracks()) tr.stop();
    } catch {}
    return;
  }

  humTrackStream = stream;
  const mime = ctx?.pickRecorderMimeType?.() || "";
  humTrackRecorder = mime
    ? new MediaRecorder(stream, { mimeType: mime })
    : new MediaRecorder(stream);

  humTrackRecorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) humTrackChunks.push(ev.data);
  };
  humTrackRecorder.onstop = () => {
    try {
      for (const tr of humTrackStream?.getTracks?.() || []) tr.stop();
    } catch {}
    humTrackStream = null;
    humTrackRecorder = null;
    if (session !== humTrackRecordSession) return;
    const type = humTrackChunks[0]?.type || mime || "audio/webm";
    const blob = new Blob(humTrackChunks, { type });
    humTrackChunks = [];
    if (blob.size > 0) {
      humTrackBlob = blob;
      humTrackSource = "record";
    }
    void (async () => {
      if (!humTrackBlob) return;
      const ok = await humBlobLooksUsable(humTrackBlob);
      if (!ok) {
        humTrackBlob = null;
        humTrackSource = "";
        ctx?.showToast?.(
          "That recording looks empty or too quiet. On the simulator, use Upload hum or test on your iPhone.",
          { icon: "!", durationMs: 8000 },
        );
      }
      syncHumTrackUi();
    })();
    syncHumTrackUi();
  };

  humTrackRecorder.start(250);
  ctx?.haptic?.("light");
  syncHumTrackUi();
}

export function initHumTrack(deps) {
  ctx = deps || {};
  wireHumTrackSheetOnce();
}

export function bindHumTrackHomeCard(page) {
  if (!page || page.dataset.boundHumTrackCard === "1") return;
  page.dataset.boundHumTrackCard = "1";
  page.addEventListener("click", (e) => {
    const card = e.target?.closest?.("[data-home-card=\"humtrack\"]");
    if (!card || !page.contains(card)) return;
    ctx?.haptic?.("light");
    ctx?.recordCreateActivity?.("humtrack");
    openHumTrackSheet();
  });
}
