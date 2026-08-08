#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "assets/marketing/app-store-screenshots");
const captions = JSON.parse(
  fs.readFileSync(path.join(root, "app-store/screenshot-captions.json"), "utf8"),
);
const width = 1290;
const height = 2796;
const shotWidth = 1040;
const shotHeight = 2261;
const shotLeft = Math.round((width - shotWidth) / 2);
const shotTop = 390;

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

for (const [locale, files] of Object.entries(captions)) {
  const isArabic = locale.startsWith("ar");
  const outputDir = path.join(root, "app-store/screenshots", locale);
  fs.mkdirSync(outputDir, { recursive: true });

  for (const [file, caption] of Object.entries(files)) {
    const source = path.join(sourceDir, file);
    if (!fs.existsSync(source)) throw new Error(`Missing screenshot: ${source}`);
    const screenshot = await sharp(source)
      .resize(shotWidth, shotHeight, { fit: "cover" })
      .png()
      .toBuffer();
    const background = Buffer.from(`
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#05070d"/>
            <stop offset="0.55" stop-color="#090d16"/>
            <stop offset="1" stop-color="#101125"/>
          </linearGradient>
          <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#23d5ab"/>
            <stop offset="1" stop-color="#7c5cff"/>
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#bg)"/>
        <circle cx="1160" cy="120" r="310" fill="#7c5cff" opacity=".10"/>
        <circle cx="100" cy="2720" r="330" fill="#23d5ab" opacity=".07"/>
        <text x="${width / 2}" y="115" text-anchor="middle" fill="url(#accent)"
          font-family="Arial, Tahoma, sans-serif" font-size="34" font-weight="800">NabadAi</text>
        <text x="${width / 2}" y="245" text-anchor="middle" fill="#f7f9ff"
          direction="${isArabic ? "rtl" : "ltr"}" unicode-bidi="bidi-override"
          font-family="Arial, Tahoma, sans-serif" font-size="${isArabic ? 58 : 62}" font-weight="800">${escapeXml(caption)}</text>
        <rect x="${shotLeft - 8}" y="${shotTop - 8}" width="${shotWidth + 16}" height="${shotHeight + 16}"
          rx="52" fill="#161b27" stroke="rgba(255,255,255,.18)" stroke-width="2"/>
      </svg>
    `);
    const mask = Buffer.from(
      `<svg width="${shotWidth}" height="${shotHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="${shotWidth}" height="${shotHeight}" rx="44" fill="#fff"/></svg>`,
    );
    const rounded = await sharp(screenshot)
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer();

    await sharp(background)
      .composite([{ input: rounded, left: shotLeft, top: shotTop }])
      .png()
      .toFile(path.join(outputDir, file));
  }
  console.log(
    `build-app-store-screenshots: ${locale} (${Object.keys(files).length} images)`,
  );
}
