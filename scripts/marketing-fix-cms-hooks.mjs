#!/usr/bin/env node
/** Fix CMS data-mk attributes on SEO landing HTML files. */
import fs from "fs";
import path from "path";

const root = process.cwd();
const pages = [
  "ai-music-generator.html",
  "hum-to-song.html",
  "lyrics-to-song.html",
  "photo-to-song.html",
  "arabic-ai-music-generator.html",
  "ar/ai-music-generator.html",
  "ar/hum-to-song.html",
  "ar/lyrics-to-song.html",
  "ar/photo-to-song.html",
  "ar/arabic-ai-music-generator.html",
];

function fixHtml(html) {
  let out = html;

  // Hero h1
  out = out.replace(
    /(<div class="heroCopy">[\s\S]*?)<h1>(?!data-mk)/,
    '$1<h1 data-mk="hero.title">',
  );
  out = out.replace(
    /(<div class="heroCopy">[\s\S]*?<h1)(?! data-mk="hero.title")>/,
    '$1 data-mk="hero.title">',
  );

  // Features section eyebrow/title (not hero)
  out = out.replace(
    /(<section class="section" id="features">[\s\S]*?<p class="eyebrow") data-mk="hero.eyebrow"/,
    '$1 data-mk="features.eyebrow"',
  );
  out = out.replace(
    /(<section class="section" id="features">[\s\S]*?<header class="sectionHead">[\s\S]*?<h2)(?! data-mk)/,
    '$1 data-mk="features.title"',
  );

  // FAQ answers
  out = out.replace(
    /(<article class="faqItem"[\s\S]*?<h3[^>]*>[\s\S]*?<\/h3>)<p data-mk="feature.body"/g,
    '$1<p data-mk="faq.a"',
  );

  // Final CTA button
  out = out.replace(
    /(<section class="finalCta"[\s\S]*?)<a class="marketingCta" data-mk="hero.cta"/,
    '$1<a class="marketingCta" data-mk="final.cta"',
  );

  return out;
}

for (const file of pages) {
  const abs = path.join(root, file);
  if (!fs.existsSync(abs)) continue;
  const html = fs.readFileSync(abs, "utf8");
  const next = fixHtml(html);
  if (next !== html) {
    fs.writeFileSync(abs, next);
    console.log(`marketing-fix-cms-hooks: ${file}`);
  }
}
