// Regenerate app icons (iOS + PWA) from the committed master artwork.
//
//   node scripts/build-app-icon.mjs
//
// Input:  assets/icons/app-icon-master.png  (square, ideally 1024×1024)
// Output:
//   - ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
//   - assets/icons/icon-{192,512}.png, apple-touch-icon.png
//   - www/assets/icons/… (same, for Capacitor web bundle)
//
// Keep ZOOM at 1.0 so the neon squircle frame is not cropped — iOS masks the
// square to a superellipse; cropping would clip the glowing border.

import sharp from "sharp";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MASTER = path.join(ROOT, "assets", "icons", "app-icon-master.png");

const ZOOM = 1.0;
const OUT_SIZE = 1024;
/** Matches --bg / splash / Capacitor shell (`capacitor.config.json`). */
const APP_BG = { r: 5, g: 7, b: 13 }; // #05070d

function isLogoPixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max - min;
  if (max < 45) return false;
  if (sat >= 18 && max >= 55) return true;
  if (g > 90 && b > 90 && r < 120) return true;
  if (b > 120 && r > 60 && g < 180) return true;
  return false;
}

/** Flatten baked squircle borders / off-brand dark fills to the app canvas color. */
async function normalizeMasterBg(buf) {
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (isLogoPixel(r, g, b)) {
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = 255;
    } else {
      out[i] = APP_BG.r;
      out[i + 1] = APP_BG.g;
      out[i + 2] = APP_BG.b;
      out[i + 3] = 255;
    }
  }
  return sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .resize(OUT_SIZE, OUT_SIZE, { fit: "cover", position: "centre" })
    .png({ compressionLevel: 9, force: true })
    .toBuffer();
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

async function zoomSquareTo1024(buf) {
  const big = Math.round(OUT_SIZE * ZOOM);
  const resized = await sharp(buf)
    .resize(big, big, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .toBuffer();
  const left = Math.floor((big - OUT_SIZE) / 2);
  const top = Math.floor((big - OUT_SIZE) / 2);
  return sharp(resized)
    .extract({ left, top, width: OUT_SIZE, height: OUT_SIZE })
    .png({ compressionLevel: 9, force: true })
    .toBuffer();
}

async function main() {
  await fs.mkdir(ICON_DIR, { recursive: true });
  const raw = await fs.readFile(MASTER);
  const master1024 = await normalizeMasterBg(raw);

  const icon1024 = await zoomSquareTo1024(master1024);

  const write = async (dest) => {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, icon1024);
  };

  await write(IOS_ICON);
  await write(path.join(ROOT, "assets", "icons", "icon-512.png"));
  await write(path.join(ROOT, "www", "assets", "icons", "icon-512.png"));

  const icon192 = await sharp(icon1024)
    .resize(192, 192, { kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, force: true })
    .toBuffer();
  const touch180 = await sharp(icon1024)
    .resize(180, 180, { kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, force: true })
    .toBuffer();
  const fav32 = await sharp(icon1024)
    .resize(32, 32, { kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, force: true })
    .toBuffer();
  const fav16 = await sharp(icon1024)
    .resize(16, 16, { kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, force: true })
    .toBuffer();

  for (const rel of [
    ["assets", "icons", "icon-192.png"],
    ["www", "assets", "icons", "icon-192.png"],
    ["assets", "icons", "apple-touch-icon.png"],
    ["www", "assets", "icons", "apple-touch-icon.png"],
  ]) {
    const dest = path.join(ROOT, ...rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, rel.includes("apple-touch") ? touch180 : icon192);
  }
  for (const [parts, buf] of [
    [["assets", "icons", "favicon-32.png"], fav32],
    [["www", "assets", "icons", "favicon-32.png"], fav32],
    [["assets", "icons", "favicon-16.png"], fav16],
    [["www", "assets", "icons", "favicon-16.png"], fav16],
  ]) {
    const dest = path.join(ROOT, ...parts);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, buf);
  }

  const meta = await sharp(icon1024).metadata();
  console.log(
    `App icon (${ZOOM}× zoom) → iOS + PWA icons  ${meta.width}x${meta.height}  hasAlpha=${meta.hasAlpha}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
