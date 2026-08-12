#!/usr/bin/env node
/**
 * Extract comment icon from reference PNG — outer edge trace only (no invented paths).
 */
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const refPath =
  process.argv[2] ||
  join(
    root,
    "../.cursor/projects/Users-samynaoum-Desktop-musician-ai-studio/assets/3C0CDE92-E1D3-473F-88DB-70734399C6AB-f7a040af-d8b7-4e2f-994d-89803d7de741.png",
  );
const outSvg = join(root, "assets/marketing/comment-icon-bar.svg");

const isInk = (v) => v > 22 && v < 130;

function rdp(points, eps) {
  if (points.length < 3) return points;
  const start = points[0];
  const end = points[points.length - 1];
  let maxD = 0;
  let idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [x0, y0] = start;
    const [x1, y1] = end;
    const [x, y] = points[i];
    const num = Math.abs((y1 - y0) * x - (x1 - x0) * y + x1 * y0 - x0 * y1);
    const den = Math.hypot(y1 - y0, x1 - x0) || 1;
    const d = num / den;
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > eps) {
    return [...rdp(points.slice(0, idx + 1), eps).slice(0, -1), ...rdp(points.slice(idx), eps)];
  }
  return [start, end];
}

const refBuf = readFileSync(refPath);
const meta = await sharp(refBuf).metadata();
const cropTop = Math.round(meta.height * 0.24);
const cropH = Math.round(meta.height * 0.28);
const cropLeft = Math.round(meta.width * 0.04);
const cropW = Math.round(meta.width * 0.92);

const traceSize = 200;
const { data } = await sharp(refBuf)
  .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
  .resize(traceSize, traceSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 1 } })
  .greyscale()
  .raw()
  .toBuffer({ resolveWithObject: true });

const w = traceSize;
const h = traceSize;
const ink = Array(w * h).fill(0);
for (let i = 0; i < w * h; i++) ink[i] = isInk(data[i]) ? 1 : 0;

const has = (x, y) => x >= 0 && y >= 0 && x < w && y < h && ink[y * w + x];

// Components
const vis = Array(w * h).fill(0);
const comps = [];
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const idx = y * w + x;
    if (!ink[idx] || vis[idx]) continue;
    const q = [[x, y]];
    const pts = [];
    vis[idx] = 1;
    while (q.length) {
      const [cx, cy] = q.pop();
      pts.push([cx, cy]);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!has(nx, ny) || !ink[ny * w + nx] || vis[ny * w + nx]) continue;
        vis[ny * w + nx] = 1;
        q.push([nx, ny]);
      }
    }
    let minx = 999;
    let maxx = 0;
    let miny = 999;
    let maxy = 0;
    pts.forEach(([px, py]) => {
      minx = Math.min(minx, px);
      maxx = Math.max(maxx, px);
      miny = Math.min(miny, py);
      maxy = Math.max(maxy, py);
    });
    comps.push({ pts, n: pts.length, cx: (minx + maxx) / 2, cy: (miny + maxy) / 2, bw: maxx - minx + 1, bh: maxy - miny + 1 });
  }
}
comps.sort((a, b) => b.n - a.n);

const bubble = comps[0];
const dots = comps
  .filter((c) => c.n >= 6 && c.n <= 100 && c.bw <= 20 && c.bh <= 20)
  .sort((a, b) => a.cx - b.cx)
  .slice(0, 3);

const bubbleSet = new Set(bubble.pts.map(([px, py]) => py * w + px));

// Outer edge pixels of bubble ink (exclude inner hole of ring)
const edgePts = [];
for (const [x, y] of bubble.pts) {
  let boundary = false;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      if (!has(x + dx, y + dy) || !bubbleSet.has((y + dy) * w + (x + dx))) {
        boundary = true;
        break;
      }
    }
    if (boundary) break;
  }
  if (!boundary) continue;
  const dist = Math.hypot(x - bubble.cx, y - bubble.cy);
  edgePts.push([x, y, dist]);
}

const dists = edgePts.map((p) => p[2]).sort((a, b) => a - b);
const split = dists[Math.floor(dists.length * 0.42)]; // outer ring only
const outer = edgePts.filter((p) => p[2] >= split).map(([x, y]) => [x, y]);
outer.sort((a, b) => Math.atan2(a[1] - bubble.cy, a[0] - bubble.cx) - Math.atan2(b[1] - bubble.cy, b[0] - bubble.cx));

if (outer.length < 16) throw new Error("Outer edge trace failed.");

// Fit to 24x24 using bubble ink bounds (not full canvas)
let minx = 999;
let maxx = 0;
let miny = 999;
let maxy = 0;
for (const [x, y] of outer) {
  minx = Math.min(minx, x);
  maxx = Math.max(maxx, x);
  miny = Math.min(miny, y);
  maxy = Math.max(maxy, y);
}
const pad = 2;
const span = 24 - pad * 2;
const mapX = (x) => pad + ((x - minx) / (maxx - minx)) * span;
const mapY = (y) => pad + ((y - miny) / (maxy - miny)) * span;

const simplified = rdp(outer, 1.4);
let pathD = "";
simplified.forEach(([x, y], i) => {
  pathD += (i ? " L" : "M") + ` ${mapX(x).toFixed(2)} ${mapY(y).toFixed(2)}`;
});
pathD += " Z";

const dotEls = dots
  .map((d) => {
    const cx = mapX(d.cx).toFixed(2);
    const cy = mapY(d.cy).toFixed(2);
    const r = Math.max(0.5, Math.min(1.0, (Math.max(d.bw, d.bh) / (maxx - minx)) * span * 0.22)).toFixed(2);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" stroke="none"/>`;
  })
  .join("\n  ");

writeFileSync(
  outSvg,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
  <path d="${pathD}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  ${dotEls}
</svg>
`,
);

console.log("extract-comment-icon-v2:", outSvg, { outer: outer.length, simplified: simplified.length, dots: dots.length });
