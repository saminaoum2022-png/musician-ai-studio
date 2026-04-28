/**
 * Vercel Serverless Function: AI arrangement generator.
 *
 * Env:
 * - OPENAI_API_KEY
 */

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Missing OPENAI_API_KEY on server" }));
      return;
    }

    const body = await readJson(req);
    const params = body?.params || body || {};

    const prompt = buildPrompt(params);

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: body?.model || "gpt-4.1-mini",
        input: prompt,
        temperature: 0.7,
      }),
    });

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Upstream AI error", status: r.status, details: text.slice(0, 2000) }));
      return;
    }

    const data = await r.json();
    const out = extractText(data);

    let arrangement;
    try {
      arrangement = JSON.parse(stripCodeFences(out));
    } catch (e) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "AI returned non-JSON", sample: out.slice(0, 2000) }));
      return;
    }

    const validated = validateArrangement(arrangement, params);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(validated));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: e?.message || String(e) }));
  }
};

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function extractText(data) {
  // Responses API can return text in output_text or in nested output array.
  if (typeof data?.output_text === "string") return data.output_text;
  const parts = [];
  for (const o of data?.output || []) {
    for (const c of o?.content || []) {
      if (c?.type === "output_text" && typeof c?.text === "string") parts.push(c.text);
    }
  }
  return parts.join("\n").trim();
}

function stripCodeFences(s) {
  return String(s || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function buildPrompt(params) {
  const safe = {
    style: String(params.style || "arabic-pop"),
    bpm: clampInt(Number(params.bpm || 96), 60, 180),
    bars: clampInt(Number(params.bars || 32), 8, 128),
    keyCenter: String(params.keyCenter || "D"),
    scale: String(params.scale || "harmonic_minor"),
    meter: params.meter === "6/8" ? "6/8" : "4/4",
    lyrics: String(params.lyrics || "").slice(0, 1000),
  };

  // IMPORTANT: match src/types.js Arrangement shape.
  return [
    "You are composing an instrumental arrangement for a web app.",
    "Return ONLY valid JSON (no markdown, no commentary).",
    "",
    "Schema (must match exactly):",
    "{",
    '  "params": { "style": string, "bpm": number, "bars": number, "keyCenter": string, "scale": string, "meter": "4/4"|"6/8", "lyrics"?: string },',
    '  "beatsPerBar": number,',
    '  "totalBeats": number,',
    '  "sections": [{ "name": string, "startBar": number, "bars": number }],',
    '  "chords": [{ "rootMidi": number, "quality": "min"|"maj"|"sus2"|"sus4"|"7", "durationBeats": number }],',
    '  "notes": [{ "startBeat": number, "durationBeats": number, "midi": number, "velocity": number, "instrument": "oud"|"violin"|"piano" }],',
    '  "perc": [{ "startBeat": number, "durationBeats": number, "type": "dum"|"tek"|"rest", "velocity": number }]',
    "}",
    "",
    "Constraints:",
    "- totalBeats = bars * beatsPerBar",
    "- beatsPerBar = 4 for 4/4, 6 for 6/8",
    "- Keep midi notes in [48..88] mostly",
    "- velocity in [0.05..1.0]",
    "- notes and perc must not exceed totalBeats",
    "- chords should cover the full duration by summing durationBeats to totalBeats (or very close)",
    "- Use lyrics (if present) to influence rhythmic density and phrasing (Arabic pop feel if style is arabic-pop).",
    "",
    "User params:",
    JSON.stringify(safe),
  ].join("\n");
}

function validateArrangement(a, fallbackParams) {
  if (!a || typeof a !== "object") throw new Error("Invalid arrangement");
  const params = a.params && typeof a.params === "object" ? a.params : fallbackParams || {};
  const meter = params.meter === "6/8" ? "6/8" : "4/4";
  const beatsPerBar = meter === "6/8" ? 6 : 4;
  const bars = clampInt(Number(params.bars || 32), 8, 128);
  const totalBeats = bars * beatsPerBar;

  const out = {
    params: {
      style: String(params.style || "arabic-pop"),
      bpm: clampInt(Number(params.bpm || 96), 60, 180),
      bars,
      keyCenter: String(params.keyCenter || "D"),
      scale: String(params.scale || "harmonic_minor"),
      meter,
      ...(params.lyrics ? { lyrics: String(params.lyrics) } : {}),
    },
    beatsPerBar,
    totalBeats,
    sections: Array.isArray(a.sections) ? a.sections : [],
    chords: Array.isArray(a.chords) ? a.chords : [],
    notes: Array.isArray(a.notes) ? a.notes : [],
    perc: Array.isArray(a.perc) ? a.perc : [],
  };

  out.sections = out.sections
    .filter((s) => s && typeof s === "object")
    .map((s) => ({
      name: String(s.name || "A"),
      startBar: clampInt(Number(s.startBar || 0), 0, bars),
      bars: clampInt(Number(s.bars || 4), 0, bars),
    }))
    .filter((s) => s.bars > 0);

  out.chords = out.chords
    .filter((c) => c && typeof c === "object")
    .map((c) => ({
      rootMidi: clampInt(Number(c.rootMidi || 50), 24, 96),
      quality: ["min", "maj", "sus2", "sus4", "7"].includes(c.quality) ? c.quality : "min",
      durationBeats: clampNum(Number(c.durationBeats || beatsPerBar), 0.25, beatsPerBar * 4),
    }));

  out.notes = out.notes
    .filter((n) => n && typeof n === "object")
    .map((n) => ({
      startBeat: clampNum(Number(n.startBeat || 0), 0, totalBeats),
      durationBeats: clampNum(Number(n.durationBeats || 1), 0.05, totalBeats),
      midi: clampInt(Number(n.midi || 60), 24, 108),
      velocity: clampNum(Number(n.velocity || 0.6), 0.05, 1),
      instrument: ["oud", "violin", "piano"].includes(n.instrument) ? n.instrument : "oud",
    }))
    .filter((n) => n.startBeat < totalBeats);

  out.perc = out.perc
    .filter((p) => p && typeof p === "object")
    .map((p) => ({
      startBeat: clampNum(Number(p.startBeat || 0), 0, totalBeats),
      durationBeats: clampNum(Number(p.durationBeats || 0.5), 0.05, beatsPerBar),
      type: ["dum", "tek", "rest"].includes(p.type) ? p.type : "rest",
      velocity: clampNum(Number(p.velocity || 0.4), 0.0, 1),
    }))
    .filter((p) => p.startBeat < totalBeats && p.type !== "rest");

  // Ensure chords cover the duration; if missing, keep local generator behavior as fallback.
  if (!out.chords.length) {
    out.chords = [{ rootMidi: 50, quality: "min", durationBeats: totalBeats }];
  }

  return out;
}

function clampInt(n, min, max) {
  const x = Number.isFinite(n) ? Math.round(n) : min;
  return Math.max(min, Math.min(max, x));
}

function clampNum(n, min, max) {
  const x = Number.isFinite(n) ? n : min;
  return Math.max(min, Math.min(max, x));
}
