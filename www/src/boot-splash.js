/**
 * Native vector boot splash — two dots draw the production N logo (purple + teal).
 * Paths are extracted from assets/icons/app-icon-master.png (see build-splash-paths.mjs).
 */
(function bootSplashModule(global) {
  const BLACK = "#000000";
  const PURPLE = "#7C5CFF";
  const TEAL = "#23D5AB";

  /** Embedded from assets/splash/logo-paths.json — avoids a fetch on cold boot. */
  const LOGO = {
    viewBox: [0, 0, 1000, 1000],
    strokeWidth: 327.2,
    purplePath:
      "M 123.5 994.9 L 133.4 667.7 L 143.3 340.4 L 153.5 3.3 L 259 109.9 L 364.6 216.4 L 473.3 326.2 L 609.1 545.2 L 744.8 764.2 L 884.7 989.8",
    tealPath: "M 856.7 3.4 L 730.2 109.9 L 603.7 216.4 L 473.3 326.2",
  };

  const TIMING = {
    dotIn: 180,
    pulse: 620,
    split: 220,
    draw: 1550,
    dotOut: 180,
    hold: 750,
  };

  const TOTAL_MS =
    TIMING.dotIn + TIMING.pulse + TIMING.split + TIMING.draw + TIMING.dotOut + TIMING.hold;

  function easeOutCubic(t) {
    return 1 - (1 - t) ** 3;
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function createSvg(root) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", LOGO.viewBox.join(" "));
    svg.setAttribute("class", "bootSplashSvg");
    svg.setAttribute("aria-hidden", "true");

    const purple = document.createElementNS(ns, "path");
    purple.setAttribute("id", "bootSplashPurple");
    purple.setAttribute("d", LOGO.purplePath);
    purple.setAttribute("fill", "none");
    purple.setAttribute("stroke", PURPLE);
    purple.setAttribute("stroke-width", String(LOGO.strokeWidth));
    purple.setAttribute("stroke-linecap", "round");
    purple.setAttribute("stroke-linejoin", "round");

    const teal = document.createElementNS(ns, "path");
    teal.setAttribute("id", "bootSplashTeal");
    teal.setAttribute("d", LOGO.tealPath);
    teal.setAttribute("fill", "none");
    teal.setAttribute("stroke", TEAL);
    teal.setAttribute("stroke-width", String(LOGO.strokeWidth));
    teal.setAttribute("stroke-linecap", "round");
    teal.setAttribute("stroke-linejoin", "round");

    const centerDot = document.createElementNS(ns, "circle");
    centerDot.setAttribute("class", "bootSplashDot bootSplashDot--center");
    centerDot.setAttribute("r", String(LOGO.strokeWidth * 0.18));
    centerDot.setAttribute("fill", "#eef0f4");

    const purpleDot = document.createElementNS(ns, "circle");
    purpleDot.setAttribute("class", "bootSplashDot bootSplashDot--purple");
    purpleDot.setAttribute("r", String(LOGO.strokeWidth * 0.18));
    purpleDot.setAttribute("fill", PURPLE);
    purpleDot.setAttribute("opacity", "0");

    const tealDot = document.createElementNS(ns, "circle");
    tealDot.setAttribute("class", "bootSplashDot bootSplashDot--teal");
    tealDot.setAttribute("r", String(LOGO.strokeWidth * 0.18));
    tealDot.setAttribute("fill", TEAL);
    tealDot.setAttribute("opacity", "0");

    svg.append(purple, teal, centerDot, purpleDot, tealDot);
    root.appendChild(svg);

    return { svg, purple, teal, centerDot, purpleDot, tealDot };
  }

  function prepStroke(pathEl) {
    const len = pathEl.getTotalLength();
    pathEl.style.strokeDasharray = String(len);
    pathEl.style.strokeDashoffset = String(len);
    return len;
  }

  function setDot(dot, x, y, opacity, scale) {
    dot.setAttribute("cx", String(x));
    dot.setAttribute("cy", String(y));
    dot.setAttribute("opacity", String(opacity));
    if (scale != null) {
      dot.setAttribute("transform", `translate(${x} ${y}) scale(${scale}) translate(${-x} ${-y})`);
    } else {
      dot.removeAttribute("transform");
    }
  }

  function initBootSplashAnimation(onComplete) {
    const mount = document.getElementById("bootSplashAnim");
    if (!mount) {
      onComplete?.();
      return { cancel: () => {} };
    }

    const reducedMotion = global.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reducedMotion) {
      const els = createSvg(mount);
      els.purple.style.strokeDashoffset = "0";
      els.teal.style.strokeDashoffset = "0";
      setDot(els.centerDot, 0, 0, 0);
      setDot(els.purpleDot, 0, 0, 0);
      setDot(els.tealDot, 0, 0, 0);
      global.setTimeout(onComplete, 400);
      return { cancel: () => {}, durationMs: 400 };
    }

    const els = createSvg(mount);
    const purpleLen = prepStroke(els.purple);
    const tealLen = prepStroke(els.teal);

    const center = { x: 500, y: 500 };
    let raf = 0;
    let startedAt = 0;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      if (raf) cancelAnimationFrame(raf);
      onComplete?.();
    };

    const frame = (now) => {
      if (!startedAt) startedAt = now;
      const t = now - startedAt;

      const t0 = 0;
      const t1 = t0 + TIMING.dotIn;
      const t2 = t1 + TIMING.pulse;
      const t3 = t2 + TIMING.split;
      const t4 = t3 + TIMING.draw;
      const t5 = t4 + TIMING.dotOut;
      const t6 = t5 + TIMING.hold;

      if (t >= t6) {
        els.purple.style.strokeDashoffset = "0";
        els.teal.style.strokeDashoffset = "0";
        setDot(els.centerDot, center.x, center.y, 0);
        setDot(els.purpleDot, els.purple.getPointAtLength(purpleLen).x, els.purple.getPointAtLength(purpleLen).y, 0);
        setDot(els.tealDot, els.teal.getPointAtLength(tealLen).x, els.teal.getPointAtLength(tealLen).y, 0);
        finish();
        return;
      }

      // Phase 1 — center dot in
      if (t < t1) {
        const p = easeOutCubic(clamp(t / TIMING.dotIn, 0, 1));
        setDot(els.centerDot, center.x, center.y, p, 1);
        els.purple.style.strokeDashoffset = String(purpleLen);
        els.teal.style.strokeDashoffset = String(tealLen);
        setDot(els.purpleDot, center.x, center.y, 0);
        setDot(els.tealDot, center.x, center.y, 0);
      } else if (t < t2) {
        // Phase 2 — two subtle pulses
        const local = t - t1;
        const pulseT = (local % (TIMING.pulse / 2)) / (TIMING.pulse / 2);
        const pulseIdx = Math.floor(local / (TIMING.pulse / 2));
        const amp = pulseIdx === 0 ? 0.06 : 0.04;
        const scale = 1 + amp * Math.sin(pulseT * Math.PI);
        setDot(els.centerDot, center.x, center.y, 1, scale);
      } else if (t < t3) {
        // Phase 3 — split into purple + teal dots
        const p = easeInOutCubic(clamp((t - t2) / TIMING.split, 0, 1));
        const pStart = els.purple.getPointAtLength(0);
        const tStart = els.teal.getPointAtLength(0);
        setDot(els.centerDot, center.x, center.y, 1 - p);
        setDot(
          els.purpleDot,
          center.x + (pStart.x - center.x) * p,
          center.y + (pStart.y - center.y) * p,
          p,
        );
        setDot(
          els.tealDot,
          center.x + (tStart.x - center.x) * p,
          center.y + (tStart.y - center.y) * p,
          p,
        );
      } else if (t < t4) {
        // Phase 4 — simultaneous stroke draw
        const p = easeOutCubic(clamp((t - t3) / TIMING.draw, 0, 1));
        els.purple.style.strokeDashoffset = String(purpleLen * (1 - p));
        els.teal.style.strokeDashoffset = String(tealLen * (1 - p));
        const pp = els.purple.getPointAtLength(purpleLen * p);
        const tp = els.teal.getPointAtLength(tealLen * p);
        setDot(els.purpleDot, pp.x, pp.y, 1);
        setDot(els.tealDot, tp.x, tp.y, 1);
        setDot(els.centerDot, center.x, center.y, 0);
      } else if (t < t5) {
        // Phase 5 — dots fade into stroke endings
        const p = easeOutCubic(clamp((t - t4) / TIMING.dotOut, 0, 1));
        els.purple.style.strokeDashoffset = "0";
        els.teal.style.strokeDashoffset = "0";
        const pEnd = els.purple.getPointAtLength(purpleLen);
        const tEnd = els.teal.getPointAtLength(tealLen);
        setDot(els.purpleDot, pEnd.x, pEnd.y, 1 - p);
        setDot(els.tealDot, tEnd.x, tEnd.y, 1 - p);
      } else {
        // Phase 6 — hold final logo
        els.purple.style.strokeDashoffset = "0";
        els.teal.style.strokeDashoffset = "0";
        setDot(els.purpleDot, 0, 0, 0);
        setDot(els.tealDot, 0, 0, 0);
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);

    return {
      cancel: () => {
        if (raf) cancelAnimationFrame(raf);
        done = true;
      },
      durationMs: TOTAL_MS,
    };
  }

  global.initBootSplashAnimation = initBootSplashAnimation;
  global.BOOT_SPLASH_ANIM_MS = TOTAL_MS;
})(typeof window !== "undefined" ? window : globalThis);
