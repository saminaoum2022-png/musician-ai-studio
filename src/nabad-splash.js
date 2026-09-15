/* NabadAI splash mark. Standalone, no dependencies. */
export function createNabadSplash(container, { wordmarkSrc = './nabad-wordmark.png' } = {}) {
  const root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:14px;color:#f7f7fa';
  root.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 96" width="90" height="96" role="img" aria-label="NabadAI">
    <rect data-teal x="67" y="73" width="23" height="23" rx="11.5" fill="#22c5a9"/>
    <rect data-purple x="0" y="73" width="23" height="23" rx="11.5" fill="#7752f8"/>
    <path data-join d="M11.5 11.5 L78.5 84.5" stroke="#7752f8" stroke-width="23" stroke-linecap="round" fill="none" opacity="0"/>
  </svg><img data-name alt="NabadAi" width="120" height="40" style="display:block;width:120px;height:40px;object-fit:contain;opacity:0"/>`;
  container.append(root);
  const teal = root.querySelector('[data-teal]');
  const purple = root.querySelector('[data-purple]');
  const join = root.querySelector('[data-join]');
  const name = root.querySelector('[data-name]');
  name.src = wordmarkSrc;
  const clamp = x => Math.max(0, Math.min(1, x));
  const ease = x => 1 - Math.pow(1 - clamp(x), 3);
  let frame = 0;
  let settle = null;
  let disposed = false;
  function draw(ms) {
    // Real round dots elongate upwards. Their baseline remains y=96.
    const left = ease((ms - 100) / 260);
    const right = ease((ms - 400) / 260);
    for (const [bar, progress] of [[purple, left], [teal, right]]) {
      const height = 23 + 73 * progress;
      bar.setAttribute('height', String(height));
      bar.setAttribute('y', String(96 - height));
    }
    // Both bars finish before the connecting diagonal appears.
    const p = ease((ms - 660) / 300);
    join.setAttribute('opacity', ms <= 660 ? '0' : '1');
    join.setAttribute('d', `M11.5 11.5 L${11.5 + 67 * p} ${11.5 + 73 * p}`);
    const a = clamp((ms - 880) / 220);
    name.style.opacity = String(a);
    name.style.transform = `translateY(${(1 - a) * 3}px)`;
  }
  function stop() {
    cancelAnimationFrame(frame);
    if (settle) { settle({ cancelled: true }); settle = null; }
  }
  function play() {
    stop();
    if (disposed) return Promise.resolve({ cancelled: true });
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      draw(1100);
      return Promise.resolve({ cancelled: false });
    }
    draw(0);
    return new Promise(resolve => {
      settle = resolve;
      let start;
      function tick(now) {
        if (start === undefined) start = now;
        const elapsed = now - start;
        draw(Math.min(elapsed, 1100));
        if (elapsed < 1100) frame = requestAnimationFrame(tick);
        else { settle = null; resolve({ cancelled: false }); }
      }
      frame = requestAnimationFrame(tick);
    });
  }
  draw(0);
  return {
    element: root,
    play,
    showFinal() { stop(); draw(1100); },
    destroy() { disposed = true; stop(); root.remove(); }
  };
}
