/**
 * Build ASS subtitle files for portrait lyric videos (1080×1920).
 * Groups word-level timestamps into lines and burns large synced lyrics.
 */

function escapeAssText(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, "\\N");
}

function formatAssTime(seconds) {
  const t = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  const cs = Math.min(99, Math.round((sec - Math.floor(sec)) * 100));
  const secI = Math.floor(sec);
  return `${h}:${String(m).padStart(2, "0")}:${String(secI).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

/** Group word tokens into renderable lines (mirrors client groupTimedLyricsIntoLines). */
function groupTimedLyricsIntoLines(words) {
  const lines = [];
  let current = null;
  const push = () => {
    if (current && current.text.trim()) lines.push(current);
    current = null;
  };
  const append = (text, startS, endS) => {
    const seg = String(text);
    if (!seg.trim()) return;
    if (/^\[[^\]]+\]$/.test(seg.trim())) {
      push();
      lines.push({
        text: seg.trim().replace(/^\[|\]$/g, ""),
        startS,
        endS,
        isSection: true,
      });
      return;
    }
    if (!current) current = { text: "", startS, endS, isSection: false };
    current.text += (current.text ? " " : "") + seg.trim();
    current.endS = Math.max(current.endS, endS);
  };
  for (const w of words) {
    const parts = String(w.word ?? "").split("\n");
    parts.forEach((part, i) => {
      if (i > 0) push();
      append(part, Number(w.startS) || 0, Number(w.endS) || 0);
    });
  }
  push();
  return lines;
}

/**
 * @param {Array<{ word: string, startS: number, endS: number }>} words
 * @param {{ width?: number, height?: number, title?: string, author?: string }} opts
 */
function buildAssSubtitleFile(words, opts = {}) {
  const width = Number(opts.width) || 1080;
  const height = Number(opts.height) || 1920;
  const title = String(opts.title || "").trim();
  const author = String(opts.author || "").trim().replace(/^@+/, "");
  const lines = groupTimedLyricsIntoLines(words);
  const lyricLines = lines.filter((l) => !l.isSection && l.text.trim());
  if (!lyricLines.length && !title) {
    throw new Error("No lyric lines to render");
  }

  const events = [];
  const endTime = lyricLines.length
    ? formatAssTime(Math.max(...lyricLines.map((l) => Number(l.endS) || 0)) + 2)
    : "0:00:30.00";

  if (title) {
    events.push(
      `Dialogue: 0,0:00:00.50,0:00:04.50,Title,,0,0,0,,${escapeAssText(title)}`
    );
  }
  if (author) {
    events.push(
      `Dialogue: 0,0:00:01.00,0:00:04.50,Author,,0,0,0,,${escapeAssText(`@${author}`)}`
    );
  }

  for (const line of lines) {
    const start = formatAssTime(line.startS);
    const end = formatAssTime(Math.max(Number(line.endS) + 0.15, Number(line.startS) + 0.5));
    const style = line.isSection ? "Section" : "Lyric";
    events.push(`Dialogue: 0,${start},${end},${style},,0,0,0,,${escapeAssText(line.text)}`);
  }

  events.push(`Dialogue: 0,0:00:00.00,${endTime},Watermark,,0,0,0,,NabadAi`);

  return [
    "[Script Info]",
    "Title: NabadAi Lyric Video",
    "ScriptType: v4.00+",
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Lyric,Noto Sans Arabic,58,&H00FFFFFF,&H000000FF,&H00000000,&H96000000,0,0,0,0,100,100,0,0,1,3,2,2,72,72,140,1",
    "Style: Section,Noto Sans Arabic,42,&H00D0D8E8,&H000000FF,&H00000000,&H80000000,0,1,0,0,100,100,0,0,1,2,1,8,72,72,220,1",
    "Style: Title,Noto Sans Arabic,48,&H00FFFFFF,&H000000FF,&H00000000,&H96000000,1,0,0,0,100,100,0,0,1,3,2,8,72,72,180,1",
    "Style: Author,Noto Sans Arabic,36,&H00B8C4D8,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,8,72,72,130,1",
    "Style: Watermark,Noto Sans Arabic,30,&H66FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,72,72,56,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,
    "",
  ].join("\n");
}

module.exports = { buildAssSubtitleFile, groupTimedLyricsIntoLines, formatAssTime, escapeAssText };
