/** Map Create singer chip → male | female | duo | "". */
export function normalizeVocalGender(gender) {
  const g = String(gender || "").trim().toLowerCase();
  if (g === "f" || g === "female") return "f";
  if (g === "m" || g === "male") return "m";
  if (g === "duo" || g === "duet") return "duo";
  return "";
}

/**
 * Replace default style-line gender with the user's singer pick.
 * Empty gender leaves the line alone (style default). Duo is left as filled.
 */
export function applyVocalGenderToStyleLine(styleLine, gender) {
  const g = normalizeVocalGender(gender);
  let s = String(styleLine || "").trim();
  if (!g || g === "duo") return s;
  const want = g === "f" ? "female" : "male";
  const other = g === "f" ? "male" : "female";
  if (s) {
    s = s.replace(new RegExp(`\\b${other}\\b`, "gi"), want);
    s = s.replace(new RegExp(`\\b${want}\\s+${want}\\b`, "gi"), want);
  }
  const tag = `${want} lead vocal`;
  const hasWantVocal = new RegExp(
    `\\b${want}\\b(?:\\s+[A-Za-z-]+){0,3}\\s+(?:lead\\s+)?vocals?\\b`,
    "i",
  ).test(s);
  if (!s) return tag;
  if (!hasWantVocal) s = `${tag}, ${s}`;
  else if (!new RegExp(`^${want}\\s+lead\\s+vocal\\b`, "i").test(s)) s = `${tag}, ${s}`;
  return s.replace(/\s{2,}/g, " ").replace(/,\s*,/g, ", ").replace(/^,\s*|,\s*$/g, "").trim();
}
