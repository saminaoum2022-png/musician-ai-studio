/**
 * POST /api/lyrics
 * Body: { seed?: string, style?: string, mode?: "continue"|"full"|"arrange"|"challenge"|"remix_reply"|"diacritics"|"enhance"|"fix_singing"|"singability_check"|"to_arabizi", sourceLyrics?: string, sourceTitle?: string, sourceCreator?: string, lyricsProvider?: "gemini"|"suno", scriptFormat?: "arabic"|"arabizi"|"auto" }
 *
 * Provider: Gemini by default (GEMINI_API_KEY; rhyme/qafiya in buildPrompt).
 * Suno only when lyricsProvider is explicitly "suno" (costs Suno credits).
 */
const { queueLogProviderUsage } = require("./_lib/provider-usage-log");
const {
  looksLikeArabizi,
  resolveScriptFormat,
  buildArabiziPromptLines,
  buildToArabiziConversionLines,
} = require("./_lib/arabizi");
const {
  dialectFlags,
  isArabicLyricsContext,
  buildColloquialArabicGenerationLines,
  buildLebaneseDiacriticsLinesAr,
  buildLebaneseDiacriticsLinesEn,
  buildLevantineDiacriticsLinesAr,
  buildLevantineDiacriticsLinesEn,
  stripColloquialTanween,
  lightenSungArabicDiacritics,
} = require("./_lib/arabic-dialect-lyrics");

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const body = await readJson(req);
    const seed = String(body?.seed || "").trim().slice(0, 3500);
    const style = String(body?.style || "").trim().slice(0, 700);
    const dialect = String(body?.dialect || "").trim().slice(0, 120);
    const dialectHint = String(body?.dialectHint || "").trim().slice(0, 500);
    const sourceLyrics = String(body?.sourceLyrics || "").trim().slice(0, 3500);
    const sourceTitle = String(body?.sourceTitle || "").trim().slice(0, 160);
    const sourceCreator = String(body?.sourceCreator || "").trim().slice(0, 80);
    const lyricsProvider = String(body?.lyricsProvider || body?.providerPreference || "").trim().toLowerCase();
    const scriptFormat = resolveScriptFormat(body, seed);
    const requestedMode = String(body?.mode || "").trim().toLowerCase();
    const sunoLyricsRequested =
      lyricsProvider === "suno"
      && requestedMode !== "remix_reply"
      && requestedMode !== "diacritics"
      && requestedMode !== "enhance"
      && requestedMode !== "fix_singing"
      && requestedMode !== "singability_check"
      && requestedMode !== "to_arabizi";
    if (requestedMode === "diacritics" && !seed) {
      return json(res, 400, {
        error: "Add vowel marks needs existing Arabic lyrics in the box.",
        provider: "none",
        debug: { mode: "diacritics", seed: "missing" },
      });
    }
    if (requestedMode === "enhance" && !seed) {
      return json(res, 400, {
        error: "Polish lyrics needs existing lyrics in the box.",
        provider: "none",
        debug: { mode: "enhance", seed: "missing" },
      });
    }
    if ((requestedMode === "fix_singing" || requestedMode === "singability_check") && !seed) {
      return json(res, 400, {
        error: "Add lyrics first, then check or fix singability.",
        provider: "none",
        debug: { mode: requestedMode, seed: "missing" },
      });
    }
    if (requestedMode === "to_arabizi" && !seed) {
      return json(res, 400, {
        error: "Add Arabic lyrics first, then convert to Arabizi.",
        provider: "none",
        debug: { mode: "to_arabizi", seed: "missing" },
      });
    }
    if (requestedMode === "remix_reply" && !sourceLyrics) {
      return json(res, 400, {
        error: "Remix reply needs the original song lyrics. Wait for them to load, then try again.",
        provider: "none",
        debug: { mode: "remix_reply", sourceLyrics: "missing" },
      });
    }
    const mode = requestedMode === "remix_reply" && sourceLyrics
      ? "remix_reply"
      : requestedMode === "diacritics"
        ? "diacritics"
        : requestedMode === "enhance"
          ? "enhance"
          : requestedMode === "fix_singing"
            ? "fix_singing"
            : requestedMode === "singability_check"
              ? "singability_check"
              : requestedMode === "to_arabizi"
                ? "to_arabizi"
              : detectModeFromSeed(seed, body?.mode);
    const nonce = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    const prompt = buildPrompt({ seed, style, mode, nonce, dialect, dialectHint, sourceLyrics, sourceTitle, sourceCreator, scriptFormat });
    const sunoPrompt = buildSunoPrompt({ seed, style, mode, dialect, dialectHint });
    const complianceTerms = mode === "remix_reply"
      ? [...new Set([
        ...extractComplianceTerms({ seed: sourceLyrics, style }),
        ...extractComplianceTerms({ seed, style }),
      ])]
      : mode === "diacritics" || mode === "enhance" || mode === "fix_singing" || mode === "singability_check" || mode === "to_arabizi"
        ? []
        : extractComplianceTerms({ seed, style });
    const geminiTemperature = mode === "remix_reply"
      ? 0.72
      : mode === "to_arabizi"
        ? 0.1
      : mode === "diacritics"
        ? 0.35
        : mode === "enhance"
          ? 0.58
          : mode === "fix_singing"
            ? 0.52
            : mode === "singability_check"
              ? 0.25
              : 0.9;
    const geminiPreferredModels = mode === "to_arabizi"
      ? ["gemini-2.5-flash", "gemini-2.0-flash"]
      : null;
    const sunoKey = process.env.SUNO_API_KEY || "";

    const debug = {};
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!sunoLyricsRequested) {
      if (!geminiKey) {
        return json(res, 502, {
          error: "Gemini lyrics provider unavailable: missing GEMINI_API_KEY",
          provider: "none",
          debug: { nonce, gemini: "missing_gemini_key" },
        });
      }
      const gemResult = await tryGeminiLyrics({
        geminiKey,
        prompt,
        temperature: geminiTemperature,
        preferredModels: geminiPreferredModels,
      });
      if (gemResult?.ok) {
        if (mode === "singability_check") {
          const report = parseSingabilityReport(gemResult.lyrics);
          if (!report) {
            return json(res, 502, {
              error: "Could not read singability check — try again.",
              provider: "none",
              debug: { nonce, gemini: "bad_json", mode },
            });
          }
          queueLogProviderUsage({ provider: "gemini", kind: "lyrics" });
          return json(res, 200, {
            ok: true,
            singability: report,
            provider: "gemini",
            debug: { nonce, gemini: "ok", mode },
          });
        }
        let normalized = sanitizeLyricsOutput(gemResult.lyrics);
        const flags = dialectFlags(dialect, dialectHint);
        const arabicScript = isArabicLyricsContext({ dialect, dialectHint, scriptFormat, seed });
        if (mode === "diacritics") {
          normalized = lightenSungArabicDiacritics(normalized, {
            isMsa: flags.isMsa,
            isLebanese: flags.isLebanese,
          });
        } else if (arabicScript && !flags.isMsa) {
          normalized = stripColloquialTanween(normalized);
        }
        if (mode === "remix_reply" && isMetaAiLyrics(normalized)) {
          const fixed = await repairMetaAiLyrics({ geminiKey, prompt, text: normalized, temperature: geminiTemperature });
          if (fixed) normalized = fixed;
        }
        const repaired = mode === "enhance" || mode === "diacritics" || mode === "fix_singing" || mode === "to_arabizi"
          ? { text: normalized, provider: "gemini" }
          : await maybeRepairOnce({
            text: normalized,
            prompt,
            complianceTerms,
            sunoKey: "",
            geminiKey,
            temperature: geminiTemperature,
          });
        if (String(repaired.provider || "").includes("gemini")) {
          queueLogProviderUsage({ provider: "gemini", kind: "lyrics" });
        }
        return json(res, 200, {
          lyrics: repaired.text,
          provider: repaired.provider || "gemini",
          debug: { nonce, gemini: "ok", lyricsProvider: "gemini", mode },
        });
      }
      return json(res, 502, {
        error: `Gemini lyrics provider unavailable: ${gemResult?.error || "failed"}`,
        provider: "none",
        debug: { nonce, gemini: gemResult?.error || "failed", lyricsProvider: "gemini" },
      });
    }

    if (sunoKey) {
      const { host, proto } = getHostProto(req);
      const callBackUrl = `${proto}://${host}/api/suno/callback`;
      const sunoResult = await trySunoLyrics({ sunoKey, prompt: sunoPrompt, callBackUrl });
      if (sunoResult?.ok) {
        const normalized = sanitizeSunoLyricsOutput(sunoResult.lyrics);
        if (normalized) {
          return json(res, 200, {
            lyrics: normalized,
            provider: "suno",
            title: sunoResult.title || "",
            debug: { nonce, suno: "ok", taskId: sunoResult.taskId || "", verbatim: true },
          });
        }
      }
      debug.suno = sunoResult?.error || "failed";
    } else {
      debug.suno = "missing_suno_key";
    }

    if (geminiKey) {
      const gemResult = await tryGeminiLyrics({ geminiKey, prompt, temperature: geminiTemperature });
      if (gemResult?.ok) {
        let normalized = sanitizeLyricsOutput(gemResult.lyrics);
        const flags = dialectFlags(dialect, dialectHint);
        const arabicScript = isArabicLyricsContext({ dialect, dialectHint, scriptFormat, seed });
        if (mode === "diacritics") {
          normalized = lightenSungArabicDiacritics(normalized, {
            isMsa: flags.isMsa,
            isLebanese: flags.isLebanese,
          });
        } else if (arabicScript && !flags.isMsa) {
          normalized = stripColloquialTanween(normalized);
        }
        if (mode === "remix_reply" && isMetaAiLyrics(normalized)) {
          const fixed = await repairMetaAiLyrics({ geminiKey, prompt, text: normalized, temperature: geminiTemperature });
          if (fixed) normalized = fixed;
        }
        const repaired = await maybeRepairOnce({
          text: normalized,
          prompt,
          complianceTerms,
          sunoKey,
          geminiKey,
          temperature: geminiTemperature,
        });
        if (String(repaired.provider || "").includes("gemini")) {
          queueLogProviderUsage({ provider: "gemini", kind: "lyrics" });
        }
        return json(res, 200, {
          lyrics: repaired.text,
          provider: repaired.provider || "gemini",
          debug: { ...debug, nonce, gemini: "ok", mode },
        });
      }
      debug.gemini = gemResult?.error || "failed";
    }

    return json(res, 502, {
      error: `Lyrics providers unavailable: engine=${debug.suno || "-"} gemini=${debug.gemini || "-"}`,
      provider: "none",
      debug: { ...debug, nonce },
    });
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
};

async function trySunoLyrics({ sunoKey, prompt, callBackUrl }) {
  const createUrl = "https://api.sunoapi.org/api/v1/lyrics";
  try {
    const created = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sunoKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: String(prompt || "").slice(0, 200), callBackUrl }),
    });
    const createText = await created.text().catch(() => "");
    const createData = safeJson(createText) || {};
    if (!created.ok || (createData.code && Number(createData.code) !== 200)) {
      return { ok: false, error: createData?.msg || createData?.error || createText || `create_http_${created.status}` };
    }
    const taskId = String(createData?.data?.taskId || createData?.taskId || "").trim();
    if (!taskId) return { ok: false, error: "missing_task_id" };

    for (let i = 0; i < 8; i += 1) {
      if (i > 0) await delay(1500);
      const info = await fetch(`https://api.sunoapi.org/api/v1/lyrics/record-info?taskId=${encodeURIComponent(taskId)}`, {
        headers: { Authorization: `Bearer ${sunoKey}` },
      });
      const text = await info.text().catch(() => "");
      const data = safeJson(text) || {};
      if (!info.ok || (data.code && Number(data.code) !== 200)) {
        return { ok: false, error: data?.msg || data?.error || text || `status_http_${info.status}`, taskId };
      }
      const extracted = extractSunoLyricsFromRecord(data);
      if (extracted?.lyrics) {
        return { ok: true, taskId, lyrics: extracted.lyrics, title: extracted.title || "" };
      }
      const status = String(data?.data?.status || data?.status || "").toUpperCase();
      if (["CREATE_TASK_FAILED", "GENERATE_LYRICS_FAILED", "CALLBACK_EXCEPTION", "SENSITIVE_WORD_ERROR"].includes(status)) {
        return { ok: false, error: status.toLowerCase(), taskId };
      }
    }
    return { ok: false, error: "poll_timeout", taskId };
  } catch (e) {
    return { ok: false, error: String(e?.message || e || "suno_failed").slice(0, 180) };
  }
}

async function maybeRepairOnce({ text, prompt, complianceTerms, sunoKey, geminiKey, temperature = 0.9 }) {
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
  if (geminiKey) {
    const g = await tryGeminiLyrics({ geminiKey, prompt: repairPrompt, temperature });
    if (g?.ok) {
      const out = sanitizeLyricsOutput(g.lyrics);
      if (out) return { text: out, provider: "gemini-repair" };
    }
  }
  return { text };
}

function isMetaAiLyrics(text) {
  const t = String(text || "").toLowerCase();
  const patterns = [
    /\b(artificial intelligence|language model|chatbot|chat bot)\b/,
    /\b(i am|i'm|i’m)\s+(an?\s+)?(ai|system|bot|robot|machine)\b/,
    /\b(built from|trained on)\s+(data|code)\b/,
    /ذكاء\s*اصطناع/,
    /\bانا\s+نظام\b/,
    /\bما\s+عندي\s+(قلب|روح)\b/,
    /\bمن\s+(هال|ال)?بيانات\b/,
    /\bvoice\s+(assistant|system)\b/,
    /\bgenerat(e|ing)\s+lyrics\b/,
    /\bnot\s+just\s+silence\b/,
  ];
  return patterns.some((re) => re.test(t));
}

async function repairMetaAiLyrics({ geminiKey, prompt, text, temperature = 0.72 }) {
  const repairPrompt = [
    "The lyrics below broke the rules by describing AI, software, systems, data, or having no heart/soul.",
    "Rewrite as a HUMAN singer replying to another human in the same love/story song.",
    "Never mention AI, systems, algorithms, data, chatbots, or that you are generating text.",
    "Stay in the original song's emotional story. Output ONLY lyrics with section tags.",
    "",
    "Original request:",
    prompt,
    "",
    "Bad meta output to replace:",
    text,
  ].join("\n");
  const g = await tryGeminiLyrics({ geminiKey, prompt: repairPrompt, temperature });
  if (!g?.ok) return "";
  const out = sanitizeLyricsOutput(g.lyrics);
  return out && !isMetaAiLyrics(out) ? out : "";
}

async function tryGeminiLyrics({ geminiKey, prompt, temperature = 0.9, preferredModels = null }) {
  const discovered = await listGeminiGenerateModels(geminiKey);
  const preferred = Array.isArray(preferredModels) && preferredModels.length
    ? preferredModels
    : ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"];
  const models = [...preferred, ...discovered].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  let lastError = discovered.length ? "unknown" : "no generateContent models discovered";
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: Number(temperature) || 0.9 },
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

const POP_RHYME_SCHEME_LINES = [
  "Any section (verse, chorus, bridge, pre-chorus) can use any clear rhyme scheme — AABB, ABAB, ABBA, ABCB, AAAA, AAAB, AABA, AA, repeating hook lines, etc.",
  "Pick one scheme per section and keep it consistent; do not mix patterns mid-section.",
  "Do not favor one scheme for chorus vs verse — match what fits the song.",
  "Arabic / Levantine: parallel couplets (موازي) — matching grammar slot and similar مقاطع per line help singability in any scheme.",
  "Optional radif (رديف): repeat the same tail phrase after the rhyme word when it fits naturally.",
];

const POP_RHYME_METER_LINES = [
  "Rhythm & rhyme (required):",
  "- Within each section, keep lines a similar length with a clear singable rhythm.",
  "- Use end-rhyme (qafiya): paired lines should share the same or near ending sound where natural.",
  ...POP_RHYME_SCHEME_LINES.map((line) => `- ${line}`),
  "- Do not sacrifice dialect, meaning, or natural speech for forced rhyme. Near-rhyme is fine, especially in colloquial Arabic.",
  "- Do not print rhyme scheme labels — output lyrics with section tags only.",
];

const POP_RHYME_METER_LINES_LIGHT = [
  "Rhythm & rhyme:",
  "- Preserve the user's words; lightly adjust line breaks or endings so paired lines rhyme or near-rhyme where possible.",
  "- Keep lines a similar length within each section for singable rhythm.",
];

const POP_RHYME_METER_LINES_CONTINUE = [
  "Rhythm & rhyme:",
  "- Match the rhyme pattern and line length of the existing lyrics.",
  "- New lines should rhyme with the established scheme in each section.",
];

const FIX_SINGING_LINES = [
  "Fix these lyrics for AI singing — prioritize singability (wazen/وزن, qafiya/قافية, balanced lines).",
  "- Keep the SAME story, meaning, names, and dialect. Do NOT rewrite from scratch.",
  "- Balance line length within each section (similar syllable count / مقاطع per line).",
  "- Fix end-rhyme to match each section's existing scheme (AABB, ABAB, ABBA, ABCB, AAAA, AAAB, AABA, etc.) — do not swap schemes unless rhyme is broken.",
  "- For Arabic / Levantine: strengthen parallel couplets (موازي) — same opener or mirrored line shape within paired lines.",
  "- Lebanese: tight stopped word endings (sukoon feel) — never tanween (ًٌٍ) or MSA nahwi endings unless user asked.",
  "- Adjust word choice, line breaks, or endings only as needed — keep natural colloquial speech.",
  "- For Arabic: think pop-song feet/stress (أوف), not classical عروض exam.",
  "- Keep all section tags [Verse] [Chorus] etc.",
  "- Do NOT add heavy tashkeel — vowel marks are a separate step.",
  "- Output lyrics only with section tags. No explanations.",
];

function parseSingabilityReport(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  let data = null;
  try { data = JSON.parse(candidate); } catch { data = null; }
  if (!data || typeof data !== "object") return null;
  const warnings = Array.isArray(data.warnings)
    ? data.warnings
      .map((w) => ({
        level: ["high", "medium", "low"].includes(String(w?.level || "").toLowerCase())
          ? String(w.level).toLowerCase()
          : "medium",
        section: String(w?.section || "Lyrics").trim() || "Lyrics",
        line: Number(w?.line) > 0 ? Number(w.line) : null,
        message: String(w?.message || "").trim(),
      }))
      .filter((w) => w.message)
    : [];
  const scoreRaw = Number(data.score);
  const score = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : null;
  const ready = typeof data.ready === "boolean" ? data.ready : null;
  const summary = String(data.summary || "").trim();
  if (!summary && !warnings.length && score == null) return null;
  return {
    score,
    ready: ready ?? (score != null ? score >= 75 && !warnings.some((w) => w.level === "high") : null),
    summary: summary || (warnings.length ? "Review singability warnings before generating." : "Looks singable."),
    warnings,
  };
}

const REMIX_REPLY_GUARDRAILS = [
  "STRICT — you are writing lyrics for a HUMAN singer (Person B) answering another HUMAN singer (Person A).",
  "NEVER mention AI, artificial intelligence, systems, algorithms, data, chatbots, robots, or software.",
  "NEVER say you have no heart/soul or that you are a machine, program, or voice assistant.",
  "Do NOT write about listeners, voices in abstract, or 'the one who spoke before me' as a meta concept — respond to the STORY in the original lyrics (love, sadness, names, situation).",
  "Echo specific feelings, names, or images from the original song so the reply clearly connects.",
];

function buildPrompt({ seed, style, mode, nonce, dialect, dialectHint, sourceLyrics, sourceTitle, sourceCreator, scriptFormat = "latin" }) {
  const dialectLines = [
    dialect ? `Target dialect/accent: ${dialect}` : "",
    dialectHint ? `Dialect hint line (follow this flavor): ${dialectHint}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const useArabizi = scriptFormat === "arabizi" || (scriptFormat !== "arabic" && looksLikeArabizi(seed));
  const arabiziLines = useArabizi ? buildArabiziPromptLines({ dialect, dialectHint }) : [];
  const scriptLines = useArabizi ? arabiziLines : [];
  const flags = dialectFlags(dialect, dialectHint);
  const colloquialArabicLines = isArabicLyricsContext({ dialect, dialectHint, scriptFormat, seed })
    ? buildColloquialArabicGenerationLines(flags)
    : [];
  if (mode === "to_arabizi") {
    return [
      ...buildToArabiziConversionLines({ dialect, dialectHint }),
      ...(dialectLines ? [dialectLines] : []),
      style ? `Style/Tags (context only): ${style}` : "",
      "",
      "Lyrics to convert:",
      seed,
    ].filter(Boolean).join("\n");
  }
  if (mode === "diacritics") {
    const dialectRaw = String(dialect || "").trim();
    const dialectLower = dialectRaw.toLowerCase();
    const isMsa = flags.isMsa;
    const isLebanese = flags.isLebanese;
    const isLevantineColloquial = flags.isLevantineColloquial;
    // Friendly names match Create chips so Gemini gets the same simple ask
    // that works in Coach — short + dialect-named, not a soft essay.
    const dialectSpeak =
      /levantine|lebanese/.test(dialectLower) ? "Lebanese / Levantine (لبنانية محكية)"
      : /egyptian/.test(dialectLower) ? "Egyptian (مصرية محكية)"
      : /iraqi/.test(dialectLower) ? "Iraqi (عراقية محكية)"
      : /gulf|khaleeji|خليج/.test(dialectLower) ? "Gulf / Khaleeji (خليجية محكية)"
      : /maghrebi|moroccan|دارجة/.test(dialectLower) ? "Moroccan / Maghrebi (دارجة محكية)"
      : /syrian/.test(dialectLower) ? "Syrian (سورية محكية)"
      : /palestinian/.test(dialectLower) ? "Palestinian (فلسطينية محكية)"
      : /tunisian/.test(dialectLower) ? "Tunisian (تونسية محكية)"
      : /sudanese/.test(dialectLower) ? "Sudanese (سودانية محكية)"
      : isMsa ? "Modern Standard Arabic / فصحى"
      : dialectRaw || "colloquial sung Arabic (محكية للغناء)";
    const dialectAr =
      /levantine|lebanese/.test(dialectLower) ? "اللهجة اللبنانية المحكية"
      : /egyptian/.test(dialectLower) ? "اللهجة المصرية المحكية"
      : /iraqi/.test(dialectLower) ? "اللهجة العراقية المحكية"
      : /gulf|khaleeji|خليج/.test(dialectLower) ? "اللهجة الخليجية المحكية"
      : /maghrebi|moroccan|دارجة/.test(dialectLower) ? "الدارجة المغاربية المحكية"
      : /syrian/.test(dialectLower) ? "اللهجة السورية المحكية"
      : /palestinian/.test(dialectLower) ? "اللهجة الفلسطينية المحكية"
      : /tunisian/.test(dialectLower) ? "اللهجة التونسية المحكية"
      : /sudanese/.test(dialectLower) ? "اللهجة السودانية المحكية"
      : isMsa ? "الفصحى"
      : "اللهجة العربية المحكية للغناء";
    return [
      `حَرِّك الكلمات ب${dialectAr} عشان الغناء يطلع باللهجة — مثل Coach، مش تشكيل مدرسي.`,
      "نفس الكلمات، نفس الأسطر، نفس الوسوم [Verse] [Chorus]… أخرج الكلمات فقط.",
      isMsa
        ? "فصحى: تشكيل أوضح مقبول، بس بدون مبالغة على كل حرف — لا تنوين إلا إذا طلب المستخدم إعراباً صراحة."
        : isLebanese
        ? buildLebaneseDiacriticsLinesAr().join("\n")
        : isLevantineColloquial
        ? buildLevantineDiacriticsLinesAr().join("\n")
        : [
          "لا تشكّل كل حرف — شكّل الكلمات يلي ممكن يغلط فيها الغناء + سكّون على السوكن.",
          "ممنوع: تنوين (ًٌٍ)، إعراب، أو تشكيل نحوي على آخر الكلمات.",
          "ق باللهجة المحكية = همزة (2) مش /q/ فصيح.",
        ].join("\n"),
      `Mark these lyrics for sung ${dialectSpeak} — like Coach: help the singer hit the dialect, NOT school grammar.`,
      "Keep SAME words, lines, and section tags. Output lyrics only.",
      isMsa
        ? "MSA: clear marks OK, but do not vowelize every single letter — no tanween unless user explicitly asked for nahwi."
        : isLebanese
        ? buildLebaneseDiacriticsLinesEn().join("\n")
        : isLevantineColloquial
        ? buildLevantineDiacriticsLinesEn().join("\n")
        : [
          "Mark vowels on words the singer might misread; add sukoon on stopped consonants.",
          "NO tanween (ًٌٍ), NO nahwi case endings, NO full textbook tashkeel.",
          "Qaf ق = hamza in this dialect, not classical /q/.",
        ].join("\n"),
      "Honor Arabic address/gender hints in the dialect hint if present.",
      `Variation token: ${nonce}`,
      ...(colloquialArabicLines.length && mode !== "diacritics" ? colloquialArabicLines : []),
      ...(dialectLines ? [dialectLines] : []),
      style ? `Style/Tags (context only): ${style}` : "",
      "",
      "Lyrics to mark:",
      seed,
    ].filter(Boolean).join("\n");
  }
  if (mode === "enhance") {
    return [
      "Polish existing lyrics for AI song generation — do NOT rewrite from scratch.",
      "Keep the same language, dialect, story, and emotional meaning.",
      "Preserve colloquial/dialect words — do NOT upgrade to formal MSA or change the accent flavor.",
      "Keep the same section tags and overall structure; only lightly adjust wording, line breaks, or endings for flow.",
      ...POP_RHYME_METER_LINES_LIGHT,
      ...(useArabizi ? scriptLines : ["Do NOT add heavy vowel marks (tashkeel) — that is a separate step."]),
      "Output lyrics only with section tags. No explanations or metadata.",
      `Variation token: ${nonce}`,
      ...(colloquialArabicLines.length && mode !== "diacritics" ? colloquialArabicLines : []),
      ...(dialectLines ? [dialectLines] : []),
      style ? `Style/Tags (context only): ${style}` : "",
      "",
      "Lyrics to polish:",
      seed,
    ].filter(Boolean).join("\n");
  }
  if (mode === "fix_singing") {
    return [
      ...FIX_SINGING_LINES,
      ...(useArabizi ? scriptLines : []),
      `Variation token: ${nonce}`,
      ...(colloquialArabicLines.length && mode !== "diacritics" ? colloquialArabicLines : []),
      ...(dialectLines ? [dialectLines] : []),
      style ? `Style/Tags (context only): ${style}` : "",
      "",
      "Lyrics to fix for singing:",
      seed,
    ].filter(Boolean).join("\n");
  }
  if (mode === "singability_check") {
    return [
      "You are a lyrics coach for AI music singing (Suno/Lyria). Analyze singability only — do NOT rewrite lyrics.",
      "Focus on: line length balance (wazen/وزن), end-rhyme (qafiya/قافية), chorus hook fit, lines that are too long or uneven.",
      ...(useArabizi
        ? [
          "Lyrics are in Arabizi (Latin phonetic spelling). Analyze rhyme by spoken ending sounds (-ak, -na, -eh, etc.).",
          "2/3/7 in words encode Arabic sounds — judge rhyme as pronounced, not as English.",
        ]
        : []),
      "Rhyme schemes:",
      "- Verse and chorus can use any scheme (AABB, ABAB, ABBA, ABCB, AAAA, AAAB, AABA, AA, repeating hooks). Do NOT prefer one scheme for chorus vs verse.",
      "- Flag issues only when a section's lines do not match its apparent scheme, or when rhyme/meter is uneven — not because a scheme is 'wrong' for that section.",
      "- AABA: lines 1, 2, and 4 rhyme; line 3 is the B turn — do NOT flag line 3 for breaking rhyme.",
      "- AAAB: lines 1, 2, and 3 rhyme; line 4 is the B turn — do NOT flag line 4 for breaking rhyme.",
      "- Near-rhyme counts (e.g. Lebanese -na endings: لخّصنا / خلّصنا / فنّصنا). Do not nitpick 1-syllable length shifts (7 vs 8) unless they clearly break singing.",
      "- If lyrics lack [Verse]/[Chorus] section tags, mention it once as a low-priority tip — not a high-severity rhyme failure.",
      "- Arabic / Levantine: note parallel couplets (موازي) — paired lines with matching structure and similar مقاطع.",
      "- Near-rhyme / assonance OK in colloquial Arabic.",
      "For Arabic lyrics, comment on colloquial singability — uneven مقاطع make the AI singer stumble.",
      "Return ONLY valid JSON (no markdown) with this shape:",
      '{"score":0-100,"ready":true|false,"summary":"one sentence","warnings":[{"level":"high|medium|low","section":"Chorus","line":2,"message":"..."}]}',
      "- score: 100 = very singable for AI vocals; below 60 = likely problems.",
      "- ready: true only if safe to generate without edits.",
      "- warnings: 0-8 specific issues; line is 1-based within that section.",
      ...(colloquialArabicLines.length && mode !== "diacritics" ? colloquialArabicLines : []),
      ...(dialectLines ? [dialectLines] : []),
      style ? `Style/Tags (context only): ${style}` : "",
      "",
      "Lyrics to analyze:",
      seed,
    ].filter(Boolean).join("\n");
  }
  if (mode === "remix_reply") {
    const creatorLine = sourceCreator ? `Original voice: @${sourceCreator.replace(/^@+/, "")}` : "";
    const angle = seed
      ? `Remixer's angle (follow this intent):\n${seed}`
      : "Write a natural reply in a new voice — answer, comfort, push back, or continue the story as if responding to the original singer.";
    return [
      "Write NEW lyrics for a song REMIX that replies to an existing song over the same melody.",
      "This is a conversational back-and-forth: the remix is the second voice answering the first.",
      ...REMIX_REPLY_GUARDRAILS,
      "Do NOT copy long phrases from the original. Do NOT rearrange the original lines.",
      "Match the original song's language and emotional world unless the remixer's angle says otherwise.",
      "Output lyrics only with section tags.",
      "If the remixer's angle asks for ONLY specific sections (e.g. just [Verse 2], just [Chorus], Verse 2 + Chorus), output ONLY those sections — not a full song.",
      "Otherwise use this full structure:",
      "[Verse 1]",
      "[Pre-Chorus]",
      "[Chorus]",
      "[Verse 2]",
      "[Chorus]",
      "[Bridge]",
      "[Final Chorus]",
      "[Outro]",
      "Verse 1 may acknowledge what the original said; chorus should feel like the direct answer or counter-voice.",
      ...POP_RHYME_METER_LINES,
      `Variation token: ${nonce}`,
      ...(colloquialArabicLines.length && mode !== "diacritics" ? colloquialArabicLines : []),
      ...(dialectLines ? [dialectLines] : []),
      style ? `Style/Tags: ${style}` : "Style/Tags: none",
      sourceTitle ? `Original song title: ${sourceTitle}` : "",
      creatorLine,
      "",
      "Original song lyrics to respond to:",
      sourceLyrics || "(none)",
      "",
      angle,
    ].join("\n");
  }
  if (mode === "arrange") {
    return [
      "You are arranging user-provided lyrics for AI singing.",
      "Do NOT change theme or language. Do NOT invent a new story.",
      "Keep original lines as much as possible; only reorganize and lightly polish for flow.",
      "Output lyrics only with section tags.",
      ...(useArabizi ? scriptLines : []),
      "Use structure:",
      "[Verse 1]",
      "[Chorus]",
      "[Verse 2]",
      "[Chorus]",
      "[Bridge]",
      "[Final Chorus]",
      "[Outro]",
      "In [Outro], include a clear musical ending phrase.",
      ...POP_RHYME_METER_LINES_LIGHT,
      `Variation token: ${nonce}`,
      ...(colloquialArabicLines.length && mode !== "diacritics" ? colloquialArabicLines : []),
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
      ...(useArabizi ? scriptLines : []),
      ...POP_RHYME_METER_LINES_CONTINUE,
      ...(colloquialArabicLines.length && mode !== "diacritics" ? colloquialArabicLines : []),
      ...(dialectLines ? [dialectLines] : []),
      style ? `Style/Tags: ${style}` : "Style/Tags: none",
      "",
      `Variation token: ${nonce}`,
      "Existing lyrics:",
      seed || "(none)",
    ].join("\n");
  }
  if (mode === "challenge_clip") {
    return [
      "You are writing lyrics for a ~28 SECOND music clip (Lyria) — NOT a full song.",
      "The clip MUST end on a complete phrase. Nothing cut mid-word or mid-sentence.",
      "Output lyrics only with at most 2 sections:",
      "[Verse] — 2 lines max (optional; skip if the brief is chorus-only)",
      "[Chorus] — 2 to 4 lines max, one repeatable hook",
      "Total: 8 lines maximum. Short syllables. Conversational, not shouty.",
      ...(useArabizi ? scriptLines : []),
      "Do NOT include [Intro], [Verse 2], [Bridge], [Outro], or [Final Chorus].",
      "The last line must feel like a natural ending (held word or clean stop).",
      ...POP_RHYME_METER_LINES,
      "Do not explain the challenge. Do not repeat the instruction text.",
      "Avoid generic filler every user would get — make hooks specific to the brief's photo, mood, and creative angle.",
      `Variation token: ${nonce}`,
      ...(colloquialArabicLines.length && mode !== "diacritics" ? colloquialArabicLines : []),
      ...(dialectLines ? [dialectLines] : []),
      style ? `Style/Tags: ${style}` : "Style/Tags: none",
      "",
      "Challenge brief to turn into clip lyrics:",
      seed || "(none)",
    ].join("\n");
  }
  if (mode === "challenge") {
    return [
      "You are writing a SHORT lyric draft for a music challenge — NOT a full commercial song.",
      "Do NOT write a complete song. Do NOT include [Intro], [Verse 2], [Bridge], [Final Chorus], or [Outro].",
      "Output lyrics only with at most 3 sections:",
      "[Verse 1] — 4 lines max",
      "[Pre-Chorus] — 2 lines max (optional; omit if not needed)",
      "[Chorus] — 4 lines max, with one repeatable hook",
      "Total output: 12 lines maximum. Keep lines short and singable.",
      ...(useArabizi ? scriptLines : []),
      ...POP_RHYME_METER_LINES,
      "Do not explain the challenge. Do not repeat the instruction text.",
      "Do not include metadata, notes, or descriptions.",
      `Variation token: ${nonce}`,
      ...(colloquialArabicLines.length && mode !== "diacritics" ? colloquialArabicLines : []),
      ...(dialectLines ? [dialectLines] : []),
      style ? `Style/Tags: ${style}` : "Style/Tags: none",
      "",
      "Challenge brief to turn into lyrics:",
      seed || "(none)",
    ].join("\n");
  }
  return [
    "Write complete singable lyrics for AI song generation.",
    "Output lyrics only.",
    ...(useArabizi ? scriptLines : []),
    "Use this structure exactly:",
    "[Intro]",
    "[Verse 1]",
    "[Pre-Chorus]",
    "[Chorus]",
    "[Verse 2]",
    "[Chorus]",
    "[Bridge]",
    "[Final Chorus]",
    "[Outro]",
    "Make the [Outro] contain a clear ending phrase so the song can finish naturally.",
    ...POP_RHYME_METER_LINES,
    `Variation token: ${nonce}`,
    ...(colloquialArabicLines.length && mode !== "diacritics" ? colloquialArabicLines : []),
    ...(dialectLines ? [dialectLines] : []),
    style ? `Style/Tags: ${style}` : "Style/Tags: none",
    seed ? `Use this seed idea:\n${seed}` : "No seed provided; create a coherent theme.",
  ].join("\n");
}

function buildSunoPrompt({ seed, style, mode, dialect, dialectHint }) {
  const s = String(seed || "").trim();
  const d = String(dialect || "").trim();
  const hint = String(dialectHint || "").trim();
  const st = String(style || "").trim();
  const dialectLower = `${d} ${hint}`.toLowerCase();
  const isLebanese = /lebanese|levantine|لبنان|بيروت/.test(dialectLower);
  const isEgyptian = /egyptian|masri|مصر|cairo/.test(dialectLower);
  const isArabicDialect =
    isLebanese
    || isEgyptian
    || /arabic|iraqi|gulf|maghrebi|syrian|palestinian|tunisian|sudanese|darija|msa|فصحى|محك/.test(
      dialectLower,
    );

  const pack = (prefix, body) => {
    const head = String(prefix || "").replace(/\s+/g, " ").trim();
    const room = Math.max(24, 200 - head.length - 1);
    const tail = String(body || "").trim().slice(0, room);
    return `${head} ${tail}`.replace(/\s+/g, " ").trim().slice(0, 200);
  };

  if (isArabicDialect && mode !== "diacritics") {
    const hintShort = hint ? `${hint.split(";")[0].trim()}. ` : "";
    const styleShort = st ? `${st.split(",")[0].trim()}. ` : "";
    if (mode === "challenge_clip") {
      return pack(
        "Short clip lyrics ~28s, verse+chorus max 8 lines, complete ending.",
        `${d ? `${d}. ` : ""}${hintShort}${styleShort}${s}`,
      );
    }
    if (mode === "challenge") {
      return pack(
        "Short Arabic challenge lyrics, max 12 lines, verse+chorus tags.",
        `${d ? `${d}. ` : ""}${hintShort}${styleShort}${s}`,
      );
    }
    if (mode === "continue") {
      return pack(
        `${d || "Arabic colloquial"} — continue these lyrics, same dialect.`,
        `${hintShort}${s}`,
      );
    }
    if (mode === "arrange") {
      return pack(
        `${d || "Arabic colloquial"} — arrange into verse/chorus tags.`,
        `${hintShort}${s}`,
      );
    }
    const lead = isLebanese
      ? "Lebanese Arabic colloquial pop lyrics, Beirut dialect, qaf as hamza, tight sukoon word endings, NO tanween, NOT Egyptian, NOT formal MSA."
      : isEgyptian
      ? "Egyptian Masri colloquial pop lyrics, Cairo dialect, ب- present prefix on verbs, authentic Masri vocabulary, NO tanween, NOT Levantine, NOT formal MSA."
      : d
      ? `${d} colloquial sung lyrics.`
      : "Arabic colloquial sung lyrics.";
    return pack(`${lead} ${hintShort}${styleShort}`, s);
  }

  const intent = mode === "arrange"
    ? "Arrange user lyrics into a singable song with section tags."
    : mode === "continue"
      ? "Continue these lyrics in the same mood and language."
      : mode === "challenge_clip"
        ? "Write ~28s clip lyrics: Verse (optional) + Chorus only, max 8 lines, complete ending."
        : mode === "challenge"
        ? "Write a short challenge lyric draft only: Verse 1, optional Pre-Chorus, Chorus. Max 12 lines. Not a full song."
        : "Write complete singable song lyrics with verse and chorus tags.";
  const parts = [
    intent,
    d ? `Dialect: ${d}.` : "",
    hint ? `Flavor: ${hint}.` : "",
    st ? `Style: ${st}.` : "",
    s ? `Idea: ${s}` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return parts.length > 200 ? parts.slice(0, 197).trimEnd() + "..." : parts;
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((p) => (typeof p?.text === "string" ? p.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractSunoLyricsFromRecord(data) {
  const rows = data?.data?.response?.data;
  const variants = [];
  const pushRows = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      const text = String(item?.text || item?.lyrics || "").trim();
      if (!text) continue;
      const status = String(item?.status || "").trim().toLowerCase();
      variants.push({
        text,
        title: String(item?.title || "").trim(),
        complete: !status || status === "complete",
      });
    }
  };
  pushRows(rows);
  if (!variants.length) pushRows(data?.data?.data);
  if (!variants.length) pushRows(data?.response?.data);
  if (!variants.length) {
    const direct = extractLyricsFromAny(data) || extractTextLoose(data);
    if (direct) variants.push({ text: String(direct).trim(), title: "", complete: true });
  }
  const pick = variants.find((v) => v.complete) || variants[0];
  if (!pick) return null;
  const lyrics = sanitizeSunoLyricsOutput(pick.text);
  return lyrics ? { lyrics, title: pick.title } : null;
}

/** Suno lyrics: keep verbatim — only drop obvious AI metadata lines, not content Suno wrote. */
function sanitizeSunoLyricsOutput(input) {
  return String(input || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((line) => {
      if (/^style\s*:/i.test(line)) return false;
      if (/^(description|note|explanation|theme|meaning)\s*:/i.test(line)) return false;
      return true;
    })
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
  if (
    requestedMode === "arrange"
    || requestedMode === "continue"
    || requestedMode === "full"
    || requestedMode === "challenge"
    || requestedMode === "remix_reply"
    || requestedMode === "diacritics"
    || requestedMode === "enhance"
  ) {
    return requestedMode;
  }
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

function getHostProto(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const proto = req.headers["x-forwarded-proto"] || "https";
  return { host, proto };
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJson(txt) {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}


function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, x-client-info');
}
