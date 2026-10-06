/**
 * Google Lyria 3 music generation via Interactions API (preferred) or legacy generateContent.
 * @see https://ai.google.dev/gemini-api/docs/music-generation
 */
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const LYRIA_INTERACTIONS_URL = `${GEMINI_BASE}/interactions`;
const LYRIA_PRO_MODEL = "lyria-3-pro-preview";
const LYRIA_35_MODEL = "lyria-3.5";
/** Default for full song + Nabad Producer — override with LYRIA_MUSIC_MODEL=lyria-3-pro-preview */
const LYRIA_FULL_MODEL = LYRIA_35_MODEL;

function safeJson(txt) {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

const {
  CLIP_VOCAL_PROFILES,
  clipVocalProfileById,
  defaultClipVocalProfileForGender,
} = require("./clip-vocal-profiles");
const { looksLikeArabizi, isArabiziScript, buildLyriaArabiziPerformanceNote } = require("./arabizi");
const { stripInlinePunctuationFromSungLine } = require("./sung-lyrics-punctuation");
const {
  buildLyriaLebaneseArabicNote,
  buildLyriaEgyptianArabicNote,
  dialectFlags,
  hintRequestsFormalMsa,
  normalizeArabicAddress,
} = require("./arabic-dialect-lyrics");
const { buildNabadVocalPrompt } = require("./nabad-vocal-identity");

const LYRIA_CLIP_MODEL = "lyria-3-clip-preview";

/** Spark/challenge delivery overrides — positive vocal direction for Lyria. */
const CHALLENGE_VOCAL_PROFILES = {
  "hook-rush": "Bright energetic hook delivery, mid-range chest voice, sticky chorus lift",
  "one-line-reply": "Intimate close-mic reply-song delivery, warm conversational tone",
  "whisper-to-hook": "Soft breathy opening that builds to a warm mid-range chorus — stay in chest voice",
  "dabke-drop": "Warm festive vocal, confident polished delivery, clap-ready chorus energy",
  "sad-to-dance": "Emotional conversational verse, uplifting but controlled chorus lift",
  "arabic-trend-byte": "Warm Arabic pop vocal, natural dialect delivery, TikTok hook energy",
  "roast-song": "Playful talk-sing delivery, witty conversational tone",
  "three-word-hook": "Punchy minimal hook vocal, tight rhythmic delivery",
  "last-photo-song": "Intimate photo-mood vocal, soft warm close-mic texture",
  "tiktok-teaser": "Tight punchy social hook vocal, instant payoff energy",
  "wrong-genre-party": "Ironic verse texture, sugary polished chorus vocal",
  "countdown-hook": "Rising-tension delivery building to a punchy 3-2-1 payoff",
  "caption-song": "Intimate caption-style vocal, conversational social hook",
  "makhlouta-genre": "Playful fusion vocal, warm conversational mashup energy",
  "city-night": "Intimate night-drive vocal, cinematic close-mic mood",
  "before-after": "Quiet honest verse, brighter but controlled chorus lift",
  "oud-loop": "Warm Arabic-friendly vocal, poetic conversational delivery",
  "shower-thought": "Witty conversational delivery, philosophical one-liner chorus",
};

const TIMBRE_TO_LYRIA = {
  breathy: "breathy, airy close-mic texture",
  warm: "warm, soulful timbre",
  soft: "soft, gentle delivery",
  bright: "bright, clear upper chest tone",
  deep: "deeper chest voice, smooth resonance",
  raspy: "slightly raspy, textured timbre",
  soulful: "soulful, emotive delivery",
  crisp: "crisp, articulate delivery",
};

const LEGACY_LYRIA_MODEL_ALIASES = Object.freeze({
  pro: LYRIA_PRO_MODEL,
  "lyria-3-pro-preview": LYRIA_PRO_MODEL,
  full: LYRIA_35_MODEL,
  "lyria-3.5": LYRIA_35_MODEL,
  "3.5": LYRIA_35_MODEL,
});

function resolveLyriaModel(explicit) {
  const env = String(process.env.LYRIA_MUSIC_MODEL || "").trim();
  const raw = String(explicit || env || LYRIA_FULL_MODEL).trim();
  const low = raw.toLowerCase();
  if (low === "clip" || low === LYRIA_CLIP_MODEL) return LYRIA_CLIP_MODEL;
  return LEGACY_LYRIA_MODEL_ALIASES[low] || raw || LYRIA_FULL_MODEL;
}

function lyriaUseInteractionsApi() {
  return envFlagEnabled("LYRIA_USE_INTERACTIONS", { defaultOn: true });
}

function lyriaGenerateEnabled() {
  const v = String(process.env.LYRIA_GENERATE_ENABLED || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function envFlagEnabled(name, { defaultOn = true } = {}) {
  const v = String(process.env[name] || "").trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "no") return false;
  return defaultOn;
}

function nabadClipEnabled() {
  return envFlagEnabled("NABAD_CLIP_ENABLED", { defaultOn: true });
}

/** Templates / Sparks / Moments / Challenges → Lyria 3.5 full song (not clip).
 *  Opt back into clip with TEMPLATE_SPARK_CLIP_ENABLED=1. Nabad Clip hub is separate. */
function templateSparkClipEnabled() {
  return envFlagEnabled("TEMPLATE_SPARK_CLIP_ENABLED", { defaultOn: false });
}

function isLyriaClipModel(model) {
  return String(model || "").trim().toLowerCase() === LYRIA_CLIP_MODEL;
}

/** Strip Suno-style negative clauses — Lyria responds to positive vocal profiles. */
function sanitizeStyleForLyria(style) {
  const parts = String(style || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return "";

  const drop = (part) => {
    const low = part.toLowerCase();
    if (/^no\b/.test(low)) return true;
    if (/^not\b/.test(low)) return true;
    if (/\bnever\b/.test(low)) return true;
    if (/\bavoid\b/.test(low)) return true;
    if (/\bwithout\b/.test(low)) return true;
    if (/\bno\s+\w+\s+\w+/.test(low)) return true;
    if (/\bnot\s+a\b/.test(low)) return true;
    if (low.includes("mid-sentence")) return true;
    if (low.includes("mid-word")) return true;
    if (low.includes("full-length")) return true;
    if (low.includes("full song")) return true;
    if (low.includes("4-minute")) return true;
    if (low.includes("stadium")) return true;
    if (low.includes("crowd sfx")) return true;
    return false;
  };

  return parts.filter((p) => !drop(p)).join(", ").replace(/\s+/g, " ").trim();
}

/** Suno-style meta clauses in body.style — Lyria may sing these if left in the prompt. */
function isLyriaInternalStyleClause(part) {
  const p = String(part || "").trim();
  if (!p) return true;
  if (/^dialect\s*:/i.test(p)) return true;
  if (/^hint\s*:/i.test(p)) return true;
  if (/^arabic address\s*:/i.test(p)) return true;
  if (/^timing lock\s*:/i.test(p)) return true;
  if (/^cover art\s*:/i.test(p)) return true;
  if (/^voice timbre\s*:/i.test(p)) return true;
  if (/\blead vocalist\b/i.test(p)) return true;
  if (/\barabic vocal\b/i.test(p)) return true;
  if (/\bcolloquial pronunciation\b/i.test(p)) return true;
  if (/\bfollow-prompt behavior\b/i.test(p)) return true;
  if (/\bkeep this timing stable\b/i.test(p)) return true;
  if (/\baddressee words\b/i.test(p)) return true;
  if (/\bmelody lock\b/i.test(p)) return true;
  if (/\bgroove\b/i.test(p) && /\bpace\b/i.test(p)) return true;
  if (/\bprosody\b/i.test(p)) return true;
  if (/\bbeat stability\b/i.test(p)) return true;
  return false;
}

/** User-facing genre/style only — dialect/vocal/address travel via dialectHint fields. */
function buildLyriaDirectStylePrompt(body = {}) {
  const raw = String(body?.style || "").trim();
  const songKey = String(body?.songKey || "").trim();
  const chunks = raw.split(/[|,]/).map((s) => s.trim()).filter(Boolean);
  const musical = chunks.filter((c) => !isLyriaInternalStyleClause(c));
  const style = sanitizeStyleForLyria(musical.join(", ") || chunks[0] || raw);
  const bits = [style];
  if (songKey) bits.push(`Key: ${songKey}`);
  return bits.filter(Boolean).join(", ").slice(0, 1200);
}

function extractDialectFromStyleText(style = "") {
  const s = String(style || "");
  const parts = [];
  const dialect = s.match(/\bDialect:\s*([^|,]+)/i)?.[1]?.trim();
  const hint = s.match(/\bHint:\s*([^|,]+)/i)?.[1]?.trim();
  const address = s.match(/Arabic address:\s*[^|,]+/i)?.[0]?.trim();
  const accent = s.match(/(?:Lebanese|Syrian|Palestinian|Egyptian|Gulf|Iraqi|Maghrebi|Tunisian|Sudanese) Arabic vocal[^|,]*/i)?.[0]?.trim();
  if (dialect) parts.push(dialect);
  if (hint) parts.push(hint);
  if (address) parts.push(address);
  if (accent && !parts.some((p) => /arabic vocal/i.test(p))) parts.push(accent);
  return parts.filter(Boolean).join(" — ");
}

function arabicAddressNoteForLyriaHint(address = "") {
  const addr = String(address || "").trim().toLowerCase();
  if (addr === "female") {
    return "Arabic address: lyrics sung TO a woman; keep feminine addressee words: إنتِ، حبيبتي، غالية، كنتِ.";
  }
  if (addr === "group") {
    return "Arabic address: lyrics sung TO a group; keep plural addressee words: إنتو، حبايبي، غاليين، كنتو.";
  }
  if (addr === "male") {
    return "Arabic address: lyrics sung TO a man; keep masculine addressee words: إنتَ، حبيبي، غالي، حبيتك، نطرتك (Levantine -ak, vowel before ك not كَ on kaf).";
  }
  return "";
}

function mergeLyriaDialectHint(body = {}) {
  const direct = [String(body?.dialectHint || "").trim(), String(body?.dialect || "").trim()]
    .filter(Boolean)
    .join(" — ");
  const base = direct || extractDialectFromStyleText(body?.style || "");
  const inferred = normalizeArabicAddress(String(body?.arabicAddress || body?.address || "").trim(), base);
  const note = arabicAddressNoteForLyriaHint(inferred);
  if (!note || /lyrics sung to a (man|woman|group)/i.test(base)) return base;
  return [base, note].filter(Boolean).join(" ");
}

/** Addressee chip text belongs in lyrics, not the singer timbre line. */
function stripArabicAddressClausesFromHint(hint = "") {
  return String(hint || "")
    .replace(/Arabic address:\s*lyrics sung TO[^.;]+[.;]?/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Lyria may sing negation/meta clauses — strip known bad fragments before vocal lines. */
function sanitizeDialectHintForLyriaPrompt(hint = "") {
  return stripArabicAddressClausesFromHint(
    String(hint || "")
      .replace(/\s*\(addressee only,\s*not singer gender\)/gi, "")
      .replace(/,\s*not the singer's gender/gi, "")
      .replace(/;\s*not singer gender/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim(),
  );
}

function resolveLyriaDialectLabel(body = {}) {
  const direct = String(body?.dialect || "").trim();
  if (direct) return direct;
  return String(body?.style || "").match(/\bDialect:\s*([^|,]+)/i)?.[1]?.trim() || "";
}

/** msa = formal allowed; dialect = colloquial; natural = Arabic lyrics but no dialect chip. */
function resolveLyriaArabicPronunciationMode({ dialectHint = "", lyrics = "" } = {}) {
  const blob = String(dialectHint || "").toLowerCase();
  // "NOT formal MSA/nahwi" in dialect chips must NOT flip us into فصحى mode.
  if (hintRequestsFormalMsa(blob)) {
    return "msa";
  }
  if (looksLikeArabizi(String(lyrics || ""))) return "arabizi";
  if (blob.trim()) return "dialect";
  if (/[\u0600-\u06FF]/.test(String(lyrics || ""))) return "natural";
  return "";
}

function buildLyriaArabiziVocalNote(dialectHint = "") {
  const hint = String(dialectHint || "").trim();
  // Positive-only — Lyria may sing "NOT English" as English.
  if (/lebanese|beirut/i.test(hint)) {
    return "Native Lebanese Arabic lead vocal, authentic Beirut colloquial pronunciation and vowels";
  }
  if (/syrian|palestinian|levantine/i.test(hint)) {
    return "Native Levantine Arabic lead vocal, authentic colloquial pronunciation";
  }
  if (/egyptian|masri/i.test(hint)) {
    return "Native Egyptian Arabic lead vocal, authentic Masri colloquial pronunciation and vowels";
  }
  return "Native Arabic dialect lead vocal, authentic colloquial pronunciation";
}

function buildLyriaDialectVocalNote(dialectHint = "", { arabizi = false } = {}) {
  if (arabizi) return buildLyriaArabiziVocalNote(dialectHint);
  const hint = String(dialectHint || "").trim();
  if (!hint) return "";
  const mode = resolveLyriaArabicPronunciationMode({ dialectHint: hint });
  if (mode === "msa") return "Modern Standard Arabic vocal delivery.";
  if (/lebanese|beirut/i.test(hint)) {
    return "Lebanese Beirut colloquial vocal, warm conversational Levantine delivery.";
  }
  if (/syrian|palestinian|levantine/i.test(hint)) {
    return "Levantine colloquial vocal, warm conversational delivery.";
  }
  if (/egyptian|masri/i.test(hint)) {
    return "Egyptian Masri colloquial vocal, Cairo accent, warm conversational delivery, authentic Masri pronunciation.";
  }
  if (/gulf|khaleeji/i.test(hint)) return "Gulf Khaleeji colloquial vocal delivery.";
  if (/iraqi/i.test(hint)) return "Iraqi colloquial vocal, warm conversational delivery.";
  if (/moroccan|darija/i.test(hint)) return "Moroccan Darija colloquial vocal delivery.";
  if (/tunisian/i.test(hint)) return "Tunisian colloquial vocal delivery.";
  if (/sudanese/i.test(hint)) return "Sudanese colloquial vocal delivery.";
  // Never forward raw chip text (often has NOT MSA / no tanween) — Lyria may latch onto the negated words.
  return "Colloquial Arabic vocal, warm conversational spoken delivery.";
}

/**
 * Nabad Signature Vocal Identity for Lyria (replaces old clip vocal characters / timbre map).
 * Positive-only direction — no NOT/NO clauses (the model may sing them).
 */
function buildLyriaInlineVocalDirection({
  vocalGender = "",
  voiceTimbre = "",
  challengeId = "",
  dialectHint = "",
  clipVocalProfileId = "",
  arabizi = false,
  lyrics = "",
  scriptFormat = "",
  nabadVocalToggles = null,
  useNabadVocalIdentity = true,
} = {}) {
  const bits = [];

  // New strategy: Nabad identity matrix + admin FX chain (ignore legacy clip characters).
  if (useNabadVocalIdentity) {
    const nabad = buildNabadVocalPrompt({
      gender: vocalGender,
      lyrics,
      dialectHint,
      scriptFormat: arabizi ? "arabizi" : scriptFormat,
      adminToggles: nabadVocalToggles,
    });
    if (nabad.styleLine) bits.push(nabad.styleLine);
  } else {
    // Legacy path kept for emergency rollback only.
    const catalog = clipVocalProfileById(clipVocalProfileId);
    if (catalog?.lyriaVocalPrompt) {
      bits.push(String(catalog.lyriaVocalPrompt).trim());
    } else {
      const g = String(vocalGender || "").trim().toLowerCase();
      if (g === "f") {
        bits.push("Female alto vocal, warm soulful close-mic chest voice");
      } else if (g === "m") {
        bits.push("Male tenor vocal, warm modern pop chest voice, on-pitch close-mic");
      } else {
        bits.push("Warm conversational lead vocal, close-mic chest voice");
      }
      const timbreLine = mapTimbreToLyria(voiceTimbre);
      if (timbreLine) bits.push(timbreLine);
    }
    const challengeLine = CHALLENGE_VOCAL_PROFILES[String(challengeId || "").trim()];
    if (challengeLine) bits.push(challengeLine);
  }

  const dialectLine = buildLyriaDialectVocalNote(dialectHint, { arabizi });
  if (dialectLine) bits.push(dialectLine);

  return bits.join(" ").replace(/\s+/g, " ").trim();
}

/** Admin logging only — never append as a labeled block in the Lyria prompt. */
function buildLyriaArabicPronunciationLine(mode, dialectHint = "") {
  if (mode === "msa") {
    return "Modern Standard Arabic (MSA): formal pronunciation allowed when appropriate.";
  }
  if (mode === "dialect") {
    const hint = String(dialectHint || "").trim();
    const flags = dialectFlags("", hint);
    if (flags.isLebanese) {
      return buildLyriaLebaneseArabicNote();
    }
    if (flags.isEgyptian) {
      return buildLyriaEgyptianArabicNote();
    }
    return hint || "colloquial Arabic dialect, spoken conversational pronunciation";
  }
  if (mode === "natural") {
    return "Arabic lyrics: colloquial spoken pronunciation.";
  }
  if (mode === "arabizi") {
    return "Arabizi: Arabic language in Latin letters — native colloquial Arabic pronunciation.";
  }
  return "";
}

function mapTimbreToLyria(timbre) {
  const raw = String(timbre || "").trim();
  if (!raw) return "";
  const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  for (const [k, v] of Object.entries(TIMBRE_TO_LYRIA)) {
    if (key.includes(k)) return v;
  }
  return `${raw} vocal texture`;
}

/**
 * Positive singer profile — Nabad Signature Vocal Identity for Lyria.
 * @see https://ai.google.dev/gemini-api/docs/music-generation
 */
function buildLyriaVocalProfile(opts = {}) {
  return buildLyriaInlineVocalDirection({
    ...opts,
    arabizi: Boolean(opts.arabizi) || isArabiziScript({
      scriptFormat: opts.scriptFormat,
      lyrics: opts.lyrics,
    }),
  });
}

/**
 * Build a Lyria prompt: musical direction + arrangement timing ABOVE lyrics.
 * Google guidance: separate instructions from lyrics — labeled meta / direction
 * blocks get sung if mixed into the lyric section.
 * Timing as arrangement lines: [0:00 - 0:12] Intro: soft motif…
 * @see https://ai.google.dev/gemini-api/docs/music-generation
 */
function buildLyriaPrompt({
  stylePrompt = "",
  lyrics = "",
  title = "",
  instrumental = false,
  clip = false,
  vocalGender = "",
  voiceTimbre = "",
  challengeId = "",
  dialectHint = "",
  clipVocalProfileId = "",
  enhancedStylePrompt = "",
  structuredLyrics = "",
  arrangement = "",
  photoMood = false,
  durationSec = 0,
  scriptFormat = "",
  nabadVocalToggles = null,
  useNabadVocalIdentity = true,
} = {}) {
  const style = String(enhancedStylePrompt || "").trim();
  const sanitizedStyle = style ? sanitizeStyleForLyria(style) : sanitizeStyleForLyria(stylePrompt);
  const rawLyrics = String(structuredLyrics || lyrics || "").trim();
  const lyricText = instrumental ? "" : sanitizeLyriaLyricsForSinging(rawLyrics);
  const arrangementText = String(arrangement || "").trim()
    || (clip ? "" : extractArrangementFromMixedLyrics(rawLyrics));
  const songTitle = String(title || "").trim();
  const duration = Number(durationSec);
  const arabizi = isArabiziScript({ scriptFormat, lyrics: lyricText });

  const direction = [];

  if (Number.isFinite(duration) && duration >= 30 && !clip) {
    const sec = Math.round(duration);
    direction.push(
      `Target length about ${sec} seconds (Lyria max ~3 minutes) — fit all sung lyrics in that time; fewer sections and shorter lines beat a long lyric sheet`,
    );
  }

  if (photoMood) {
    direction.push("Music inspired by the mood, colors, and atmosphere in the attached image");
  }

  if (clip) {
    direction.push(
      "Short hook-focused music clip about 28 seconds, one optional verse plus one chorus, end on a complete phrase",
    );
  } else {
    direction.push(
      "Compact catchy song: one memorable chorus hook, strong groove, verse/chorus contrast — do not rush through many lyric sections",
    );
  }

  if (songTitle) direction.push(`Title: ${songTitle}`);

  if (sanitizedStyle) direction.push(sanitizedStyle);

  if (!instrumental) {
    const vocal = buildLyriaInlineVocalDirection({
      vocalGender,
      voiceTimbre,
      challengeId,
      dialectHint,
      clipVocalProfileId,
      arabizi,
      lyrics: lyricText || rawLyrics,
      scriptFormat,
      nabadVocalToggles,
      useNabadVocalIdentity,
    });
    if (vocal) direction.push(vocal);
  } else {
    direction.push("Instrumental only, no vocals, no sung words");
  }

  const directionText = direction.filter(Boolean).join(". ").replace(/\.\s*\./g, ".").trim();

  const blocks = [];
  if (instrumental) {
    blocks.push(`Create an instrumental track. ${directionText}.`);
  } else {
    blocks.push(`Create a song. ${directionText}.`);
  }

  if (arabizi && !instrumental) {
    blocks.push(
      buildLyriaArabiziPerformanceNote({
        dialect: dialectHint,
        dialectHint,
      }),
    );
  }

  // Arrangement timing ABOVE lyrics — docs format, never mixed into sung lines.
  const arrLines = normalizeLyriaArrangementLines(arrangementText);
  if (arrLines) {
    blocks.push("");
    blocks.push("Arrangement:");
    blocks.push(arrLines);
  }

  if (instrumental) {
    return blocks.join("\n").slice(0, 8000);
  }

  if (lyricText) {
    blocks.push("");
    blocks.push("Sing only the lyrics below. Do not sing any text above this line.");
    blocks.push("");
    blocks.push("Lyrics:");
    blocks.push("");
    blocks.push(lyricText);
    return blocks.join("\n").slice(0, 8000);
  }

  blocks.push("");
  blocks.push(
    "Write and perform original compact lyrics matching this direction (~18 lines max: Verse, Chorus, Verse, Chorus, optional short Bridge). Prefer one sticky chorus hook.",
  );
  return blocks.join("\n").slice(0, 8000);
}

/**
 * Strip instruction / meta lines so Lyria does not sing the brief.
 * Keeps simple [Verse] / [Chorus] tags and singable lyric lines only.
 */
function sanitizeLyriaLyricsForSinging(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const out = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }
    // Drop arrangement timing lines that leaked into lyrics.
    if (/^\[\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}\]/.test(t)) continue;
    if (/^Arrangement\s*:/i.test(t)) continue;
    if (/^Musical direction\s*:/i.test(t)) continue;
    if (/^Lyrics\s*:/i.test(t)) continue;
    if (/^Create\b/i.test(t) && !/^\[[^\]]+\]/.test(t)) continue;
    if (/^(Write|Turn|Make|Build|Challenge|Describe|Paste|Start with|Keep |Add |Use |Pick |Flip |Begin)\b/i.test(t)
      && !/^\[[^\]]+\]/.test(t)) {
      continue;
    }
    if (/^(اكتب|حوّل|خلّيها|غنّي|صفّق|مزاج|مقطع|كورس|أغنية)/.test(t)) continue;
    if (/^~\d+\s*sec|^max \d+ line|Tap ✦|not a full song|optional;|when ready/i.test(t)) continue;
    if (/^Dialect\s*:|^Hint\s*:|^Arabic address\s*:|^Timing lock\s*:|^Cover art\s*:|^Voice timbre\s*:/i.test(t)) continue;
    if (/^Approximately \d+|^Target length|^Duration\s*:/i.test(t)) continue;
    if (/^Sing only the lyrics|^Do not sing any text/i.test(t)) continue;
    if (/^With the following lyrics/i.test(t)) continue;
    // Normalize section tags: strip embedded timing " · 0:00–0:15"
    if (/^\[[^\]]+\]\s*$/.test(t)) {
      const cleaned = t.replace(/\s*[·•]\s*\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}\s*/g, "").trim();
      if (cleaned) out.push(cleaned);
      continue;
    }
    // Drop "section: instruction" meta lines without sung words
    if (/^\[[^\]]+\]\s*[—\-–:]\s*(lines?|hook|whisper|quiet|before|after|begin|add|keep|write)\b/i.test(t)) {
      continue;
    }
    out.push(stripInlinePunctuationFromSungLine(t));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Pull arrangement timing lines if they were mixed into a producer lyric blob. */
function extractArrangementFromMixedLyrics(text) {
  const lines = String(text || "").split(/\r?\n/);
  const arr = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^\[\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}\]/.test(t)) arr.push(t);
  }
  return arr.join("\n").trim();
}

/**
 * Normalize arrangement to docs format:
 * [0:00 - 0:12] Intro: soft motif…
 * Also accepts producer tags like [Intro · 0:00–0:15] description
 */
function normalizeLyriaArrangementLines(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const out = [];
  for (const line of raw.split(/\r?\n/)) {
    let t = line.trim();
    if (!t || /^Arrangement\s*:/i.test(t)) continue;
    // Already docs format
    if (/^\[\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}\]/.test(t)) {
      t = t.replace(/^\[(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})\]\s*/, (_, a, b) => `[${a} - ${b}] `);
      out.push(t.replace(/\s+/g, " ").trim());
      continue;
    }
    // [Intro · 0:00–0:15] or [Intro · 0:00–0:15] soft motif
    const m = /^\[([^\]]+?)\s*[·•]\s*(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})\s*\]\s*(.*)$/.exec(t);
    if (m) {
      const section = String(m[1] || "").trim();
      const start = m[2];
      const end = m[3];
      const rest = String(m[4] || "").trim();
      out.push(`[${start} - ${end}] ${section}${rest ? `: ${rest}` : ""}`.replace(/\s+/g, " ").trim());
      continue;
    }
    // Bare instruction line without timestamps — keep if it looks like arrangement prose
    if (/^(Intro|Verse|Chorus|Bridge|Outro|Pre-Chorus|Hook)\b/i.test(t) && t.includes(":")) {
      out.push(t);
    }
  }
  return out.join("\n").trim();
}

function decodeInlineAudio(inline) {
  if (!inline) return null;
  const data = String(inline?.data || "").trim();
  if (!data) return null;
  try {
    const buffer = Buffer.from(data, "base64");
    if (!buffer.length) return null;
    let mime = String(inline?.mimeType || inline?.mime_type || "").split(";")[0].trim();
    // Sniff WAV/RIFF when mime is missing or generic.
    if ((!mime || mime === "audio" || mime === "application/octet-stream") && buffer.length >= 12) {
      if (buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WAVE") {
        mime = "audio/wav";
      }
    }
    if (!mime) mime = "audio/mpeg";
    return { buffer, mimeType: mime };
  } catch {
    return null;
  }
}

/**
 * Parse audio bytes from generateContent or Interactions-shaped payloads.
 */
function normalizeLyriaPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  if (payload.interaction && typeof payload.interaction === "object") return payload.interaction;
  return payload;
}

function extractLyriaAudio(payload) {
  const data = normalizeLyriaPayload(payload);
  if (!data || typeof data !== "object") return null;

  const topAudio = decodeInlineAudio(data?.output_audio);
  if (topAudio) return topAudio;

  const steps = Array.isArray(data?.steps) ? data.steps : [];
  for (const step of steps) {
    if (String(step?.type || "") !== "model_output") continue;
    for (const block of step?.content || []) {
      if (String(block?.type || "") !== "audio") continue;
      const parsed = decodeInlineAudio({
        data: block?.data,
        mimeType: block?.mime_type || block?.mimeType || "audio/mpeg",
      });
      if (parsed) return parsed;
    }
  }

  const outputs = Array.isArray(data?.outputs) ? data.outputs : [];
  for (const out of outputs) {
    const inline = out?.inline_data || out?.inlineData || out?.audio || out;
    const parsed = decodeInlineAudio(inline);
    if (parsed) return parsed;
  }

  const parts = data?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    for (const part of parts) {
      const parsed = decodeInlineAudio(part?.inlineData || part?.inline_data);
      if (parsed) return parsed;
    }
  }

  return null;
}

/** Collect lyric / analysis text from Interactions or generateContent payloads. */
function extractLyriaTextParts(payload) {
  const data = normalizeLyriaPayload(payload);
  if (!data || typeof data !== "object") return [];

  const collected = [];
  const outputText = String(data?.output_text || "").trim();
  if (outputText) collected.push(outputText);

  const steps = Array.isArray(data?.steps) ? data.steps : [];
  for (const step of steps) {
    if (String(step?.type || "") !== "model_output") continue;
    for (const block of step?.content || []) {
      if (String(block?.type || "") !== "text") continue;
      const text = String(block?.text || "").trim();
      if (text) collected.push(text);
    }
  }

  const parts = data?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    for (const part of parts) {
      const text = String(part?.text || "").trim();
      if (text) collected.push(text);
    }
  }

  return collected;
}

/** Duration from the music-analysis text part (duration_secs: 150.5). */
function extractLyriaDurationSecs(payload) {
  for (const text of extractLyriaTextParts(payload)) {
    const m = /duration_secs:\s*([\d.]+)/i.exec(text);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

/** Pick the lyrics part (section markers + [sec:] timestamps), not the analysis blob. */
function pickLyriaLyricsPart(textParts) {
  for (const t of textParts) {
    if (/\[\[[A-D]\d+\]\]/.test(t) || /\[\d+(?:\.\d+)?:\]/.test(t)) return t;
  }
  const nonAnalysis = textParts.filter((t) => !/^mosic:/i.test(t) && !/^bpm:/i.test(t));
  if (nonAnalysis.length) {
    return nonAnalysis.sort((a, b) => a.length - b.length)[0];
  }
  return textParts[0] || "";
}

/** Strip Lyria timing markers so song-details can show readable lyrics. */
function formatLyriaLyricsForDisplay(lyricsText) {
  const lines = [];
  for (const raw of String(lyricsText || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      if (lines.length && lines[lines.length - 1] !== "") lines.push("");
      continue;
    }
    if (/^\[\[[A-D]\d+\]\]$/.test(line)) {
      lines.push(lyriaSectionToTag(line));
      continue;
    }
    const abs = line.match(/^\[(\d+(?:\.\d+)?):\]\s*(.*)$/);
    if (abs) {
      if (String(abs[2] || "").trim()) lines.push(String(abs[2]).trim());
      continue;
    }
    const cont = line.match(/^\[:\]\s*(.*)$/);
    if (cont) {
      if (String(cont[1] || "").trim()) lines.push(String(cont[1]).trim());
      continue;
    }
    lines.push(line);
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function extractLyriaDisplayLyrics(payload) {
  const textParts = extractLyriaTextParts(payload);
  const raw = pickLyriaLyricsPart(textParts);
  return formatLyriaLyricsForDisplay(raw);
}

function lyriaSectionToTag(line) {
  const m = /^\[\[([A-D])(\d+)\]\]$/.exec(String(line || "").trim());
  if (!m) return String(line || "").trim();
  const map = { A: "Intro", B: "Verse", C: "Chorus", D: "Outro" };
  return `[${map[m[1]] || "Section"}]`;
}

/**
 * Lyria lyrics use line timestamps like [10.9:] and continuations [:].
 * Split each timed line into evenly-spaced words for karaoke display.
 */
function parseLyriaLyricsToAlignedWords(lyricsText, totalDurationS = 0) {
  const segments = [];
  let currentStart = 0;
  let currentText = "";

  const flushLyric = () => {
    const text = currentText.trim();
    if (text) segments.push({ text, startS: currentStart, isSection: false });
    currentText = "";
  };

  for (const raw of String(lyricsText || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    if (/^\[\[[A-D]\d+\]\]$/.test(line)) {
      flushLyric();
      segments.push({ text: lyriaSectionToTag(line), startS: currentStart, isSection: true });
      continue;
    }

    const abs = line.match(/^\[(\d+(?:\.\d+)?):\]\s*(.*)$/);
    if (abs) {
      flushLyric();
      currentStart = Number(abs[1]) || 0;
      currentText = abs[2] || "";
      continue;
    }

    const cont = line.match(/^\[:\]\s*(.*)$/);
    if (cont) {
      currentText += (currentText ? " " : "") + (cont[1] || "");
      continue;
    }

    flushLyric();
    currentText = line;
  }
  flushLyric();

  // Section markers precede their lyric block — inherit the next line's start time.
  for (let i = 0; i < segments.length; i++) {
    if (!segments[i].isSection) continue;
    const next = segments.slice(i + 1).find((s) => !s.isSection);
    if (next) segments[i].startS = next.startS;
  }

  const lyricSegs = segments.filter((s) => !s.isSection && s.text);
  if (!lyricSegs.length) return [];

  const duration =
    Number(totalDurationS) > 0
      ? Number(totalDurationS)
      : lyricSegs[lyricSegs.length - 1].startS + 8;

  const alignedWords = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.isSection) {
      const nextStart =
        segments.slice(i + 1).find((s) => !s.isSection)?.startS ?? seg.startS;
      alignedWords.push({
        word: seg.text,
        startS: seg.startS,
        endS: Math.max(seg.startS + 0.05, nextStart),
        success: true,
      });
      continue;
    }
    const nextLyric = segments.slice(i + 1).find((s) => !s.isSection);
    const endS = nextLyric ? nextLyric.startS : duration;
    const words = seg.text.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const span = Math.max(0.05, endS - seg.startS);
    const perWord = span / words.length;
    words.forEach((w, wi) => {
      alignedWords.push({
        word: w,
        startS: seg.startS + wi * perWord,
        endS: seg.startS + (wi + 1) * perWord,
        success: true,
      });
    });
  }
  return alignedWords;
}

function extractLyriaAlignedWords(payload) {
  const textParts = extractLyriaTextParts(payload);
  const lyricsPart = pickLyriaLyricsPart(textParts);
  if (!lyricsPart) return [];
  const duration = extractLyriaDurationSecs(payload);
  return parseLyriaLyricsToAlignedWords(lyricsPart, duration || 0);
}

function lyriaUserMessage(httpStatus, payload, rawText) {
  const data = normalizeLyriaPayload(payload);
  const err = data?.error?.message || data?.error;
  if (err) return String(err).slice(0, 280);
  const block = data?.promptFeedback?.blockReason;
  if (block) return `This prompt was blocked (${block}). Try softer wording.`;
  const finish = data?.candidates?.[0]?.finishReason;
  if (finish && finish !== "STOP") return `Couldn't finish this clip (${finish}). Try again.`;
  if (httpStatus === 429) return "Too many requests — wait a minute and try again.";
  if (httpStatus === 403) return "Couldn't start this clip — try again shortly.";
  if (httpStatus >= 500) return "Music generation is temporarily unavailable — try again shortly.";
  const snippet = String(rawText || "").trim().slice(0, 180);
  return snippet || "Couldn't generate this clip — try again.";
}

function parseLyriaPhotoDataUrl(dataUrl) {
  const raw = String(dataUrl || "").trim();
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(raw);
  if (!match) return null;
  const mimeType = match[1].toLowerCase();
  const data = match[2].replace(/\s/g, "");
  if (!data || data.length > 2_600_000) return null;
  try {
    const buffer = Buffer.from(data, "base64");
    if (!buffer.length || buffer.length > 12 * 1024 * 1024) return null;
    return { mimeType, data, buffer };
  } catch {
    return null;
  }
}

/** Up to 10 images for Lyria multimodal input. */
function resolveLyriaPhotoImages({ photoImage = "", photoImages = null } = {}) {
  const rawList = Array.isArray(photoImages)
    ? photoImages
    : photoImage
      ? [photoImage]
      : [];
  const out = [];
  for (const item of rawList) {
    if (out.length >= 10) break;
    const parsed = parseLyriaPhotoDataUrl(item);
    if (parsed) out.push(parsed);
  }
  return out;
}

function buildLyriaInteractionsInput(prompt, photoImages = []) {
  const text = String(prompt || "").trim();
  const images = Array.isArray(photoImages) ? photoImages : [];
  if (!images.length) return text;
  const input = [{ type: "text", text }];
  for (const img of images) {
    input.push({
      type: "image",
      mime_type: img.mimeType,
      data: img.data,
    });
  }
  return input;
}

async function lyriaGenerateViaGenerateContent({ apiKey, model, prompt }) {
  const resolvedModel = resolveLyriaModel(model);
  const url = `${GEMINI_BASE}/models/${encodeURIComponent(resolvedModel)}:generateContent`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": String(apiKey || "").trim(),
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: String(prompt || "").trim() }] }],
      generationConfig: {
        responseModalities: ["AUDIO", "TEXT"],
      },
    }),
  });
  const text = await r.text().catch(() => "");
  const data = safeJson(text);
  const audio = extractLyriaAudio(data);
  const alignedWords = extractLyriaAlignedWords(data);
  return {
    ok: r.ok && Boolean(audio?.buffer?.length),
    httpStatus: r.status,
    data,
    text,
    audio,
    alignedWords,
    model: resolvedModel,
    api: "generateContent",
    userMessage: lyriaUserMessage(r.status, data, text),
  };
}

async function lyriaGenerateViaInteractions({ apiKey, model, prompt, photoImages = [] }) {
  const resolvedModel = resolveLyriaModel(model);
  const images = Array.isArray(photoImages) ? photoImages : [];
  // Full songs: request WAV for higher fidelity (Interactions API). Clip stays default MP3.
  const wantWav = !isLyriaClipModel(resolvedModel);
  const body = {
    model: resolvedModel,
    input: buildLyriaInteractionsInput(prompt, images),
  };
  if (wantWav) {
    body.response_format = { type: "audio" };
  }
  const r = await fetch(LYRIA_INTERACTIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Api-Revision": "2026-05-20",
      "x-goog-api-key": String(apiKey || "").trim(),
    },
    body: JSON.stringify(body),
  });
  const text = await r.text().catch(() => "");
  const data = safeJson(text);
  const audio = extractLyriaAudio(data);
  const alignedWords = extractLyriaAlignedWords(data);
  return {
    ok: r.ok && Boolean(audio?.buffer?.length),
    httpStatus: r.status,
    data,
    text,
    audio,
    alignedWords,
    model: resolvedModel,
    api: "interactions",
    responseFormat: wantWav ? "wav" : "mp3",
    userMessage: lyriaUserMessage(r.status, data, text),
  };
}

/**
 * @param {{ apiKey: string, model?: string, prompt: string, photoImages?: Array<{ mimeType: string, data: string, buffer: Buffer }> }} opts
 */
async function lyriaGenerateMusic({ apiKey, model, prompt, photoImages = [] }) {
  const images = Array.isArray(photoImages) ? photoImages : [];
  const useInteractions = lyriaUseInteractionsApi();

  if (useInteractions) {
    const interactionResult = await lyriaGenerateViaInteractions({
      apiKey,
      model,
      prompt,
      photoImages: images,
    });
    if (interactionResult.ok || images.length) return interactionResult;
    console.warn(
      "[lyria] interactions failed — falling back to generateContent",
      interactionResult.httpStatus,
      interactionResult.userMessage,
    );
  }

  if (images.length) {
    return {
      ok: false,
      httpStatus: 502,
      data: null,
      text: "",
      audio: null,
      alignedWords: [],
      model: resolveLyriaModel(model),
      api: "interactions",
      userMessage: "Couldn't compose from your photo — try again in a minute.",
    };
  }

  return lyriaGenerateViaGenerateContent({ apiKey, model, prompt });
}

module.exports = {
  LYRIA_CLIP_MODEL,
  LYRIA_FULL_MODEL,
  LYRIA_PRO_MODEL,
  LYRIA_35_MODEL,
  clipVocalProfileById,
  CLIP_VOCAL_PROFILES,
  defaultClipVocalProfileForGender,
  buildLyriaInteractionsInput,
  buildLyriaPrompt,
  buildLyriaVocalProfile,
  mergeLyriaDialectHint,
  sanitizeDialectHintForLyriaPrompt,
  resolveLyriaDialectLabel,
  resolveLyriaArabicPronunciationMode,
  buildLyriaArabicPronunciationLine,
  buildLyriaDirectStylePrompt,
  sanitizeStyleForLyria,
  sanitizeLyriaLyricsForSinging,
  normalizeLyriaArrangementLines,
  extractLyriaAlignedWords,
  extractLyriaAudio,
  extractLyriaDisplayLyrics,
  extractLyriaDurationSecs,
  extractLyriaTextParts,
  formatLyriaLyricsForDisplay,
  isLyriaClipModel,
  lyriaGenerateEnabled,
  lyriaGenerateMusic,
  lyriaUseInteractionsApi,
  lyriaUserMessage,
  nabadClipEnabled,
  parseLyriaPhotoDataUrl,
  templateSparkClipEnabled,
  parseLyriaLyricsToAlignedWords,
  pickLyriaLyricsPart,
  resolveLyriaModel,
  resolveLyriaPhotoImages,
};
