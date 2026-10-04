/**
 * Lyria Prompt v2 — minimal, deterministic prompt contract (no Gemini producer, no Nabad FX chain).
 * Enable: LYRIA_PROMPT_V2=1 (default ON on Vercel Preview / staging).
 * Admin override on request body: lyriaPromptV2 "1" | "0"
 */
const {
  sanitizeLyriaLyricsForSinging,
  normalizeLyriaArrangementLines,
  buildLyriaDirectStylePrompt,
} = require("./lyria-upstream");
const { isArabiziScript, buildLyriaArabiziPerformanceNote } = require("./arabizi");

const GENRE_PACKS = Object.freeze({
  dabke: {
    id: "dabke",
    label: "Levantine dabke",
    bpm: 124,
    meter: "6/8",
    feel: "ktakufti pulse, hand-clap pockets, festive wedding energy",
    layers: "darbuka and riq driving 6/8, mijwiz or oud hook on offbeats, warm synth bass, no stacked rock guitars",
  },
  arabic_pop: {
    id: "arabic_pop",
    label: "Arabic pop",
    bpm: 104,
    meter: "4/4",
    feel: "straight backbeat, radio-friendly groove",
    layers: "clean programmed drums on 2 and 4, warm bass, one synth or oud lead hook, light pad under chorus only",
  },
  ballad: {
    id: "ballad",
    label: "ballad",
    bpm: 76,
    meter: "4/4",
    feel: "slow half-time feel, space between phrases",
    layers: "soft piano or nylon guitar, subtle strings pad, brushed or minimal kick, no dense percussion",
  },
  trap: {
    id: "trap",
    label: "Arabic trap / hip hop",
    bpm: 94,
    meter: "4/4",
    feel: "tight grid, syncopated hi-hats, vocal sits on the snare pocket",
    layers: "808 sub bass, crisp snare and hats, one dark synth stab, no live drum kit clutter",
  },
  khaliji: {
    id: "khaliji",
    label: "Khaleeji",
    bpm: 96,
    meter: "4/4",
    feel: "Gulf syncopation, claps on backbeats",
    layers: "tablah or darbuka pattern, oud or saz color, warm bass, sparse keyboard pad",
  },
  tarab: {
    id: "tarab",
    label: "Arabic tarab",
    bpm: 88,
    meter: "4/4",
    feel: "rubato-friendly but steady pulse, emotional vocal ornaments",
    layers: "oud and qanun or strings bed, light riq, no EDM drops",
  },
  cinematic: {
    id: "cinematic",
    label: "cinematic",
    bpm: 92,
    meter: "4/4",
    feel: "wide dynamics, slow build, heroic chorus lift",
    layers: "orchestral strings pad, taiko or epic drums low in mix, one melodic lead, no busy pop percussion",
  },
  party: {
    id: "party",
    label: "dance pop",
    bpm: 122,
    meter: "4/4",
    feel: "four-on-the-floor club pulse",
    layers: "kick four-on-the-floor, sidechained bass, one bright synth hook, keep under four elements",
  },
});

const MIX_LINE =
  "Mix: lead vocal slightly forward and dry, drums and bass 2–3 dB under voice, sparse arrangement, leave headroom, tight kick-to-vocal pocket";

function envFlagEnabled(name, { defaultOn = false } = {}) {
  const v = String(process.env[name] || "").trim().toLowerCase();
  if (!v) return defaultOn;
  if (v === "1" || v === "true" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "no") return false;
  return defaultOn;
}

function lyriaPromptV2PreviewDefault() {
  return String(process.env.VERCEL_ENV || "").trim().toLowerCase() === "preview";
}

function resolveLyriaPromptV2Enabled(body, isAdmin = false) {
  if (isAdmin) {
    const raw = body?.lyriaPromptV2;
    if (raw === "0" || raw === 0 || raw === false || raw === "false") return false;
    if (raw === "1" || raw === 1 || raw === true || raw === "true") return true;
  }
  return envFlagEnabled("LYRIA_PROMPT_V2", { defaultOn: lyriaPromptV2PreviewDefault() });
}

function extractBpmFromText(text) {
  const m = String(text || "").match(/\b(\d{2,3})\s*bpm\b/i);
  if (!m) return 0;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 50 || n > 200) return 0;
  return n;
}

function extractMeterFromText(text) {
  const s = String(text || "").toLowerCase();
  if (/\b6\s*\/\s*8\b/.test(s) || /\b6-8\b/.test(s) || /ktakufti|dabke/i.test(s)) return "6/8";
  if (/\b3\s*\/\s*4\b/.test(s)) return "3/4";
  return "";
}

function inferGenrePack(styleRaw = "") {
  const s = String(styleRaw || "").toLowerCase();
  if (/\bdabke|ktakufti|mijwiz|dabkeh\b/.test(s)) return GENRE_PACKS.dabke;
  if (/\bballad|slow|piano ballad|acoustic ballad\b/.test(s)) return GENRE_PACKS.ballad;
  if (/\btrap|drill|hip hop|hip-hop|rap\b/.test(s)) return GENRE_PACKS.trap;
  if (/\bkhaliji|khaleeji|gulf\b/.test(s)) return GENRE_PACKS.khaliji;
  if (/\btarab|classic arabic\b/.test(s)) return GENRE_PACKS.tarab;
  if (/\bcinematic|epic|orchestral\b/.test(s)) return GENRE_PACKS.cinematic;
  if (/\bparty|dance|club|edm|house\b/.test(s)) return GENRE_PACKS.party;
  if (/\bpop|shaabi|arabic pop\b/.test(s)) return GENRE_PACKS.arabic_pop;
  return GENRE_PACKS.arabic_pop;
}

function fmtTime(sec) {
  const t = Math.max(0, Math.round(sec));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function buildArrangementLines({ durationSec, clip, meter, bpm }) {
  const total = clip ? 28 : Math.min(180, Math.max(60, Number(durationSec) || 180));
  const pct = (p) => Math.round((p / 100) * total);
  if (clip) {
    return normalizeLyriaArrangementLines(
      [
        `[0:00 - ${fmtTime(pct(30))}] Intro: set ${bpm} BPM ${meter} groove, sparse drums`,
        `[${fmtTime(pct(30))} - ${fmtTime(pct(78))}] Hook: vocal enters, chorus melody locked to grid`,
        `[${fmtTime(pct(78))} - ${fmtTime(total)}] Outro: resolve on hook, clean stop`,
      ].join("\n"),
    );
  }
  return normalizeLyriaArrangementLines(
    [
      `[0:00 - ${fmtTime(pct(8))}] Intro: establish ${bpm} BPM ${meter} pulse, minimal layers`,
      `[${fmtTime(pct(8))} - ${fmtTime(pct(28))}] Verse 1: same pocket, leave space for vocal`,
      `[${fmtTime(pct(28))} - ${fmtTime(pct(42))}] Chorus: hook melody, fuller drums not louder vocal`,
      `[${fmtTime(pct(42))} - ${fmtTime(pct(58))}] Verse 2: return to verse pocket`,
      `[${fmtTime(pct(58))} - ${fmtTime(pct(72))}] Chorus: repeat hook, steady tempo`,
      `[${fmtTime(pct(72))} - ${fmtTime(pct(85))}] Bridge or breath: strip layers briefly`,
      `[${fmtTime(pct(85))} - ${fmtTime(total)}] Final chorus: hook resolve, no new sections`,
    ].join("\n"),
  );
}

function buildVocalLineV2({ vocalGender, dialectHint, instrumental }) {
  if (instrumental) return "";
  const g = String(vocalGender || "").trim().toLowerCase();
  const dialect = String(dialectHint || "").trim();
  const dialectBit = dialect ? `${dialect}. ` : "";
  if (g === "f" || g === "female") {
    return `${dialectBit}Female lead: warm chest voice, close dry mic, controlled vibrato, mid register, no airy whistle tone`;
  }
  if (g === "duo") {
    return `${dialectBit}Duet: male baritone chest and female chest voice, verse tradeoffs, chorus blend, both dry and on-grid`;
  }
  if (g === "m" || g === "male" || !g) {
    return `${dialectBit}Male lead: baritone chest voice, low-mid register, conversational close mic, no falsetto or high tenor belt`;
  }
  return `${dialectBit}Lead vocal: chest register, close dry mic, on-beat syllable delivery`;
}

function buildStyleBlockV2({ pack, userStyle, songKey, moodHint }) {
  const bpm = pack.bpm;
  const meter = pack.meter;
  const bits = [
    `${pack.label}, ${moodHint || "emotional and clear"}`,
    `Tempo: ${bpm} BPM, time signature ${meter}, ${pack.feel}`,
    `Instrumentation (max 4 roles): ${pack.layers}`,
    MIX_LINE,
  ];
  const cleanUser = String(userStyle || "").trim();
  if (cleanUser && cleanUser.length > 12) {
    bits.push(`User direction: ${cleanUser.slice(0, 320)}`);
  }
  if (songKey) bits.push(`Key: ${songKey}`);
  return bits.filter(Boolean).join(". ").replace(/\.\s*\./g, ".").trim();
}

/**
 * @param {object} opts
 * @param {object} [opts.body]
 * @param {string} [opts.lyrics]
 * @param {string} [opts.title]
 * @param {boolean} [opts.instrumental]
 * @param {boolean} [opts.clip]
 * @param {number} [opts.durationSec]
 * @param {string} [opts.dialectHint]
 * @param {string} [opts.scriptFormat]
 * @param {string} [opts.vocalGender]
 * @param {string} [opts.songKey]
 * @param {boolean} [opts.photoMood]
 */
function buildLyriaPromptV2(opts = {}) {
  const body = opts.body && typeof opts.body === "object" ? opts.body : {};
  const instrumental = Boolean(opts.instrumental ?? body.instrumental);
  const clip = Boolean(opts.clip);
  const title = String(opts.title ?? body.title ?? "").trim();
  const lyricsRaw = String(opts.lyrics ?? body.prompt ?? "").trim();
  const ideaBrief = String(body.ideaBrief || "").trim();
  const dialectHint = String(opts.dialectHint ?? body.dialectHint ?? body.dialect ?? "").trim();
  const scriptFormat = String(opts.scriptFormat ?? body.scriptFormat ?? "").trim();
  const vocalGender = String(opts.vocalGender ?? body.vocalGender ?? "").trim();
  const songKey = String(opts.songKey ?? body.songKey ?? "").trim();
  const photoMood = Boolean(opts.photoMood);
  const durationSec = Number(opts.durationSec) || 0;

  const styleRaw = String(body.style || "").trim();
  const userStyle = buildLyriaDirectStylePrompt(body) || styleRaw.slice(0, 400);
  const pack = inferGenrePack(`${styleRaw} ${userStyle}`);
  const bpm = extractBpmFromText(styleRaw) || extractBpmFromText(userStyle) || pack.bpm;
  const meterOverride = extractMeterFromText(styleRaw) || extractMeterFromText(userStyle);
  const resolvedPack = {
    ...pack,
    bpm,
    meter: meterOverride || pack.meter,
  };

  const lyricText = instrumental ? "" : sanitizeLyriaLyricsForSinging(lyricsRaw);
  const arabizi = isArabiziScript({ scriptFormat, lyrics: lyricText || lyricsRaw });
  const arrangement = buildArrangementLines({
    durationSec,
    clip,
    meter: resolvedPack.meter,
    bpm: resolvedPack.bpm,
  });

  const blocks = [];
  const opener = instrumental ? "Create an instrumental track." : "Create a song.";
  const targetSec = clip ? 28 : Math.min(180, Math.max(60, durationSec || 180));
  blocks.push(
    `${opener} Target length about ${targetSec} seconds. One memorable chorus hook, steady tempo, vocal locked to the grid.`,
  );
  if (title) blocks.push(`Title: ${title}`);
  if (photoMood) {
    blocks.push("Music inspired by the mood and colors in the attached image");
  }
  blocks.push(buildStyleBlockV2({ pack: resolvedPack, userStyle, songKey, moodHint: "" }));
  const vocal = buildVocalLineV2({ vocalGender, dialectHint, instrumental });
  if (vocal) blocks.push(vocal);
  if (ideaBrief && !lyricText) {
    blocks.push(`Creative brief (do not sing): ${ideaBrief.slice(0, 500)}`);
  }

  if (arabizi && !instrumental) {
    blocks.push(
      buildLyriaArabiziPerformanceNote({
        dialect: dialectHint,
        dialectHint,
      }),
    );
  }

  blocks.push("");
  blocks.push("Arrangement:");
  blocks.push(arrangement);

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
    "Write and perform original compact lyrics: [Verse], [Chorus], [Verse], [Chorus], optional short [Bridge]. Short lines, 3–5 words each, one sticky chorus hook.",
  );
  return blocks.join("\n").slice(0, 8000);
}

module.exports = {
  GENRE_PACKS,
  resolveLyriaPromptV2Enabled,
  buildLyriaPromptV2,
  inferGenrePack,
};
