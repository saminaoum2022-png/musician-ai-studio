/**
 * OpenAI ChatGPT lyrics generation (same prompts/post-process as Gemini in /api/lyrics).
 */

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

function defaultModels() {
  const fromEnv = String(process.env.OPENAI_LYRICS_MODEL || "").trim();
  const list = [fromEnv, "gpt-4.1-mini", "gpt-4o-mini", "gpt-4o"].filter(Boolean);
  return [...new Set(list)];
}

async function tryOpenAILyrics({
  openaiKey,
  prompt,
  temperature = 0.9,
  model = null,
} = {}) {
  const key = String(openaiKey || process.env.OPENAI_API_KEY || "").trim();
  if (!key) return { ok: false, error: "missing_openai_key" };

  const models = model ? [String(model).trim()] : defaultModels();
  let lastError = "unknown";

  for (const m of models) {
    if (!m) continue;
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: m,
          temperature: Number(temperature) || 0.9,
          messages: [
            {
              role: "system",
              content:
                "You write song lyrics only. Follow the user instructions exactly. No preamble or explanation.",
            },
            { role: "user", content: String(prompt || "") },
          ],
        }),
      });
      const text = await r.text().catch(() => "");
      const data = safeJson(text) || {};
      if (!r.ok) {
        lastError = data?.error?.message || data?.error?.code || text || `HTTP ${r.status}`;
        continue;
      }
      const out = extractChatCompletionText(data);
      if (!out) {
        lastError = "empty response";
        continue;
      }
      return { ok: true, lyrics: out, model: m };
    } catch (e) {
      lastError = String(e?.message || e || "openai_failed").slice(0, 280);
    }
  }
  return { ok: false, error: String(lastError).slice(0, 280) };
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
};
