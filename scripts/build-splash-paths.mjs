// Extract purple / teal stroke centerlines from the production app icon.
// Each segment is a straight line between measured cap centers — no row sampling.
//
//   node scripts/build-splash-paths.mjs

import sharp from "sharp";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ICON = path.join(ROOT, "assets", "icons", "app-icon-master.png");
const OUT = path.join(ROOT, "assets", "splash", "logo-paths.json");

function kind(r, g, b, a = 255) {
  if (a < 20 || Math.max(r, g, b) < 45) return null;
  if (g > r + 20 && g > 100) return "teal";
  if (b > 100 && r > 60) return "purple";
  return null;
}

function toPath(pts) {
  return `M ${pts.map((p) => `${p[0]} ${p[1]}`).join(" L ")}`;
}

async function main() {
  const { data, info } = await sharp(ICON)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;

  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (kind(data[i], data[i + 1], data[i + 2], data[i + 3])) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  const W = maxX - minX + 1;
  const H = maxY - minY + 1;
  const n = (x, y) => [
    Math.round(((x - minX) / W) * 1000 * 10) / 10,
    Math.round(((y - minY) / H) * 1000 * 10) / 10,
  ];

  const px = (x, y) => {
    const cx = Math.min(w - 1, Math.max(0, Math.round(x)));
    const cy = Math.min(h - 1, Math.max(0, Math.round(y)));
    const i = (cy * w + cx) * 4;
    return kind(data[i], data[i + 1], data[i + 2], data[i + 3]);
  };

  const capCenter = (col, region, edge) => {
    const pts = [];
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (px(x, y) !== col) continue;
        if (region === "left" && x > minX + W * 0.38) continue;
        if (region === "right" && x < minX + W * 0.62) continue;
        pts.push([x, y]);
      }
    }
    if (!pts.length) return [500, 500];
    const y0 =
      edge === "top"
        ? Math.min(...pts.map((p) => p[1]))
        : Math.max(...pts.map((p) => p[1]));
    const row = pts.filter((p) =>
      edge === "top" ? p[1] <= y0 + 4 : p[1] >= y0 - 4,
    );
    return n(
      row.reduce((s, p) => s + p[0], 0) / row.length,
      row.reduce((s, p) => s + p[1], 0) / row.length,
    );
  };

  let splitY = minY + Math.round(H * 0.45);
  for (let y = minY; y <= maxY; y++) {
    const hasTeal = [...Array(maxX - minX + 1)].some((_, i) => {
      const x = minX + i;
      return px(x, y) === "teal" && x > minX + W * 0.55;
    });
    const hasPurpleOnly = [...Array(maxX - minX + 1)].some((_, i) => {
      const x = minX + i;
      return px(x, y) === "purple" && x > minX + W * 0.55;
    });
    if (hasTeal && !hasPurpleOnly) splitY = y;
  }

  const splitXs = [];
  for (let x = minX; x <= maxX; x++) {
    const k = px(x, splitY);
    if ((k === "teal" || k === "purple") && x > minX + W * 0.55) splitXs.push(x);
  }
  const split = n(
    splitXs.reduce((s, x) => s + x, 0) / Math.max(1, splitXs.length),
    splitY,
  );

  const leftBot = capCenter("purple", "left", "bottom");
  const leftTop = capCenter("purple", "left", "top");
  const rightTop = capCenter("teal", "right", "top");
  const rightBot = capCenter("purple", "right", "bottom");

  // N geometry: left stem → diagonal → right stem (purple); right top → split (teal)
  const purple = [leftBot, leftTop, split, rightBot];
  const teal = [rightTop, split];

  const strokeSamples = [];
  for (let y = Math.round(minY + H * 0.45); y <= Math.round(minY + H * 0.55); y++) {
    const xs = [];
    for (let x = minX; x <= maxX; x++) {
      if (px(x, y) === "purple" && x < minX + W * 0.38) xs.push(x);
    }
    if (xs.length) strokeSamples.push(Math.max(...xs) - Math.min(...xs) + 1);
  }
  const strokeWidth =
    Math.round(
      ((strokeSamples.reduce((a, b) => a + b, 0) /
        Math.max(1, strokeSamples.length)) /
        W) *
        1000 *
        10,
    ) / 10;

  const center = [
    Math.round(((leftBot[0] + rightBot[0]) / 2) * 10) / 10,
    Math.round(((leftTop[1] + leftBot[1]) / 2) * 10) / 10,
  ];

  const payload = {
    viewBox: [0, 0, 1000, 1000],
    strokeWidth,
    center,
    colors: { purple: "#7C5CFF", teal: "#23D5AB" },
    purplePath: toPath(purple),
    tealPath: toPath(teal),
    purplePoints: purple,
    tealPoints: teal,
  };

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, `${JSON.stringify(payload, null, 2)}\n`);

  const bootSplashJs = path.join(ROOT, "src", "boot-splash.js");
  let src = await fs.readFile(bootSplashJs, "utf8");
  const logoBlock = `  const LOGO = {
    viewBox: [0, 0, 1000, 1000],
    strokeWidth: ${strokeWidth},
    center: [${center[0]}, ${center[1]}],
    purplePath: "${payload.purplePath}",
    tealPath: "${payload.tealPath}",
  };`;
  src = src.replace(/ {2}const LOGO = \{[\s\S]*?\};/, logoBlock);
  await fs.writeFile(bootSplashJs, src);

  console.log(`splash paths → ${OUT} (stroke ${strokeWidth})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
