/**
 * Nabad Clip vocal character catalog — keep in sync with CLIP_VOCAL_PROFILES in src/app.js.
 * Each profile maps to a Lyria vocal profile line (positive character, not range labels).
 */

const CLIP_VOCAL_PROFILES = [
  {
    id: "male_jabali",
    gender: "m",
    label: "Folk",
    labelAr: "جبلي",
    spec: "Earthy folk chest voice with festive wedding energy. Best for Levantine dabke & jabali-style — Arabic or English.",
    lyriaVocalPrompt:
      "Male lead vocal: earthy Levantine mountain folk voice (ṣawt jabalī), festive dabke wedding energy, warm chest delivery, confident regional tone, slight natural texture",
  },
  {
    id: "male_bahha",
    gender: "m",
    label: "Grit",
    labelAr: "بحة",
    spec: "Warm rasp and texture — emotive, gritty, human. Pop, rock, or heartfelt tracks in any language.",
    lyriaVocalPrompt:
      "Male lead vocal: warm chest voice with noticeable baḥḥa (slight hoarseness and rasp), emotive delivery, textured and human, festive but controlled",
  },
  {
    id: "male_deep",
    gender: "m",
    label: "Deep",
    labelAr: "عميق",
    spec: "Low resonant chest — smooth, heavy, laid-back warmth. Slow R&B, romance, or Gulf-leaning vibes.",
    lyriaVocalPrompt:
      "Male lead vocal: deep resonant chest voice, thick full-bodied tone, smooth warm low register, laid-back romantic delivery",
  },
  {
    id: "female_warm",
    gender: "f",
    label: "Warm Pop",
    labelAr: "دافئ",
    spec: "Modern pop hook vocal — glossy, conversational, close-mic warmth. Works for upbeat Arabic or English choruses.",
    lyriaVocalPrompt:
      "Female lead vocal: warm modern pop tone, conversational close-mic delivery, soulful chest voice, sticky hook energy",
  },
  {
    id: "female_emotional",
    gender: "f",
    label: "Emotional",
    labelAr: "عاطفي",
    spec: "Soulful legato delivery — longing, expressive phrases. Ballads and emotional hooks in any language.",
    lyriaVocalPrompt:
      "Female lead vocal: soulful emotive delivery, warm legato phrasing, intimate longing tone, expressive but not belted",
  },
  {
    id: "female_soft",
    gender: "f",
    label: "Soft",
    labelAr: "ناعم",
    spec: "Breathy intimate vocal — delicate, close-mic, gentle and thin.",
    lyriaVocalPrompt:
      "Female lead vocal: soft breathy intimate delivery, delicate close-mic tone, gentle light register, whisper-soft verses opening into a warm chorus",
  },
];

function clipVocalProfileById(id) {
  const key = String(id || "").trim();
  if (!key) return null;
  return CLIP_VOCAL_PROFILES.find((p) => p.id === key) || null;
}

function clipVocalProfilesForGender(gender) {
  const g = String(gender || "").trim().toLowerCase();
  if (g !== "m" && g !== "f") return CLIP_VOCAL_PROFILES.slice();
  return CLIP_VOCAL_PROFILES.filter((p) => p.gender === g);
}

function defaultClipVocalProfileForGender(gender) {
  const list = clipVocalProfilesForGender(gender);
  return list[0] || CLIP_VOCAL_PROFILES[0] || null;
}

module.exports = {
  CLIP_VOCAL_PROFILES,
  clipVocalProfileById,
  clipVocalProfilesForGender,
  defaultClipVocalProfileForGender,
};
