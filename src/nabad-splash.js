/* NabadAI splash: N draws, then the NabadAi lockup reveals beside it. */
export function createNabadSplash(container, { wordmarkSrc = './nabad-wordmark.png' } = {}) {
  const NS = 'http://www.w3.org/2000/svg';
  const uid = `ns-reveal-${Math.random().toString(36).slice(2, 9)}`;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-160 -64 320 128');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'NabadAi');
  svg.classList.add('nabadSplash');
  svg.style.cssText = 'display:block;width:100%;height:auto;overflow:visible';
  svg.innerHTML = `<title>NabadAi</title>
    <defs><clipPath id="${uid}" clipPathUnits="userSpaceOnUse"><rect data-reveal x="0" y="0" width="0" height="56.5"/></clipPath></defs>
    <g data-mark>
      <rect data-teal x="67" y="73" width="23" height="23" rx="11.5" fill="#22c5a9"/>
      <rect data-purple x="0" y="73" width="23" height="23" rx="11.5" fill="#7752f8"/>
      <path data-join d="M11.5 11.5 L11.5 11.5" stroke="#7752f8" stroke-width="23" stroke-linecap="round" fill="none" opacity="0"/>
    </g>
    <g data-suffix opacity="0">
      <g clip-path="url(#${uid})">
        <svg x="0" y="0" width="177.75" height="56.5" viewBox="620 125 1422 452" overflow="hidden">
          <image data-wordmark x="0" y="0" width="2172" height="724"/>
        </svg>
      </g>
    </g>`;
  const wordmark = svg.querySelector('[data-wordmark]');
  if (wordmark) {
    wordmark.setAttribute('href', wordmarkSrc);
    try {
      wordmark.setAttributeNS('http://www.w3.org/1999/xlink', 'href', wordmarkSrc);
    } catch {}
  }
  container.replaceChildren(svg);
  const purple = svg.querySelector('[data-purple]');
  const teal = svg.querySelector('[data-teal]');
  const join = svg.querySelector('[data-join]');
  const mark = svg.querySelector('[data-mark]');
  const suffix = svg.querySelector('[data-suffix]');
  const reveal = svg.querySelector('[data-reveal]');
  const clamp = (n) => Math.max(0, Math.min(1, n));
  const out = (n) => 1 - Math.pow(1 - clamp(n), 3);
  const smooth = (n) => {
    const x = clamp(n);
    return x * x * (3 - 2 * x);
  };
  const duration = 1820;
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let settle = null;
  let disposed = false;
  function draw(ms) {
    const left = out((ms - 100) / 260);
    const right = out((ms - 400) / 260);
    for (const [bar, p] of [[purple, left], [teal, right]]) {
      const height = 23 + 73 * p;
      bar.setAttribute('height', String(height));
      bar.setAttribute('y', String(96 - height));
    }
    const line = out((ms - 660) / 300);
    join.setAttribute('opacity', ms <= 660 ? '0' : '1');
    join.setAttribute('d', `M11.5 11.5 L${11.5 + 67 * line} ${11.5 + 73 * line}`);
    const move = smooth((ms - 1040) / 680);
    const scale = 1 - 0.4 * move;
    const x = -45 + (-118.625 + 45) * move;
    const y = -48 * scale;
    mark.setAttribute('transform', `translate(${x} ${y}) scale(${scale})`);
    suffix.setAttribute('transform', `translate(${x + 90 * scale + 5.5} -28.8)`);
    const progress = smooth((ms - 1160) / 660);
    reveal.setAttribute('width', String(177.75 * progress));
    suffix.setAttribute('opacity', progress > 0 ? '1' : '0');
  }
  function stop() {
    cancelAnimationFrame(frame);
    if (settle) {
      settle({ cancelled: true });
      settle = null;
    }
  }
  function showFinal() {
    stop();
    draw(duration);
  }
  function play() {
    stop();
    if (disposed) return Promise.resolve({ cancelled: true });
    if (media.matches) {
      draw(duration);
      return Promise.resolve({ cancelled: false });
    }
    draw(0);
    return new Promise((resolve) => {
      settle = resolve;
      let start;
      function tick(now) {
        if (start === undefined) start = now;
        const ms = Math.min(now - start, duration);
        draw(ms);
        if (ms < duration) frame = requestAnimationFrame(tick);
        else {
          settle = null;
          resolve({ cancelled: false });
        }
      }
      frame = requestAnimationFrame(tick);
    });
  }
  function onPreference() {
    if (media.matches) showFinal();
  }
  media.addEventListener('change', onPreference);
  draw(media.matches ? duration : 0);
  return {
    element: svg,
    play,
    showFinal,
    detach() {
      disposed = true;
      cancelAnimationFrame(frame);
      settle = null;
      media.removeEventListener('change', onPreference);
    },
    destroy() {
      disposed = true;
      stop();
      media.removeEventListener('change', onPreference);
      svg.remove();
    },
  };
}
