// Regenerate web + PWA + iOS icons from the official splash-screen logo.
//
//   node scripts/build-app-icon.mjs
//
// Source: assets/icons/splash-mark.png (official NabadAi splash mark)
// Field #11121D + one 24px dilated #7C5CFF@20% pulse behind the N.
// Output (repo root + www/ mirror + assets/icons/ legacy paths):
//   favicon.ico, favicon-48x48.png, favicon-96x96.png,
//   apple-touch-icon.png, icon-192.png, icon-512.png
//   ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png

import sharp from "sharp";
import toIco from "to-ico";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "assets", "icons", "splash-mark.png");
const APP_BG = { r: 17, g: 18, b: 29, alpha: 1 }; // #11121D
const PULSE = { r: 124, g: 92, b: 255 }; // #7C5CFF
const PULSE_OPACITY = 0.2;
/** 24px outward dilate on the 1024 canvas; scales with icon size. */
const PULSE_DILATE_AT_1024 = 24;
const PULSE_BLUR_AT_1024 = 1.5;
/** Logo width vs canvas — ~61% fill; reduced 10% (0.608 → 0.547) for app icon. */
const MARK_CANVAS_FILL = 0.547;

/** Chamfer distance transform — expand a binary alpha by `radius` px (not a scale). */
function dilateDisk(alpha, w, h, radius) {
  const inf = 1e9;
  const dist = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) dist[i] = alpha[i] > 16 ? 0 : inf;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x > 0) dist[i] = Math.min(dist[i], dist[i - 1] + 1);
      if (y > 0) dist[i] = Math.min(dist[i], dist[i - w] + 1);
      if (x > 0 && y > 0) dist[i] = Math.min(dist[i], dist[i - w - 1] + Math.SQRT2);
      if (x + 1 < w && y > 0) dist[i] = Math.min(dist[i], dist[i - w + 1] + Math.SQRT2);
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (x + 1 < w) dist[i] = Math.min(dist[i], dist[i + 1] + 1);
      if (y + 1 < h) dist[i] = Math.min(dist[i], dist[i + w] + 1);
      if (x + 1 < w && y + 1 < h) dist[i] = Math.min(dist[i], dist[i + w + 1] + Math.SQRT2);
      if (x > 0 && y + 1 < h) dist[i] = Math.min(dist[i], dist[i + w - 1] + Math.SQRT2);
    }
  }
  const out = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) out[i] = dist[i] <= radius ? 255 : 0;
  return out;
}

const ICON_DIR = path.join(
  ROOT,
  "ios",
  "App",
  "App",
  "Assets.xcassets",
  "AppIcon.appiconset",
);
const IOS_ICON = path.join(ICON_DIR, "AppIcon-512@2x.png");

/** Square canvas: solid field + one dilated pulse silhouette + the original N. */
async function composeBrandSquare(size) {
  const inner = Math.max(16, Math.round(size * MARK_CANVAS_FILL));
  const mark = await sharp(SOURCE)
    .resize(inner, inner, { fit: "inside", kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .png()
    .toBuffer();

  const placed = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: mark, gravity: "center" }])
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const px = Buffer.from(placed.data);
  const { width: w, height: h } = placed.info;
  const alpha = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (px[o] > 240 && px[o + 1] > 240 && px[o + 2] > 240) {
      px[o + 3] = 0;
      alpha[i] = 0;
    } else {
      alpha[i] = px[o + 3];
    }
  }
  const logo = await sharp(px, { raw: placed.info }).png().toBuffer();

  const dilatePx = Math.max(1, Math.round(PULSE_DILATE_AT_1024 * (size / 1024)));
  const dilated = dilateDisk(alpha, w, h, dilatePx);
  const pulseByte = Math.round(255 * PULSE_OPACITY);
  const pulseRgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    pulseRgba[i * 4] = PULSE.r;
    pulseRgba[i * 4 + 1] = PULSE.g;
    pulseRgba[i * 4 + 2] = PULSE.b;
    pulseRgba[i * 4 + 3] = dilated[i] ? pulseByte : 0;
  }
  const blurPx = PULSE_BLUR_AT_1024 * (size / 1024);
  let pulse = sharp(pulseRgba, { raw: { width: w, height: h, channels: 4 } });
  if (blurPx >= 0.5) pulse = pulse.blur(blurPx);
  pulse = await pulse.png().toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: APP_BG,
    },
  })
    .composite([
      { input: pulse, left: 0, top: 0 },
      { input: logo, left: 0, top: 0 },
    ])
    .png({ compressionLevel: 9, force: true })
    .toBuffer();
}

async function writeFile(dest, buf) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buf);
}

async function writeMirrors(relParts, buf) {
  await writeFile(path.join(ROOT, ...relParts), buf);
  await writeFile(path.join(ROOT, "www", ...relParts), buf);
}

async function main() {
  if (!(await fs.stat(SOURCE).catch(() => null))) {
    throw new Error(`Missing official splash mark: ${SOURCE}`);
  }

  const sizes = {
    512: ["icon-512.png"],
    192: ["icon-192.png"],
    180: ["apple-touch-icon.png"],
    96: ["favicon-96x96.png"],
    48: ["favicon-48x48.png"],
    32: [],
    16: [],
  };

  const bufs = {};
  for (const size of Object.keys(sizes).map(Number).sort((a, b) => b - a)) {
    bufs[size] = await composeBrandSquare(size);
  }

  for (const [size, names] of Object.entries(sizes)) {
    const buf = bufs[Number(size)];
    for (const name of names) {
      await writeMirrors([name], buf);
      if (name.startsWith("icon-") || name === "apple-touch-icon.png") {
        await writeMirrors(["assets", "icons", name], buf);
      }
    }
  }

  const ico = await toIco([bufs[48], bufs[32], bufs[16]]);
  await writeMirrors(["favicon.ico"], ico);

  const iosIcon1024 = await composeBrandSquare(1024);
  await fs.mkdir(ICON_DIR, { recursive: true });
  await writeFile(IOS_ICON, iosIcon1024);

  console.log("Brand icons generated from assets/icons/splash-mark.png");
  console.log("  root: favicon.ico, favicon-48x48.png, favicon-96x96.png, apple-touch-icon.png, icon-192.png, icon-512.png");
  console.log("  iOS: AppIcon-512@2x.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
