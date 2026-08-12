#!/usr/bin/env node
/**
 * Extract the comment bubble SVG path from the reference PNG (pixel trace).
 * Usage: node scripts/extract-comment-icon.mjs [path-to-png]
 */
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src =
  process.argv[2] ||
  join(
    root,
    "../.cursor/projects/Users-samynaoum-Desktop-musician-ai-studio/assets/Untitled_design_2-3342316e-e874-48d7-85e6-eb79e89c6e3b.png",
  );

const to24 = (x, y) => [(x - 5) / 83 * 22 + 1, (y - 1) / 76 * 22 + 1];

function traceContour(set, w, h) {
  let start = null;
  for (let y = 0; y < h && !start; y++) {
    for (let x = 0; x < w; x++) {
      if (!set.has(y * w + x)) continue;
      for (const [dx, dy] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || !set.has(ny * w + nx)) {
          start = [x, y];
          break;
        }
      }
      if (start) break;
    }
  }
  const dirs = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];
  const contour = [];
  let x = start[0];
  let y = start[1];
  let dir = 0;
  for (let steps = 0; steps < 10000; steps++) {
    contour.push([x, y]);
    let found = false;
    for (let i = 0; i < 8; i++) {
      const nd = (dir + i + 5) % 8;
      const [dx, dy] = dirs[nd];
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (set.has(ny * w + nx)) {
        x = nx;
        y = ny;
        dir = nd;
        found = true;
        break;
      }
    }
    if (!found) break;
    if (x === start[0] && y === start[1] && contour.length > 10) break;
  }
  return contour;
}

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
    return [
      ...rdp(points.slice(0, idx + 1), eps).slice(0, -1),
      ...rdp(points.slice(idx), eps),
    ];
  }
  return [start, end];
}

const w = 96;
const h = 96;
const { data } = await sharp(readFileSync(src))
  .extract({ left: 178, top: 288, width: 196, height: 190 })
  .resize(w, h, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .greyscale()
  .raw()
  .toBuffer({ resolveWithObject: true });

const bin = Array(w * h).fill(0);
const vis = Array(w * h).fill(0);
for (let i = 0; i < w * h; i++) if (data[i] < 128) bin[i] = 1;

let bubbleSet = new Set();
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const idx = y * w + x;
    if (!bin[idx] || vis[idx]) continue;
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
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (!vis[ni] && bin[ni]) {
          vis[ni] = 1;
          q.push([nx, ny]);
        }
      }
    }
    if (pts.length > 200) bubbleSet = new Set(pts.map(([px, py]) => py * w + px));
  }
}

const outer = traceContour(bubbleSet, w, h);
const cx = 46.5;
const cy = 39;
const centerline = outer.map(([x, y]) => {
  const dx = cx - x;
  const dy = cy - y;
  const d = Math.hypot(dx, dy) || 1;
  return [x + (dx / d) * 2.2, y + (dy / d) * 2.2];
});
const simp = rdp(centerline, 2.4);
let pathD = "";
simp.forEach(([x, y], i) => {
  const [X, Y] = to24(x, y);
  pathD += (i ? " L" : "M") + ` ${X.toFixed(2)} ${Y.toFixed(2)}`;
});
pathD += " Z";

const dots = [
  [30.5, 35.5],
  [47, 35.5],
  [64, 35.5],
].map(([x, y]) => {
  const p = to24(x, y);
  return { cx: +p[0].toFixed(2), cy: +p[1].toFixed(2), r: 0.75 };
});

const out = `/** Comment icon path extracted from reference PNG — run scripts/extract-comment-icon.mjs to regenerate. */
export const COMMENT_ICON_PATH = ${JSON.stringify(pathD)};
export const COMMENT_ICON_DOTS = ${JSON.stringify(dots)};
`;

writeFileSync(join(root, "src/comment-icon-path.js"), out);
console.log("wrote src/comment-icon-path.js", { points: simp.length, dots });
