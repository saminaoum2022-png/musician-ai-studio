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
// A slight center zoom makes the “Na” mark read larger on the home screen.

import sharp from "sharp";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MASTER = path.join(ROOT, "assets", "icons", "app-icon-master.png");

const ZOOM = 1.12; // ~12% crop zoom — enlarges letterforms vs the frame
const OUT_SIZE = 1024;

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
  const master1024 = await sharp(raw)
    .resize(OUT_SIZE, OUT_SIZE, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

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

  const meta = await sharp(icon1024).metadata();
  console.log(
    `App icon (${ZOOM}× zoom) → iOS + PWA icons  ${meta.width}x${meta.height}  hasAlpha=${meta.hasAlpha}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
