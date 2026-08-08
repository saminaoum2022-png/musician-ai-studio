#!/usr/bin/env node
/**
 * Marketing-safe phone heroes for SEO pages — no usernames or profile photos.
 * Outputs assets/marketing/seo-hero-*.png (1206×2622, iPhone aspect).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "assets/marketing");
const shots = path.join(root, "assets/marketing/app-store-screenshots");
const width = 1206;
const height = 2622;

fs.mkdirSync(outDir, { recursive: true });

async function buildCreateFlowHero() {
  const source = path.join(shots, "08-generate-song.png");
  const cropHeight = 2025;
  const fadeOverlay = Buffer.from(`
    <svg width="${width}" height="${cropHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fade" x1="0" y1="0.88" x2="0" y2="1">
          <stop offset="0" stop-color="#05070d" stop-opacity="0"/>
          <stop offset="1" stop-color="#05070d" stop-opacity="0.92"/>
        </linearGradient>
      </defs>
      <rect y="${cropHeight - 180}" width="${width}" height="180" fill="url(#fade)"/>
    </svg>
  `);

  const dest = path.join(outDir, "seo-hero-create-flow.png");
  await sharp(source)
    .extract({ left: 0, top: 0, width, height: cropHeight })
    .composite([{ input: fadeOverlay, blend: "over" }])
    .png()
    .toFile(dest);
  console.log(`build-seo-hero-screenshots: ${path.relative(root, dest)}`);
}

async function buildPlayerHero() {
  const coverArt = await sharp(path.join(shots, "10-song-player.png"))
    .extract({ left: 42, top: 210, width: 1120, height: 1040 })
    .png()
    .toBuffer();

  const coverMeta = await sharp(coverArt).metadata();
  const coverW = coverMeta.width;
  const coverH = coverMeta.height;
  const coverMask = Buffer.from(
    `<svg width="${coverW}" height="${coverH}" xmlns="http://www.w3.org/2000/svg"><rect width="${coverW}" height="${coverH}" rx="48" fill="#fff"/></svg>`,
  );
  const roundedCover = await sharp(coverArt)
    .composite([{ input: coverMask, blend: "dest-in" }])
    .png()
    .toBuffer();

  const chrome = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cta" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#23d5ab"/>
          <stop offset="1" stop-color="#7c5cff"/>
        </linearGradient>
        <linearGradient id="glow" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0" stop-color="#7c5cff" stop-opacity="0.16"/>
          <stop offset="1" stop-color="#05070d" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="#05070d"/>
      <rect y="0" width="${width}" height="980" fill="url(#glow)"/>
      <text x="78" y="118" fill="#eef4ff" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700">Now playing</text>
      <rect x="78" y="1320" width="1050" height="8" rx="4" fill="rgba(255,255,255,0.12)"/>
      <rect x="78" y="1320" width="360" height="8" rx="4" fill="url(#cta)"/>
      <text x="78" y="1288" fill="#97a5ba" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="600">00:24</text>
      <text x="1128" y="1288" text-anchor="end" fill="#97a5ba" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="600">03:12</text>
      <text x="78" y="1400" fill="#eef4ff" font-family="Arial, Helvetica, sans-serif" font-size="56" font-weight="800">Golden Hour</text>
      <text x="78" y="1462" fill="#97a5ba" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="600">Created with NabadAi</text>
      <circle cx="603" cy="1680" r="96" fill="url(#cta)"/>
      <polygon points="582,1644 582,1716 662,1680" fill="#fff"/>
      <rect y="${height - 170}" width="${width}" height="170" fill="rgba(8,11,18,0.96)"/>
      <text x="120" y="${height - 58}" fill="#97a5ba" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="600">Discover</text>
      <text x="340" y="${height - 58}" fill="#97a5ba" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="600">Friends</text>
      <text x="780" y="${height - 58}" fill="#97a5ba" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="600">Activity</text>
      <text x="980" y="${height - 58}" fill="#97a5ba" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="600">Profile</text>
      <circle cx="603" cy="${height - 108}" r="62" fill="url(#cta)"/>
      <text x="603" y="${height - 94}" text-anchor="middle" fill="#fff" font-family="Arial, Helvetica, sans-serif" font-size="54" font-weight="300">+</text>
    </svg>
  `);

  const dest = path.join(outDir, "seo-hero-player.png");
  await sharp(chrome)
    .composite([
      {
        input: roundedCover,
        left: 42,
        top: 160,
      },
    ])
    .png()
    .toFile(dest);
  console.log(`build-seo-hero-screenshots: ${path.relative(root, dest)}`);
}

await buildCreateFlowHero();
await buildPlayerHero();

async function buildDeviceHero() {
  const source = path.join(outDir, "seo-hero-device-source.jpg");
  if (!fs.existsSync(source)) return;

  const targetWidth = 2560;
  const dest = path.join(outDir, "seo-hero-device.png");
  await sharp(source)
    .resize(targetWidth, null, { kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 0.65, m1: 0.45, m2: 0.25 })
    .png({ compressionLevel: 6, quality: 95 })
    .toFile(dest);

  const meta = await sharp(dest).metadata();
  console.log(
    `build-seo-hero-screenshots: ${path.relative(root, dest)} (${meta.width}×${meta.height})`,
  );
}

await buildDeviceHero();
