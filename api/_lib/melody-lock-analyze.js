/**
 * Server-side monophonic analyze: Basic Pitch worker or fixture stub.
 *
 * Basic Pitch is Spotify's open-source MIT library — self-hosted worker only;
 * no Spotify API and no Spotify billing.
 */
const { inferSimpleKey, summarizeContour } = require("./melody-lock-prompt");

const FIXTURE_MELODY = Object.freeze({
  tempoBpm: 92,
  meter: "4/4",
  notes: [
    { startBeat: 0, durationBeats: 1, midi: 62 },
    { startBeat: 1, durationBeats: 0.5, midi: 64 },
    { startBeat: 1.5, durationBeats: 0.5, midi: 65 },
    { startBeat: 2, durationBeats: 1, midi: 64 },
    { startBeat: 3, durationBeats: 1, midi: 62 },
    { startBeat: 4, durationBeats: 0.5, midi: 59 },
    { startBeat: 4.5, durationBeats: 0.5, midi: 62 },
    { startBeat: 5, durationBeats: 2, midi: 64 },
  ],
});

function useFixtureAnalyze() {
  const force = String(process.env.MELODY_LOCK_USE_FIXTURE || "").trim();
  if (force === "1" || force.toLowerCase() === "true") return true;
  const url = String(process.env.MELODY_LOCK_BASIC_PITCH_URL || "").trim();
  return !url;
}

function quantizeNoteEvents(events, tempoBpm) {
  const bpm = Number(tempoBpm) || 96;
  const secPerBeat = 60 / bpm;
  const quantStep = 0.25;
  const notes = [];
  for (const ev of events || []) {
    const startSec = Number(ev.start_sec ?? ev.start ?? 0);
    const endSec = Number(ev.end_sec ?? ev.end ?? startSec + 0.12);
    const midi = Number(ev.pitch_midi ?? ev.midi ?? ev.pitch);
    if (!Number.isFinite(midi)) continue;
    const startBeat = Math.round((startSec / secPerBeat) / quantStep) * quantStep;
    const durBeats = Math.max(
      quantStep,
      Math.round(((endSec - startSec) / secPerBeat) / quantStep) * quantStep,
    );
    notes.push({ startBeat, durationBeats: durBeats, midi: Math.round(midi) });
  }
  notes.sort((a, b) => a.startBeat - b.startBeat);
  return notes;
}

function buildMelodyFromWorkerPayload(payload) {
  const tempoBpm = Math.round(Number(payload?.bpm ?? payload?.tempoBpm) || 96);
  const meter = payload?.meter === "6/8" ? "6/8" : "4/4";
  const events = payload?.notes || payload?.note_events || payload?.events || [];
  const notes = Array.isArray(events) && events[0]?.startBeat != null
    ? events
    : quantizeNoteEvents(events, tempoBpm);
  const inferredKey = String(payload?.key || payload?.inferred_key || "").trim() || inferSimpleKey(notes);
  return {
    tempoBpm,
    meter,
    notes,
    inferredKey,
    contourSummary: summarizeContour(notes),
  };
}

function analyzeWithFixture() {
  const notes = FIXTURE_MELODY.notes.map((n) => ({ ...n }));
  const inferredKey = inferSimpleKey(notes);
  return {
    ok: true,
    provider: "fixture",
    melody: {
      tempoBpm: FIXTURE_MELODY.tempoBpm,
      meter: FIXTURE_MELODY.meter,
      notes,
      inferredKey,
      contourSummary: summarizeContour(notes),
    },
  };
}

async function analyzeWithBasicPitchWorker({ audioBase64, mimeType, sourceKind }) {
  const url = String(process.env.MELODY_LOCK_BASIC_PITCH_URL || "").trim();
  if (!url) return analyzeWithFixture();

  const timeoutMs = Number(process.env.MELODY_LOCK_ANALYZE_TIMEOUT_MS) || 45_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audio_base64: audioBase64,
        mime_type: mimeType || "audio/webm",
        source_kind: sourceKind,
        max_duration_sec: 25,
      }),
      signal: controller.signal,
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      return {
        ok: false,
        error: data?.error || `Basic Pitch worker HTTP ${r.status}`,
      };
    }
    const melody = buildMelodyFromWorkerPayload(data);
    if (!melody.notes?.length) {
      return { ok: false, error: "No notes detected in the recording." };
    }
    return { ok: true, provider: "basic_pitch", melody };
  } catch (e) {
    const msg = e?.name === "AbortError" ? "Analyze timed out." : e?.message || String(e);
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

async function analyzeHumAudio({ audioBase64, mimeType, sourceKind }) {
  if (useFixtureAnalyze()) {
    return analyzeWithFixture();
  }
  return analyzeWithBasicPitchWorker({ audioBase64, mimeType, sourceKind });
}

module.exports = {
  analyzeHumAudio,
  analyzeWithFixture,
  buildMelodyFromWorkerPayload,
  FIXTURE_MELODY,
  useFixtureAnalyze,
};
