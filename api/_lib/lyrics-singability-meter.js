/** Line-length / section stats for singability prompts (Node, mirrors client heuristics). */

const SECTION_TAG_RE = /^\[(.+?)\]\s*$/i;

function parseLyricSections(text) {
  const sections = [];
  let current = { name: "Lyrics", lines: [] };
  for (const raw of String(text || "").split("\n")) {
    const line = raw.trimEnd();
    const tag = line.trim().match(SECTION_TAG_RE);
    if (tag) {
      if (current.lines.length) sections.push(current);
      current = { name: String(tag[1] || "Section").trim(), lines: [] };
      continue;
    }
    const trimmed = line.trim();
    if (trimmed) current.lines.push(trimmed);
  }
  if (current.lines.length) sections.push(current);
  return sections;
}

function syllableProxy(line) {
  const words = String(line || "").trim().split(/\s+/).filter(Boolean);
  const chars = String(line || "").replace(/\s/g, "");
  return words.length + Math.ceil([...chars].length / 4);
}

function statsForLines(lines) {
  const wordCounts = lines.map((l) => String(l).trim().split(/\s+/).filter(Boolean).length);
  const beats = lines.map((l) => syllableProxy(l));
  const min = (arr) => (arr.length ? Math.min(...arr) : 0);
  const max = (arr) => (arr.length ? Math.max(...arr) : 0);
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  return {
    lineCount: lines.length,
    wordsMin: min(wordCounts),
    wordsMax: max(wordCounts),
    wordsAvg: Math.round(avg(wordCounts) * 10) / 10,
    beatsMin: min(beats),
    beatsMax: max(beats),
    beatsAvg: Math.round(avg(beats) * 10) / 10,
  };
}

function computeLyricsMeterProfile(text) {
  const sections = parseLyricSections(text);
  const sectionStats = sections
    .filter((s) => s.lines.length)
    .map((s) => ({
      name: s.name,
      ...statsForLines(s.lines),
    }));
  const allBeats = sections.flatMap((s) => s.lines.map((l) => syllableProxy(l)));
  const allWords = sections.flatMap((s) => s.lines.map((l) => String(l).trim().split(/\s+/).filter(Boolean).length));
  const overall = {
    totalLines: allBeats.length,
    beatsMin: allBeats.length ? Math.min(...allBeats) : 0,
    beatsMax: allBeats.length ? Math.max(...allBeats) : 0,
    beatsAvg: allBeats.length
      ? Math.round((allBeats.reduce((a, b) => a + b, 0) / allBeats.length) * 10) / 10
      : 0,
    wordsMin: allWords.length ? Math.min(...allWords) : 0,
    wordsMax: allWords.length ? Math.max(...allWords) : 0,
    wordsAvg: allWords.length
      ? Math.round((allWords.reduce((a, b) => a + b, 0) / allWords.length) * 10) / 10
      : 0,
  };
  return { sections: sectionStats, overall };
}

function formatMeterProfileForPrompt(profile) {
  const p = profile || { sections: [], overall: {} };
  const lines = [];
  for (const s of p.sections || []) {
    lines.push(
      `${s.name}: ${s.lineCount} lines · ~${s.wordsMin}–${s.wordsMax} words/line (avg ${s.wordsAvg}) · ~${s.beatsMin}–${s.beatsMax} speakable beats/line (avg ${s.beatsAvg})`,
    );
  }
  const o = p.overall || {};
  if (o.totalLines) {
    lines.push(
      `Overall: ${o.totalLines} sung lines · words/line ~${o.wordsMin}–${o.wordsMax} (avg ${o.wordsAvg}) · beats/line ~${o.beatsMin}–${o.beatsMax} (avg ${o.beatsAvg})`,
    );
  }
  return lines.join("\n");
}

/** Rough BPM band from average beat proxy (for local fallback only). */
function guessBpmBandFromProfile(profile) {
  const avg = Number(profile?.overall?.beatsAvg) || 0;
  if (avg <= 0) return "";
  if (avg <= 7) return "118–128";
  if (avg <= 9) return "100–112";
  if (avg <= 11) return "88–98";
  return "76–88";
}

function localRecommendationsFromProfile(profile, { arabic = false } = {}) {
  const o = profile?.overall || {};
  if (!o.totalLines) return null;
  const bpm = guessBpmBandFromProfile(profile);
  const lineLength = arabic
    ? `طول السطر: ~${o.wordsMin}–${o.wordsMax} كلمة (${o.wordsAvg} تقريباً) · ~${o.beatsMin}–${o.beatsMax} مقطع/نبضة (${o.beatsAvg} تقريباً) — ثبّت الوزن بين الأسطر المتقابلة.`
    : `Line length: ~${o.wordsMin}–${o.wordsMax} words (avg ${o.wordsAvg}) · ~${o.beatsMin}–${o.beatsMax} speakable beats (avg ${o.beatsAvg}) — keep paired lines similar.`;
  const rhythm = arabic
    ? "إيقاع مقترح: 4/4 خفيف — ملفوف/دبكة لو الكلمات قصيرة وسريعة، أو بلوز/بوب لو الأسطر أطول."
    : "Rhythm: light 4/4 — dabke/malfuf feel if lines are short and punchy, or mid-tempo pop if lines are longer.";
  const bpmLine = bpm
    ? (arabic ? `BPM تقريبي: ${bpm} (نقطة بداية للـ Create/Style).` : `Suggested BPM: ${bpm} (starting point for Create style).`)
    : "";
  const feel = arabic
    ? "حركة: رقص خفيف على الكورس إذا الـ hook قصير ومتكرر."
    : "Feel: light dance on the chorus if the hook is short and repeatable.";
  return {
    lineLength,
    rhythm,
    bpm: bpmLine || (arabic ? "BPM: جرّب 90–110 حسب طول السطر." : "BPM: try 90–110 depending on line length."),
    feel,
    notes: "",
  };
}

module.exports = {
  computeLyricsMeterProfile,
  formatMeterProfileForPrompt,
  localRecommendationsFromProfile,
  guessBpmBandFromProfile,
};
