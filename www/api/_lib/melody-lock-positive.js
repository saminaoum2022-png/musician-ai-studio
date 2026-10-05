/**
 * Positive-only wording for Melody Lock Lyria blocks (mirrors sanitizeStyleForLyria intent).
 */

function clauseLooksNegative(part) {
  const low = String(part || "").trim().toLowerCase();
  if (!low) return true;
  if (/^no\b/.test(low)) return true;
  if (/^not\b/.test(low)) return true;
  if (/\bnever\b/.test(low)) return true;
  if (/\bavoid\b/.test(low)) return true;
  if (/\bdon't\b/.test(low)) return true;
  if (/\bdo not\b/.test(low)) return true;
  if (/\bwithout\b/.test(low)) return true;
  return false;
}

function rewriteMelodyLockPositive(text) {
  let out = String(text || "");
  const replacements = [
    [/\bdo not invent\b/gi, "keep the written contour"],
    [/\bnever change\b/gi, "repeat the same intervals"],
    [/\bavoid improvisation\b/gi, "stay on the written tune"],
    [/\bno improvisation\b/gi, "stay on the written tune"],
    [/\bclose mic\b/gi, "sits inside the mix"],
    [/\bclose dry mic\b/gi, "sits inside the mix"],
  ];
  for (const [re, rep] of replacements) {
    out = out.replace(re, rep);
  }

  const lines = out.split("\n");
  const cleaned = lines.map((line) => {
    if (!line.includes(",")) return line.replace(/\b(no|not|never|avoid|don't|do not)\b/gi, "").trim();
    const parts = line.split(",").map((p) => p.trim()).filter(Boolean);
    const kept = parts.filter((p) => !clauseLooksNegative(p));
    return kept.join(", ");
  });
  out = cleaned.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return out;
}

function assertMelodyLockPromptPositive(text) {
  const low = String(text || "").toLowerCase();
  const bad = [];
  if (/\bnever\b/.test(low)) bad.push("never");
  if (/\bavoid\b/.test(low)) bad.push("avoid");
  if (/\bdon't\b/.test(low)) bad.push("don't");
  if (/\bdo not\b/.test(low)) bad.push("do not");
  if (/\bno improvisation\b/.test(low)) bad.push("no improvisation");
  return { ok: bad.length === 0, bad };
}

module.exports = {
  rewriteMelodyLockPositive,
  assertMelodyLockPromptPositive,
  clauseLooksNegative,
};
