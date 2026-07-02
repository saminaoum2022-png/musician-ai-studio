/** Splash-screen gradient N — app mark (not the legacy equalizer logo). */
export const SPLASH_MARK_URL = "./assets/icons/splash-mark.png";

/** Static music-note tile — never the Nabad logo. */
export const DEFAULT_SONG_COVER_URL = "./assets/cover-placeholder.svg";

export function playerEmptyArtUrl() {
  return SPLASH_MARK_URL;
}

export function isLogoCoverUrl(src) {
  const s = String(src || "");
  return /nabadai-logo\.png/i.test(s) || /splash-mark\.png/i.test(s);
}

export function isDefaultSongCoverUrl(src) {
  const s = String(src || "").trim();
  if (!s) return true;
  if (isLogoCoverUrl(s)) return true;
  return /cover-placeholder\.svg/i.test(s);
}

/** Song cover URLs only — maps empty / logo to the music placeholder. */
export function normalizeSongCoverUrl(src) {
  const s = String(src || "").trim();
  if (!s || isLogoCoverUrl(s)) return DEFAULT_SONG_COVER_URL;
  return s;
}
