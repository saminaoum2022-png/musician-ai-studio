"use strict";

/**
 * ElevenLabs Music — passthrough only (no Nabad/Gemini/plan builders).
 * Set ELEVENLABS_LEGACY_PLANS=1 to restore the old automatic plan stack.
 */

function elevenLegacyPlansEnabled() {
  return /^(1|true|yes|on)$/i.test(String(process.env.ELEVENLABS_LEGACY_PLANS || "").trim());
}

function parseClientCompositionPlan(body) {
  let plan = body?.elevenCompositionPlan ?? body?.compositionPlan ?? null;
  if (typeof plan === "string") {
    try {
      plan = JSON.parse(plan);
    } catch {
      plan = null;
    }
  }
  if (plan && typeof plan === "object" && Array.isArray(plan.chunks) && plan.chunks.length) {
    return plan;
  }
  return null;
}

/**
 * @returns {{ ok: true, prompt?: string, compositionPlan?: object, planSource: string } | { ok: false, error: string }}
 */
function resolveBareElevenCompose(body) {
  const clientPlan = parseClientCompositionPlan(body);
  if (clientPlan) {
    return { ok: true, compositionPlan: clientPlan, planSource: "client_composition_plan" };
  }

  const explicit = String(body?.elevenPrompt || "").trim();
  const style = String(body?.style || "").trim();
  const promptField = String(body?.prompt || "").trim();
  const instrumental = Boolean(body?.instrumental);

  let prompt = explicit;
  if (!prompt) {
    if (instrumental) {
      prompt = style || promptField;
    } else {
      prompt = [style, promptField].filter(Boolean).join("\n\n");
    }
  }

  prompt = String(prompt || "").trim();
  if (!prompt) {
    return {
      ok: false,
      error:
        "ElevenLabs bare mode: send style, prompt, elevenPrompt, or elevenCompositionPlan — the server does not add text for you.",
    };
  }

  return {
    ok: true,
    prompt: prompt.slice(0, 8000),
    planSource: explicit ? "client_eleven_prompt" : "client_style_and_prompt",
  };
}

module.exports = {
  elevenLegacyPlansEnabled,
  resolveBareElevenCompose,
  parseClientCompositionPlan,
};
