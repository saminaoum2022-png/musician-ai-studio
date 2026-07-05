/**
 * Visual Director orchestrator — heuristics first, optional Gemini upgrade.
 */
import { buildCoverDirectorContext } from "./context.mjs";
import { enrichDirectorContext } from "./path-adapters.mjs";
import { resolveHeuristicVisualDirection } from "./heuristics.mjs";
import { applyVisualDirection } from "./apply.mjs";
import { validateVisualDirection } from "./schema.mjs";

/**
 * @param {object} coverInput
 * @param {{ applyToPrompt?: boolean, tryGemini?: boolean, geminiResolve?: Function, hints?: object }} [opts]
 */
export async function resolveVisualDirection(coverInput, opts = {}) {
  const ctx = enrichDirectorContext(buildCoverDirectorContext(coverInput, opts.hints || {}));
  let direction = resolveHeuristicVisualDirection(ctx);

  if (opts.tryGemini && typeof opts.geminiResolve === "function") {
    try {
      const upgraded = await opts.geminiResolve(ctx, direction);
      const validated = validateVisualDirection(upgraded);
      if (validated && (validated.confidence || 0) >= (direction?.confidence || 0)) {
        direction = validated;
      }
    } catch {
      /* heuristic fallback */
    }
  }

  const applied = applyVisualDirection(coverInput, direction, {
    applyToPrompt: Boolean(opts.applyToPrompt),
    bucketKey: ctx.bucketKey,
  });

  return {
    direction,
    context: ctx,
    ...applied,
  };
}

export {
  buildCoverDirectorContext,
  enrichDirectorContext,
  resolveHeuristicVisualDirection,
  applyVisualDirection,
};
