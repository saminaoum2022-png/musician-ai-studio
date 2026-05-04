/**
 * POST /api/lyrics
 * Body: { seed?: string, style?: string, mode?: "continue"|"full"|"arrange" }
 *
 * Provider:
 * 1) Gemini only
 */
module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const body = await readJson(req);
    const seed = String(body?.seed || "").trim().slice(0, 3500);
    const style = String(body?.style || "").trim().slice(0, 700);
    const dialect = String(body?.dialect || "").trim().slice(0, 120);
    const dialectHint = String(body?.dialectHint || "").trim().slice(0, 220);
    const mode = detectModeFromSeed(seed, body?.mode);
    const nonce = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    const prompt = buildPrompt({ seed, style, mode, nonce, dialect, dialectHint });
    const complianceTerms = extractComplianceTerms({ seed, style });
    const sunoKey = process.env.SUNO_API_KEY || "";

    const debug = {};
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (geminiKey) {
      const gemResult = await tryGeminiLyrics({ geminiKey, prompt });
      if (gemResult?.ok) {
        const normalized = sanitizeLyricsOutput(gemResult.lyrics);
        const repaired = await maybeRepairOnce({
          text: normalized,
          prompt,
          complianceTerms,
          sunoKey,
          geminiKey,
        });
        return json(res, 200, {
          lyrics: repaired.text,
          provider: repaired.provider || "gemini",
          debug: { nonce, gemini: "ok" },
        });
      }
      debug.gemini = gemResult?.error || "failed";
    }

    return json(res, 502, {
      error: `Lyrics provider unavailable (Gemini): ${debug.gemini || "unknown upstream error"}`,
      provider: "none",
      debug: { ...debug, nonce },
    });
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
};

async function trySunoLyrics({ sunoKey, prompt }) {
  const endpoints = [
    "https://api.sunoapi.org/api/v1/lyrics/generate",
    "https://api.sunoapi.org/api/v1/generate/lyrics",
  ];

  for (const url of endpoints) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sunoKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });
      const text = await r.text().catch(() => "");
      const data = safeJson(text) || {};
      if (!r.ok) continue;
      const lyrics = extractLyricsFromAny(data) || extractTextLoose(data) || String(text || "").trim();
      if (lyrics) return { ok: true, lyrics };
      return { ok: false, error: "empty response" };
    } catch {
      // try next endpoint
    }
  }
  return { ok: false, error: "all endpoints failed" };
}

async function maybeRepairOnce({ text, prompt, complianceTerms, sunoKey, geminiKey }) {
  if (isCompliantEnough(text, complianceTerms)) return { text };
  const repairPrompt = [
    "Rewrite the lyrics to strictly follow the original request.",
    "Keep the same target language and topic.",
    "Output ONLY lyrics with section tags. No explanations or descriptions.",
    "",
    "Original generation request:",
    prompt,
    "",
    "Current non-compliant output to repair:",
    text,
  ].join("\n");
  if (sunoKey) {
    const s = await trySunoLyrics({ sunoKey, prompt: repairPrompt });
    if (s?.ok) {
      const out = sanitizeLyricsOutput(s.lyrics);
      if (out) return { text: out, provider: "suno-repair" };
    }
  }
  if (geminiKey) {
    const g = await tryGeminiLyrics({ geminiKey, prompt: repairPrompt });
    if (g?.ok) {
      const out = sanitizeLyricsOutput(g.lyrics);
      if (out) return { text: out, provider: "gemini-repair" };
    }
  }
  return { text };
}

async function tryGeminiLyrics({ geminiKey, prompt }) {
  const discovered = await listGeminiGenerateModels(geminiKey);
  const preferred = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"];
  const models = [...preferred, ...discovered].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  let lastError = discovered.length ? "unknown" : "no generateContent models discovered";
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9 },
      }),
    });
    const text = await r.text().catch(() => "");
    const data = safeJson(text) || {};
    if (!r.ok) {
      lastError = data?.error?.message || data?.error || text || `HTTP ${r.status}`;
      continue;
    }
    const out = extractGeminiText(data).trim();
    if (!out) {
      lastError = "empty response";
      continue;
    }
    return { ok: true, lyrics: out, model };
  }
  return { ok: false, error: String(lastError).slice(0, 280) };
}

async function listGeminiGenerateModels(geminiKey) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(geminiKey)}`;
    const r = await fetch(url);
    const text = await r.text().catch(() => "");
    const data = safeJson(text) || {};
    if (!r.ok) return [];
    const models = Array.isArray(data?.models) ? data.models : [];
    return models
      .filter((m) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
      .map((m) => String(m?.name || "").replace(/^models\//, "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function buildPrompt({ seed, style, mode, nonce, dialect, dialectHint }) {
  const dialectLines = [
    dialect ? `Target dialect/accent: ${dialect}` : "",
    dialectHint ? `Dialect hint line (follow this flavor): ${dialectHint}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  if (mode === "arrange") {
    return [
      "You are arranging user-provided lyrics for AI singing.",
      "Do NOT change theme or language. Do NOT invent a new story.",
      "Keep original lines as much as possible; only reorganize and lightly polish for flow.",
      "Output lyrics only with section tags.",
      "Use structure:",
      "[Verse 1]",
      "[Chorus]",
      "[Verse 2]",
      "[Chorus]",
      "[Bridge]",
      "[Final Chorus]",
      "[Outro]",
      "In [Outro], include a clear musical ending phrase.",
      `Variation token: ${nonce}`,
      ...(dialectLines ? [dialectLines] : []),
      style ? `Style/Tags: ${style}` : "Style/Tags: none",
      "",
      "User lyrics to arrange:",
      seed || "(none)",
    ].join("\n");
  }
  if (mode === "continue") {
    return [
      "Continue the user's lyrics in the same mood, theme, and language.",
      "Do not rewrite existing lines.",
      "Output lyrics only.",
      ...(dialectLines ? [dialectLines] : []),
      style ? `Style/Tags: ${style}` : "Style/Tags: none",
      "",
      `Variation token: ${nonce}`,
      "Existing lyrics:",
      seed || "(none)",
    ].join("\n");
  }
  return [
    "Write complete singable lyrics for AI song generation.",
    "Output lyrics only.",
    "Use this structure exactly:",
    "[Verse 1]",
    "[Chorus]",
    "[Verse 2]",
    "[Chorus]",
    "[Bridge]",
    "[Final Chorus]",
    "[Outro]",
    "Make the [Outro] contain a clear ending phrase so the song can finish naturally.",
    `Variation token: ${nonce}`,
    ...(dialectLines ? [dialectLines] : []),
    style ? `Style/Tags: ${style}` : "Style/Tags: none",
    seed ? `Use this seed idea:\n${seed}` : "No seed provided; create a coherent theme.",
  ].join("\n");
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((p) => (typeof p?.text === "string" ? p.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractLyricsFromAny(data) {
  return (
    data?.lyrics ||
    data?.data?.lyrics ||
    data?.result?.lyrics ||
    data?.response?.lyrics ||
    data?.data?.response?.lyrics ||
    ""
  );
}

function extractTextLoose(data) {
  if (typeof data?.text === "string") return data.text;
  if (typeof data?.data?.text === "string") return data.data.text;
  if (typeof data?.message === "string") return data.message;
  return "";
}

function sanitizeLyricsOutput(input) {
  const allowedHeader = /^\[(verse|chorus|bridge|outro|intro|final chorus|pre-chorus|hook|refrain|verse \d+|chorus \d+)\]$/i;
  return String(input || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((line) => {
      if (allowedHeader.test(line)) return true;
      if (/^style\s*:/i.test(line)) return false;
      if (/^(description|note|explanation|theme|meaning)\s*:/i.test(line)) return false;
      if (/^\(.*\)$/.test(line)) return false;
      return true;
    })
    .join("\n")
    .trim();
}

function extractComplianceTerms({ seed, style }) {
  const text = `${seed || ""} ${style || ""}`.toLowerCase();
  const raw = text.match(/[a-zA-Z\u0600-\u06FF]{4,}/g) || [];
  const stop = new Set(["verse", "chorus", "bridge", "outro", "style", "tags", "with", "from", "this", "that"]);
  return [...new Set(raw.filter((w) => !stop.has(w)).slice(0, 8))];
}

function isCompliantEnough(text, terms) {
  if (!terms?.length) return true;
  const t = String(text || "").toLowerCase();
  let hit = 0;
  for (const k of terms) if (t.includes(k)) hit += 1;
  return hit >= Math.max(1, Math.ceil(terms.length * 0.25));
}

function buildFallbackLyrics({ seed, style, mode }) {
  const cleanedSeed = cleanSeedForFallback(seed);
  const isBirthday = /(birthday|عيد\s*ميلاد|عيدك|ميلاد)/i.test(String(seed || ""));
  const personName = extractRequestedName(seed) || "حبيبي";
  const v = pickVariantSeed(`${seed}|${style}|${mode}`);
  const flavor = style ? `Style: ${style}` : "Style: modern pop";
  if (mode === "arrange" && seed) {
    return [
      "[Verse 1]",
      seed,
      "",
      "[Chorus]",
      "Repeat your core emotional line here with a strong melodic hook",
      "",
      "[Verse 2]",
      "Continue the same narrative with tighter rhythm and imagery",
      "",
      "[Bridge]",
      "Shift perspective briefly, then build tension",
      "",
      "[Final Chorus]",
      "Return to chorus with bigger emotional delivery",
      "",
      "[Outro]",
      "Final soft line, hold the last word, and let the music end naturally",
    ].join("\n");
  }
  if (mode === "continue" && seed) {
    return [
      "[Continued Verse]",
      `I keep your words alive in the silence tonight`,
      `Same fire, same feeling, same moonlight`,
      `Every line you started keeps calling my name`,
      ``,
      "[Chorus]",
      `Stay with this rhythm, don't fade from my side`,
      `We rise and we fall, but we hold to the tide`,
      `From whisper to thunder, the heart stays the same`,
      ``,
      "[Outro]",
      `One last breath, one last line, let the music rest now`,
      `Soft ending, final chord, and we fade out`,
    ].join("\n");
  }
  return [
    `${flavor}`,
    "",
    "[Verse 1]",
    isBirthday
      ? `الليلة عيدك يا ${personName}، والفرحة ماليه المكان`
      : "في ليل هادي، قلبي يمشي مع الإيقاع",
    isBirthday
      ? (v % 2 === 0 ? "يا أغلى اسم بالقلب، يا نبضة حب وأمان" : "يا نور عيون الأحباب، يا بسمة عمر وزمان")
      : "كل كلمة فيها ذكرى، وكل ذكرى فيها صوت",
    "",
    "[Chorus]",
    isBirthday
      ? (v % 3 === 0 ? `عيدك سعيد يا ${personName}، يا فرحة قلب وأهل` : `كل سنة وأنت بخير يا ${personName}، يا أجمل لحن ينقال`)
      : "ليلة عيد وفرح، والضحكة بكل الأركان",
    isBirthday
      ? (v % 2 === 0 ? "نغني لك من قلبنا، وتكبر ضحكتك هالليلة" : "يا طيب الروح والوجه، حضورك يملأ الليلة")
      : "يا أجمل صوت ينادي، يا دفا روح وزمان",
    "",
    "[Verse 2]",
    isBirthday
      ? (v % 2 === 0 ? "كل ذكرى معك حلوة، وكل لحظة صارت ألوان" : "نمشي وياك الحلم، ونكتب فرحة على العنوان")
      : "كل لحظة فيها معنى، وكل معنى فيه امتنان",
    "",
    "[Bridge]",
    isBirthday
      ? "نرفع كفوف الدعاء، وتبقى سعيد بكل زمان"
      : "نرفع صوت المحبة، لين يكتمل هالغنا",
    "",
    "[Final Chorus]",
    isBirthday
      ? `كل سنة وأنت بخير يا ${personName}، يا أجمل لحن ينقال`
      : "ليلة عيد وفرح، والضحكة بكل الأركان",
    isBirthday
      ? "من قلبنا نهديك فرحة، وتبقى بخير على طول"
      : "يا أجمل صوت ينادي، يا دفا روح وزمان",
    "",
    "[Outro]",
    isBirthday
      ? "آخر نغمة تهدى شوي، ونختمها بدعوة أمان"
      : "آخر نغمة تهدى شوي، ونختمها بأجمل بيان",
  ].join("\n");
}

function cleanSeedForFallback(seed) {
  const s = String(seed || "")
    .replace(/\b(generate|write|song|lyrics|arrange|in arabic|in english)\b/gi, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.slice(0, 48);
}

function extractRequestedName(seed) {
  const s = String(seed || "");
  const m1 = s.match(/\bname\s+([A-Za-z\u0600-\u06FF]{2,})/i);
  if (m1?.[1]) return m1[1];
  const m2 = s.match(/(?:اسم|لل?|لـ)\s*([A-Za-z\u0600-\u06FF]{2,})/i);
  if (m2?.[1]) return m2[1];
  return "";
}

function pickVariantSeed(text) {
  let h = 0;
  for (let i = 0; i < String(text).length; i += 1) h = (h * 31 + String(text).charCodeAt(i)) >>> 0;
  h = (h + Date.now()) >>> 0;
  return h % 7;
}

function detectModeFromSeed(seed, requestedMode) {
  if (requestedMode === "arrange" || requestedMode === "continue" || requestedMode === "full") return requestedMode;
  const s = String(seed || "");
  const count = countSentences(s);
  const hasSections = /\[(verse|chorus|bridge|outro|intro|final chorus|pre-chorus|hook|refrain)/i.test(s);
  if (hasSections && count >= 8) return "arrange";
  if (count >= 3) return "continue";
  return "full";
}

function countSentences(text) {
  const t = String(text || "").trim();
  if (!t) return 0;
  return t.split(/[.!?\n]+/).map((p) => p.trim()).filter(Boolean).length;
}

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function safeJson(txt) {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}
