// Regenerate web + PWA + iOS icons from the official splash-screen logo.
//
//   node scripts/build-app-icon.mjs
//
// Source: assets/icons/splash-mark.png (official NabadAi splash mark)
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
const APP_BG = { r: 5, g: 7, b: 13, alpha: 1 }; // #05070d
/** Logo width vs canvas — ~76% fill zoomed out 20% → ~61%, centered on #05070d. */
const MARK_CANVAS_FILL = 0.608;

const ICON_DIR = path.join(
  ROOT,
  "ios",
  "App",
  "App",
  "Assets.xcassets",
  "AppIcon.appiconset",
);
const IOS_ICON = path.join(ICON_DIR, "AppIcon-512@2x.png");

/** Square canvas with the splash mark centered — matches boot splash / PWA. */
async function composeBrandSquare(size) {
  const inner = Math.max(16, Math.round(size * MARK_CANVAS_FILL));
  const mark = await sharp(SOURCE)
    .resize(inner, inner, { fit: "inside", kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: APP_BG,
    },
  })
    .composite([{ input: mark, gravity: "center" }])
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
