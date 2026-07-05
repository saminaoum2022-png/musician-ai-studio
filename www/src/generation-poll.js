/**
 * Adaptive Suno status polling while the user waits in-app.
 * Immediate first check, fast interval early, then backoff.
 */

export const GEN_POLL_FAST_MS = 2000;
export const GEN_POLL_SLOW_MS = 4500;
export const GEN_POLL_FAST_WINDOW_MS = 90000;

export function generationPollDelayMs(startedAtMs, opts = {}) {
  const fastMs = opts.fastMs ?? GEN_POLL_FAST_MS;
  const slowMs = opts.slowMs ?? GEN_POLL_SLOW_MS;
  const windowMs = opts.fastWindowMs ?? GEN_POLL_FAST_WINDOW_MS;
  const start = Number(startedAtMs) || Date.now();
  return Date.now() - start < windowMs ? fastMs : slowMs;
}

export function stopPollLoop(loop) {
  try {
    loop?.stop?.();
  } catch {}
}

/**
 * @param {{ startedAt?: number, maxTries: number, onTick: (tries: number) => Promise<"stop"|"continue"|void> }} opts
 * @returns {{ stop: () => void, kick: () => void, running: () => boolean }}
 */
export function createAdaptivePollLoop({ startedAt, maxTries, onTick }) {
  let timer = null;
  let tries = 0;
  let stopped = false;
  let inFlight = false;
  let pendingKick = false;
  const startMs = Number(startedAt) || Date.now();

  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const scheduleNext = () => {
    if (stopped || tries >= maxTries) return;
    timer = setTimeout(() => {
      void runTick();
    }, generationPollDelayMs(startMs));
  };

  const runTick = async () => {
    if (stopped) return;
    if (inFlight) {
      pendingKick = true;
      return;
    }
    inFlight = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    tries += 1;
    let action = "continue";
    try {
      action = (await onTick(tries)) || "continue";
    } catch {
      // onTick owns error handling
    } finally {
      inFlight = false;
      if (action === "stop" || stopped || tries >= maxTries) {
        stop();
        return;
      }
      if (pendingKick && !stopped) {
        pendingKick = false;
        void runTick();
        return;
      }
      scheduleNext();
    }
  };

  const kick = () => {
    if (stopped) return;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    void runTick();
  };

  void runTick();

  return { stop, kick, running: () => !stopped };
}
