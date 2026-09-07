/** Local + merged singability helpers for lyrics before AI singing. */

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
  const w = String(word || "").replace(/[^\u0600-\u06FFa-zA-Z']/g, "");
  if (w.length < 2) return w.toLowerCase();
  return w.slice(-2).toLowerCase();
}

function lastWord(line) {
  const parts = String(line || "").trim().split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || "";
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

    for (let i = 0; i + 1 < lines.length; i += 2) {
      const a = syllableProxy(lines[i]);
      const b = syllableProxy(lines[i + 1]);
      const max = Math.max(a, b, 1);
      const diff = Math.abs(a - b) / max;
      if (diff >= 0.45) {
        pushWarning(warnings, seen, {
          level: isChorus ? "high" : "medium",
          section: name,
          line: i + 2,
          message: `Lines ${i + 1} and ${i + 2} have uneven length — balance وزن/meter for smoother vocals.`,
        });
      }
      const rkA = rhymeKey(lastWord(lines[i]));
      const rkB = rhymeKey(lastWord(lines[i + 1]));
      if (rkA && rkB && rkA !== rkB) {
        pushWarning(warnings, seen, {
          level: isChorus ? "high" : "medium",
          section: name,
          line: i + 2,
          message: `Lines ${i + 1} and ${i + 2} may not rhyme (قافية) — chorus pairs usually share an ending sound.`,
        });
      }
    }

    if (isChorus && lines.length === 1) {
      pushWarning(warnings, seen, {
        level: "low",
        section: name,
        line: 1,
        message: "Chorus has only one line — add a matching rhyming line for a stronger hook.",
      });
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
