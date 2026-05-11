// One-shot script: rebuild
//   1. ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
//   2. ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732*.png
// from assets/nabadai-logo.png. Run with `node scripts/build-app-icon.mjs`.
//
// Both outputs are flat (no-alpha) PNGs composited over a dark navy →
// charcoal radial gradient. The app icon fills the canvas edge-to-edge;
// the splash places the logo centered at ~40% of the shortest side so
// it reads well on every iPhone/iPad screen.

import sharp from "sharp";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LOGO = path.join(ROOT, "assets", "nabadai-logo.png");

const ICON_DIR = path.join(
  ROOT,
  "ios",
  "App",
  "App",
  "Assets.xcassets",
  "AppIcon.appiconset",
);
const ICON_FILE = path.join(ICON_DIR, "AppIcon-512@2x.png");

const SPLASH_DIR = path.join(
  ROOT,
  "ios",
  "App",
  "App",
  "Assets.xcassets",
  "Splash.imageset",
);
const SPLASH_FILES = [
  "splash-2732x2732.png",
  "splash-2732x2732-1.png",
  "splash-2732x2732-2.png",
];

const ICON_SIZE = 1024;
const SPLASH_SIZE = 2732;
const SPLASH_LOGO_RATIO = 0.4; // logo occupies 40% of canvas width

function gradientSvg(size) {
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="g" cx="50%" cy="42%" r="75%">
      <stop offset="0%" stop-color="#1e2452"/>
      <stop offset="55%" stop-color="#0f1430"/>
      <stop offset="100%" stop-color="#06081a"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
</svg>
`);
}

async function buildIcon() {
  await fs.mkdir(ICON_DIR, { recursive: true });

  // Trim transparent border baked into source so "edge-to-edge" really is.
  const trimmed = await sharp(LOGO).trim().toBuffer();
  const logo = await sharp(trimmed)
    .resize(ICON_SIZE, ICON_SIZE, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .toBuffer();

  await sharp(gradientSvg(ICON_SIZE))
    .composite([{ input: logo, gravity: "center" }])
    .flatten({ background: { r: 6, g: 8, b: 26 } })
    .removeAlpha()
    .png({ compressionLevel: 9, force: true })
    .toFile(ICON_FILE);

  const meta = await sharp(ICON_FILE).metadata();
  console.log(
    `Icon  ${path.relative(ROOT, ICON_FILE)}  ${meta.width}x${meta.height}  hasAlpha=${meta.hasAlpha}`,
  );
}

async function buildSplash() {
  await fs.mkdir(SPLASH_DIR, { recursive: true });

  const trimmed = await sharp(LOGO).trim().toBuffer();
  const logoTarget = Math.round(SPLASH_SIZE * SPLASH_LOGO_RATIO);
  const logo = await sharp(trimmed)
    .resize(logoTarget, logoTarget, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .toBuffer();

  const buffer = await sharp(gradientSvg(SPLASH_SIZE))
    .composite([{ input: logo, gravity: "center" }])
    .flatten({ background: { r: 6, g: 8, b: 26 } })
    .removeAlpha()
    .png({ compressionLevel: 9, force: true })
    .toBuffer();

  // All three splash files share the same bitmap — Capacitor's default
  // imageset declares 1x/2x/3x variants but only ever uses one source PNG.
  for (const name of SPLASH_FILES) {
    const target = path.join(SPLASH_DIR, name);
    await fs.writeFile(target, buffer);
  }
  const meta = await sharp(path.join(SPLASH_DIR, SPLASH_FILES[0])).metadata();
  console.log(
    `Splash ${path.relative(ROOT, SPLASH_DIR)}/*.png  ${meta.width}x${meta.height}  hasAlpha=${meta.hasAlpha}`,
  );
}

async function main() {
  await buildIcon();
  await buildSplash();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
