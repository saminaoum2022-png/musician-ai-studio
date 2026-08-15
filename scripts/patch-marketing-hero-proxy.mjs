#!/usr/bin/env node
/**
 * Point marketing hero <img> tags at the live CMS proxy (no flash on admin save).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** @type {{ file: string, page: string, locale: string, preload?: boolean }[]} */
const targets = [
  { file: "home.html", page: "home", locale: "en", preload: true },
  { file: "ar/index.html", page: "home", locale: "ar" },
  { file: "ai-music-generator.html", page: "ai-music-generator", locale: "en" },
  { file: "hum-to-song.html", page: "hum-to-song", locale: "en" },
  { file: "lyrics-to-song.html", page: "lyrics-to-song", locale: "en" },
  { file: "photo-to-song.html", page: "photo-to-song", locale: "en" },
  { file: "arabic-ai-music-generator.html", page: "arabic-ai-music-generator", locale: "en" },
  { file: "ar/ai-music-generator.html", page: "ai-music-generator", locale: "ar" },
  { file: "ar/hum-to-song.html", page: "hum-to-song", locale: "ar" },
  { file: "ar/lyrics-to-song.html", page: "lyrics-to-song", locale: "ar" },
  { file: "ar/photo-to-song.html", page: "photo-to-song", locale: "ar" },
  { file: "ar/arabic-ai-music-generator.html", page: "arabic-ai-music-generator", locale: "ar" },
];

function heroProxy(page, locale) {
  return `/api/marketing/hero-image?page=${encodeURIComponent(page)}&locale=${encodeURIComponent(locale)}`;
}

for (const { file, page, locale, preload } of targets) {
  const abs = path.join(root, file);
  if (!fs.existsSync(abs)) {
    console.warn(`skip missing ${file}`);
    continue;
  }
  let html = fs.readFileSync(abs, "utf8");
  const proxy = heroProxy(page, locale);

  html = html.replace(/\n\s*<link rel="preload" as="image" href="[^"]*">/g, "");

  if (preload) {
    html = html.replace(
      /<link rel="stylesheet" href="\/marketing\.css">/,
      `<link rel="stylesheet" href="/marketing.css">\n  <link rel="preload" as="image" href="${proxy}">`,
    );
  }

  html = html.replace(
    /(<img(?:\s+data-mk="hero\.image")?\s+[^>]*\ssrc=")[^"]+(")/,
    `$1${proxy}$2`,
  );

  fs.writeFileSync(abs, html);
  console.log(`patched ${file} → ${proxy}`);
}
