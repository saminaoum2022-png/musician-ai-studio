/**
 * OpenAI ChatGPT lyrics generation (same prompts/post-process as Gemini in /api/lyrics).
 *
 * Model chain (Vercel Preview env) — no GPT-4.x defaults:
 *   OPENAI_LYRICS_MODEL=gpt-6-luna            — primary (default, cheap test tier)
 *   OPENAI_LYRICS_FALLBACK_MODEL=gpt-6.1-sol  — if Luna errors
 * Or override the full chain:
 *   OPENAI_LYRICS_MODELS=gpt-6-luna,gpt-6.1-sol,gpt-6-astra
 */

const LYRICS_SYSTEM =
  "Expert songwriter. Output lyrics with section tags only — no preamble or production notes in the lyrics body.";

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractChatCompletionText(data) {
  const choice = Array.isArray(data?.choices) ? data.choices[0] : null;
  const content = choice?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p?.text === "string" ? p.text : ""))
      .join("")
      .trim();
  }
  return "";
}

function extractResponsesText(data) {
  if (typeof data?.output_text === "string") return data.output_text.trim();
  const parts = [];
  for (const o of data?.output || []) {
    for (const c of o?.content || []) {
      if (c?.type === "output_text" && typeof c?.text === "string") parts.push(c.text);
      if (c?.type === "text" && typeof c?.text === "string") parts.push(c.text);
    }
  }
  return parts.join("\n").trim();
}

function openAiModelSkipsTemperature(model) {
  const m = String(model || "").trim().toLowerCase();
  return /^gpt-6/i.test(m) || /^o[134]/i.test(m);
}

function generationTemperature(model, temperature) {
  if (openAiModelSkipsTemperature(model)) return null;
  const t = Number(temperature);
  if (!Number.isFinite(t)) return 0.9;
  return t;
}

function parseLyricsModelChain() {
  const rawList = String(process.env.OPENAI_LYRICS_MODELS || "").trim();
  if (rawList) {
    return [...new Set(rawList.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean))];
  }
  const primary =
    String(process.env.OPENAI_LYRICS_MODEL || "").trim()
    || "gpt-6-luna";
  const fallback =
    String(process.env.OPENAI_LYRICS_FALLBACK_MODEL || "").trim()
    || "gpt-6.1-sol";
  return [...new Set([primary, fallback].filter(Boolean))];
}

async function callOpenAIResponses({ key, model, prompt, temperature }) {
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: LYRICS_SYSTEM },
        { role: "user", content: String(prompt || "") },
      ],
      ...(generationTemperature(model, temperature) != null
        ? { temperature: generationTemperature(model, temperature) }
        : {}),
    }),
  });
  const text = await r.text().catch(() => "");
  const data = safeJson(text) || {};
  if (!r.ok) {
    return {
      ok: false,
      error: data?.error?.message || data?.error?.code || text || `HTTP ${r.status}`,
      api: "responses",
    };
  }
  const out = extractResponsesText(data);
  if (!out) return { ok: false, error: "empty response", api: "responses" };
  return { ok: true, lyrics: out, model, api: "responses" };
}

async function callOpenAIChatCompletions({ key, model, prompt, temperature }) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      ...(generationTemperature(model, temperature) != null
        ? { temperature: generationTemperature(model, temperature) }
        : {}),
      messages: [
        { role: "system", content: LYRICS_SYSTEM },
        { role: "user", content: String(prompt || "") },
      ],
    }),
  });
  const text = await r.text().catch(() => "");
  const data = safeJson(text) || {};
  if (!r.ok) {
    return {
      ok: false,
      error: data?.error?.message || data?.error?.code || text || `HTTP ${r.status}`,
      api: "chat",
    };
  }
  const out = extractChatCompletionText(data);
  if (!out) return { ok: false, error: "empty response", api: "chat" };
  return { ok: true, lyrics: out, model, api: "chat" };
}

async function callOpenAIModel({ key, model, prompt, temperature }) {
  // Chat Completions is what shows in platform Logs → Completions for most keys.
  const preferChat = !/^(0|false|no)$/i.test(String(process.env.OPENAI_LYRICS_PREFER_CHAT || "1").trim());

  if (!preferChat) {
    const res = await callOpenAIResponses({ key, model, prompt, temperature });
    if (res.ok) return res;
    const chat = await callOpenAIChatCompletions({ key, model, prompt, temperature });
    if (chat.ok) return { ...chat, fallbackApi: res.error ? `responses:${String(res.error).slice(0, 80)}` : "" };
    return chat;
  }

  const chat = await callOpenAIChatCompletions({ key, model, prompt, temperature });
  if (chat.ok) return chat;
  const res = await callOpenAIResponses({ key, model, prompt, temperature });
  if (res.ok) return { ...res, fallbackApi: `chat:${String(chat.error).slice(0, 80)}` };
  return chat;
}

async function listOpenAIModelIds(key) {
  try {
    const r = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const data = safeJson(await r.text().catch(() => "")) || {};
    if (!r.ok) return [];
    return (Array.isArray(data?.data) ? data.data : [])
      .map((row) => String(row?.id || "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function discoverLyricsModelCandidates(ids) {
  const want = [/luna/i, /6\.1[-_]?sol/i, /6-1-sol/i, /astra/i, /gpt-6/i];
  const hits = [];
  for (const id of ids) {
    if (want.some((re) => re.test(id))) hits.push(id);
  }
  return [...new Set(hits)];
}

async function tryOpenAILyrics({
  openaiKey,
  prompt,
  temperature = 0.9,
  model = null,
} = {}) {
  const key = String(openaiKey || process.env.OPENAI_API_KEY || "").trim();
  if (!key) return { ok: false, error: "missing_openai_key", attempts: [] };

  let models = model ? [String(model).trim()] : parseLyricsModelChain();
  const attempts = [];
  let lastError = "unknown";

  async function tryModels(modelList) {
    for (const m of modelList) {
      if (!m) continue;
      try {
        const result = await callOpenAIModel({ key, model: m, prompt, temperature });
        if (result?.ok) {
          return {
            ok: true,
            lyrics: result.lyrics,
            model: result.model,
            openaiApi: result.api,
            attempts,
            ...(result.fallbackApi ? { openaiApiNote: result.fallbackApi } : {}),
          };
        }
        const err = `${result?.error || "failed"} (${result?.api || "?"})`;
        attempts.push({ model: m, error: err.slice(0, 220) });
        lastError = `${m}: ${err}`;
      } catch (e) {
        const err = String(e?.message || e || "openai_failed").slice(0, 200);
        attempts.push({ model: m, error: err });
        lastError = `${m}: ${err}`;
      }
    }
    return null;
  }

  let hit = await tryModels(models);
  if (hit) return hit;

  if (/^(1|true|yes)$/i.test(String(process.env.OPENAI_LYRICS_AUTO_DISCOVER || "1").trim())) {
    const ids = await listOpenAIModelIds(key);
    const discovered = discoverLyricsModelCandidates(ids).filter((id) => !models.includes(id));
    if (discovered.length) {
      models = [...models, ...discovered];
      hit = await tryModels(discovered);
      if (hit) return hit;
    }
    if (ids.length && attempts.length) {
      lastError = `${lastError}; discover: tried ${models.join(", ")}; account has ${ids.length} models`;
    }
  }

  return { ok: false, error: String(lastError).slice(0, 400), attempts };
}

function openAiLyricsAllowedForRequest(lyricsProvider) {
  const p = String(lyricsProvider || "").trim().toLowerCase();
  if (p !== "openai" && p !== "chatgpt") return false;
  if (!(process.env.OPENAI_API_KEY || "").trim()) return false;
  if (String(process.env.OPENAI_LYRICS_ENABLED || "").trim() === "1") return true;
  if (String(process.env.VERCEL_ENV || "").trim().toLowerCase() === "preview") return true;
  return false;
}

module.exports = {
  tryOpenAILyrics,
  openAiLyricsAllowedForRequest,
  parseLyricsModelChain,
};
