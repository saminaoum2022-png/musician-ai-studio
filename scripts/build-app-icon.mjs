// Rebuild ONLY the iOS app icon — never touches Splash.imageset.
//
//   node scripts/build-app-icon.mjs
//
// Input:  assets/nabadai-logo.png
// Output: ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
//
// Background #f7f7f7 (soft off-white): blends better with the logo edges than
// pure white on the home screen. Flat PNG (no alpha) for App Store rules.

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

const ICON_SIZE = 1024;

const BG_FILL = "#f7f7f7";
const BG_RGB = { r: 247, g: 247, b: 247 };

function backgroundSvg(size) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="${BG_FILL}"/></svg>`,
  );
}

async function main() {
  await fs.mkdir(ICON_DIR, { recursive: true });

  const trimmed = await sharp(LOGO).trim().toBuffer();
  const logo = await sharp(trimmed)
    .resize(ICON_SIZE, ICON_SIZE, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .toBuffer();

  await sharp(backgroundSvg(ICON_SIZE))
    .composite([{ input: logo, gravity: "center" }])
    .flatten({ background: BG_RGB })
    .removeAlpha()
    .png({ compressionLevel: 9, force: true })
    .toFile(ICON_FILE);

  const meta = await sharp(ICON_FILE).metadata();
  console.log(
    `Icon only → ${path.relative(ROOT, ICON_FILE)}  ${meta.width}x${meta.height}  hasAlpha=${meta.hasAlpha}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
