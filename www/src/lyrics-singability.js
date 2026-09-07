/** Local + merged singability helpers for lyrics before AI singing. */

import { looksLikeArabizi, normalizeArabiziRhymeKey } from "./arabizi.js";

const SECTION_TAG_RE = /^\[(.+?)\]\s*$/i;

export function parseLyricSections(text) {
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

function rhymeKey(word) {
  const w = String(word || "").replace(/[^\u0600-\u06FFa-zA-Z0-9']/g, "");
  if (!w) return "";
  if (/[a-z0-9]/i.test(w) && !/[\u0600-\u06FF]/.test(w)) {
    return normalizeArabiziRhymeKey(w);
  }
  if (w.length < 2) return w.toLowerCase();
  return w.slice(-2).toLowerCase();
}

export { looksLikeArabizi };

function lastWord(line) {
  const parts = String(line || "").trim().split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || "";
}

function sameRhyme(a, b) {
  return Boolean(a && b && a === b);
}

export function hasLyricSectionTags(text) {
  return /\[(verse|chorus|bridge|outro|intro|final chorus|pre-chorus|hook|refrain)/i.test(String(text || ""));
}

export function detectRhymeScheme(lines) {
  const keys = lines.map((line) => rhymeKey(lastWord(line)));
  const n = keys.length;
  if (n < 2) return "unknown";
  if (n === 2) return sameRhyme(keys[0], keys[1]) ? "AA" : "free";
  if (n === 3) {
    if (sameRhyme(keys[0], keys[1]) && sameRhyme(keys[1], keys[2])) return "AAAA";
    if (sameRhyme(keys[0], keys[1])) return "AAX";
    if (sameRhyme(keys[1], keys[2])) return "XAA";
    if (sameRhyme(keys[0], keys[2])) return "ABA";
    return "free";
  }

  const [k1, k2, k3, k4] = keys;
  if (sameRhyme(k1, k2) && sameRhyme(k2, k3) && sameRhyme(k3, k4)) return "AAAA";
  if (sameRhyme(k1, k2) && sameRhyme(k2, k3) && !sameRhyme(k1, k4)) return "AAAB";
  if (sameRhyme(k1, k2) && sameRhyme(k1, k4) && !sameRhyme(k1, k3)) return "AABA";
  if (sameRhyme(k1, k2) && sameRhyme(k3, k4)) return "AABB";
  if (sameRhyme(k1, k3) && sameRhyme(k2, k4) && k1 !== k2) return "ABAB";
  if (sameRhyme(k2, k4) && k2 !== k1 && k2 !== k3) return "ABCB";
  if (sameRhyme(k1, k4) && sameRhyme(k2, k3) && k1 !== k2) return "ABBA";
  if (keys.slice(0, 4).every((k) => sameRhyme(k, k1))) return "AAAA";
  return "free";
}

function rhymePairsForScheme(scheme, lineCount) {
  switch (scheme) {
    case "AABB":
      return lineCount >= 4 ? [[0, 1], [2, 3]] : [[0, 1]];
    case "ABAB":
      return lineCount >= 4 ? [[0, 2], [1, 3]] : [];
    case "ABCB":
      return lineCount >= 4 ? [[1, 3]] : [];
    case "ABBA":
      return lineCount >= 4 ? [[0, 3], [1, 2]] : [];
    case "AAAB":
      return lineCount >= 4 ? [[0, 1], [0, 2], [1, 2]] : [];
    case "AABA":
      return lineCount >= 4 ? [[0, 1], [0, 3], [1, 3]] : [];
    case "AAAA":
    case "AA":
      return Array.from({ length: Math.max(0, lineCount - 1) }, (_, i) => [i, i + 1]);
    default:
      return Array.from({ length: Math.floor(lineCount / 2) }, (_, i) => [i * 2, i * 2 + 1]);
  }
}

/** Levantine-style parallel lines — same opener or mirrored length/وزن. */
function isParallelLine(a, b) {
  const wordsA = String(a || "").trim().split(/\s+/).filter(Boolean);
  const wordsB = String(b || "").trim().split(/\s+/).filter(Boolean);
  if (!wordsA.length || !wordsB.length) return false;
  if (wordsA[0] === wordsB[0] && wordsA.length >= 2 && wordsB.length >= 2) return true;

  const maxWords = Math.max(wordsA.length, wordsB.length, 1);
  if (Math.abs(wordsA.length - wordsB.length) / maxWords > 0.3) return false;

  const syllA = syllableProxy(a);
  const syllB = syllableProxy(b);
  const maxSyll = Math.max(syllA, syllB, 1);
  return Math.abs(syllA - syllB) / maxSyll <= 0.25;
}

function pushWarning(warnings, seen, item) {
  const key = `${item.level}|${item.section}|${item.line || 0}|${item.message}`;
  if (seen.has(key)) return;
  seen.add(key);
  warnings.push(item);
}

/** Fast client-side scan — no network. */
export function computeLocalSingability(text) {
  const warnings = [];
  const seen = new Set();
  const sections = parseLyricSections(text);
  if (!sections.some((s) => s.lines.length >= 2)) {
    return {
      score: null,
      ready: null,
      summary: "",
      warnings: [],
      source: "local",
    };
  }

  for (const section of sections) {
    const name = section.name || "Section";
    const isChorus = /chorus|hook|refrain|لازمة|كورس/i.test(name);
    const lines = section.lines;
    const scheme = detectRhymeScheme(lines);
    const keys = lines.map((line) => rhymeKey(lastWord(line)));

    lines.forEach((line, idx) => {
      const syll = syllableProxy(line);
      if (syll >= 18) {
        pushWarning(warnings, seen, {
          level: "high",
          section: name,
          line: idx + 1,
          message: `Line ${idx + 1} looks long (${syll} beats) — the singer may rush or slur.`,
        });
      } else if (syll >= 14) {
        pushWarning(warnings, seen, {
          level: "medium",
          section: name,
          line: idx + 1,
          message: `Line ${idx + 1} is fairly long — consider shortening for cleaner singing.`,
        });
      }
    });

    const pairs = rhymePairsForScheme(scheme, lines.length);
    for (const [i, j] of pairs) {
      if (j >= lines.length) continue;
      const a = syllableProxy(lines[i]);
      const b = syllableProxy(lines[j]);
      const max = Math.max(a, b, 1);
      const diff = Math.abs(a - b) / max;
      if (diff >= 0.45) {
        pushWarning(warnings, seen, {
          level: isChorus ? "high" : "medium",
          section: name,
          line: j + 1,
          message: `Lines ${i + 1} and ${j + 1} have uneven length — balance وزن/meter for smoother vocals.`,
        });
      }

      const rkA = keys[i];
      const rkB = keys[j];
      if (rkA && rkB && rkA !== rkB) {
        const pairLabel = scheme === "ABCB" ? "rhyme pair (lines 2 & 4)" : "rhyme pair";
        pushWarning(warnings, seen, {
          level: isChorus ? "high" : "medium",
          section: name,
          line: j + 1,
          message: `Lines ${i + 1} and ${j + 1} may not rhyme (قافية) — this section's ${pairLabel} usually shares an ending sound.`,
        });
      }

      if ((scheme === "AABB" || scheme === "ABBA") && !isParallelLine(lines[i], lines[j])) {
        pushWarning(warnings, seen, {
          level: "low",
          section: name,
          line: j + 1,
          message: `Lines ${i + 1} and ${j + 1} could mirror each other more (parallel Levantine couplet / موازي) — same slot and similar مقاطع help vocals lock in.`,
        });
      }
    }

    if (isChorus && lines.length === 1) {
      pushWarning(warnings, seen, {
        level: "low",
        section: name,
        line: 1,
        message: "Section has only one line — add a matching line if you want a paired hook.",
      });
    }

    if (scheme === "free" && lines.length >= 4) {
      const rhymedPairs = pairs.filter(([i, j]) => sameRhyme(keys[i], keys[j])).length;
      if (rhymedPairs === 0) {
        pushWarning(warnings, seen, {
          level: isChorus ? "high" : "medium",
          section: name,
          line: null,
          message: "Rhyme pattern looks loose — pick a clear scheme (AABB, ABAB, ABBA, ABCB, AAAA, AAAB, AABA, etc.) and match it within this section.",
        });
      }
    }
  }

  const high = warnings.filter((w) => w.level === "high").length;
  const medium = warnings.filter((w) => w.level === "medium").length;
  const score = Math.max(35, 100 - high * 18 - medium * 8);
  const ready = high === 0 && medium <= 1;
  const summary = !warnings.length
    ? "Lines look balanced — good for singing."
    : high
      ? `${high} serious issue${high > 1 ? "s" : ""} may make the AI singer stumble.`
      : `${warnings.length} minor tweak${warnings.length > 1 ? "s" : ""} could help vocals land cleaner.`;

  return {
    score,
    ready,
    summary,
    warnings,
    source: "local",
  };
}

export function normalizeSingabilityReport(raw, fallbackText = "") {
  const base = computeLocalSingability(fallbackText);
  if (!raw || typeof raw !== "object") return base;
  const warnings = Array.isArray(raw.warnings)
    ? raw.warnings
      .map((w) => ({
        level: w?.level === "high" || w?.level === "medium" || w?.level === "low" ? w.level : "medium",
        section: String(w?.section || "Lyrics").trim() || "Lyrics",
        line: Number(w?.line) > 0 ? Number(w.line) : null,
        message: String(w?.message || "").trim(),
      }))
      .filter((w) => w.message)
    : base.warnings;
  const scoreRaw = Number(raw.score);
  const score = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : base.score;
  const ready = typeof raw.ready === "boolean" ? raw.ready : score >= 75 && !warnings.some((w) => w.level === "high");
  const summary = String(raw.summary || "").trim() || base.summary;
  return {
    score,
    ready,
    summary,
    warnings: warnings.length ? warnings : base.warnings,
    source: "api",
  };
}

export function singabilityLevelClass(level) {
  if (level === "high") return "isHigh";
  if (level === "low") return "isLow";
  return "isMedium";
}
