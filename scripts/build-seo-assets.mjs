#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iconPath = path.join(
  root,
  "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
);
const socialPath = path.join(root, "assets/marketing/nabadai-social-card.png");

const icon = await sharp(iconPath)
  .flatten({ background: "#05070d" })
  .png()
  .toBuffer();

await sharp(icon).toFile(iconPath);

const logo = await sharp(icon)
  .resize(300, 300, { fit: "contain" })
  .png()
  .toBuffer();
const text = Buffer.from(`
  <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#23d5ab"/>
        <stop offset="1" stop-color="#7c5cff"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="630" fill="#05070d"/>
    <circle cx="1060" cy="70" r="250" fill="#7c5cff" opacity=".08"/>
    <circle cx="980" cy="590" r="310" fill="#23d5ab" opacity=".07"/>
    <text x="430" y="240" fill="#f8faff" font-family="Arial, Helvetica, sans-serif" font-size="78" font-weight="800">NabadAi</text>
    <text x="430" y="322" fill="url(#accent)" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="700">AI Music Studio</text>
    <text x="430" y="388" fill="#b6bdcb" font-family="Arial, Helvetica, sans-serif" font-size="30">Hum it. Write it. Create your song.</text>
  </svg>
`);

fs.mkdirSync(path.dirname(socialPath), { recursive: true });
await sharp(text)
  .composite([{ input: logo, left: 80, top: 165 }])
  .png()
  .toFile(socialPath);

console.log(`build-seo-assets: ${path.relative(root, socialPath)}`);
console.log("build-seo-assets: App Store icon flattened to opaque PNG");
