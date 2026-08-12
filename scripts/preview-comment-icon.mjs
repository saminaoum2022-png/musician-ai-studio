#!/usr/bin/env node
/**
 * Preview extracted comment icon vs reference. Does NOT touch app code.
 */
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const refPath =
  process.argv[2] ||
  join(
    root,
    "../.cursor/projects/Users-samynaoum-Desktop-musician-ai-studio/assets/3C0CDE92-E1D3-473F-88DB-70734399C6AB-f7a040af-d8b7-4e2f-994d-89803d7de741.png",
  );
const iconSvgPath = join(root, "assets/marketing/comment-icon-bar.svg");
const outPath = join(root, "assets/marketing/comment-icon-preview.png");

const bg = "#05070d";
const label = "#8b95a8";
const iconColor = "#737a88";

async function renderIcon(size, color = iconColor) {
  const svg = readFileSync(iconSvgPath, "utf8").replace(/currentColor/g, color);
  return sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
}

const meta = await sharp(readFileSync(refPath)).metadata();
const refCrop = await sharp(readFileSync(refPath))
  .extract({
    left: Math.round(meta.width * 0.04),
    top: Math.round(meta.height * 0.24),
    width: Math.round(meta.width * 0.92),
    height: Math.round(meta.height * 0.28),
  })
  .resize(320, 320, { fit: "contain", background: bg })
  .png()
  .toBuffer();

const proposedLarge = await renderIcon(320);
const proposedBar = await renderIcon(18);

const titleSvg = (text, x) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="40"><text x="${x}" y="28" fill="${label}" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="13" font-weight="600">${text}</text></svg>`,
  );

await sharp({
  create: { width: 1200, height: 760, channels: 4, background: { r: 5, g: 7, b: 13, alpha: 255 } },
})
  .composite([
    { input: titleSvg("YOUR REFERENCE (cropped)", 40), top: 0, left: 0 },
    { input: titleSvg("EXTRACTED FROM PNG (not invented)", 620), top: 0, left: 0 },
    { input: refCrop, top: 56, left: 40 },
    { input: proposedLarge, top: 56, left: 620 },
    { input: titleSvg("@ 18px in feed bar", 620), top: 420, left: 0 },
    { input: proposedBar, top: 460, left: 620 },
  ])
  .png()
  .toFile(outPath);

console.log("preview-comment-icon:", outPath);
