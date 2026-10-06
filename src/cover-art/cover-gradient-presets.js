/**
 * Cover Studio gradient backgrounds — single source for studio picker + auto title covers.
 * Same angle as cover-studio drawBackground (160deg-ish via canvas linear gradient).
 */
export const COVER_STUDIO_GRADIENTS = [
  ["#23d5ab", "#7c5cff"],
  ["#ff7a59", "#7c5cff"],
  ["#141433", "#7c5cff"],
  ["#ffc45c", "#ff5fa2"],
  ["#0b1f2a", "#23d5ab"],
  ["#2b1055", "#d53369"],
];

/** @param {() => number} rng — 0..1 */
export function pickCoverStudioGradient(rng) {
  const list = COVER_STUDIO_GRADIENTS;
  const n = list.length;
  if (!n) return ["#23d5ab", "#7c5cff"];
  const i = Math.abs(Math.floor((typeof rng === "function" ? rng() : Math.random()) * n)) % n;
  return list[i];
}
