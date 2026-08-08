#!/usr/bin/env node
/**
 * Headless layout audit for SEO landing pages using Playwright-like checks via fetch + cheerio?
 * Simpler: use node with jsdom... not available.
 * Use sharp + static analysis of CSS and HTML structure instead, plus fetch checks.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = String(process.argv[2] || "http://127.0.0.1:8777").replace(/\/$/, "");

const pages = [
  { prod: "/ai-music-generator", fetch: "/ai-music-generator.html", lang: "en" },
  { prod: "/hum-to-song", fetch: "/hum-to-song.html", lang: "en" },
  { prod: "/lyrics-to-song", fetch: "/lyrics-to-song.html", lang: "en" },
  { prod: "/photo-to-song", fetch: "/photo-to-song.html", lang: "en" },
  { prod: "/arabic-ai-music-generator", fetch: "/arabic-ai-music-generator.html", lang: "en" },
  { prod: "/ar", fetch: "/ar/index.html", lang: "ar" },
  { prod: "/ar/ai-music-generator", fetch: "/ar/ai-music-generator.html", lang: "ar" },
  { prod: "/ar/hum-to-song", fetch: "/ar/hum-to-song.html", lang: "ar" },
  { prod: "/ar/lyrics-to-song", fetch: "/ar/lyrics-to-song.html", lang: "ar" },
  { prod: "/ar/photo-to-song", fetch: "/ar/photo-to-song.html", lang: "ar" },
  { prod: "/ar/arabic-ai-music-generator", fetch: "/ar/arabic-ai-music-generator.html", lang: "ar" },
];

const css = fs.readFileSync(path.join(root, "marketing.css"), "utf8");
const hasMobileMq = /@media \(max-width: 760px\)/.test(css);
const hasHeroMaxHeight = /marketingHeroArt img[\s\S]*object-fit: contain/.test(css);

let failures = 0;
function ok(c, m) {
  if (c) console.log(`✓ ${m}`);
  else {
    failures += 1;
    console.error(`✗ ${m}`);
  }
}

console.log("Layout + routing audit\n");
ok(hasMobileMq, "marketing.css includes mobile breakpoint (@media max-width 760px)");
ok(hasHeroMaxHeight, "marketing.css caps hero visual height for hero layout");

for (const page of pages) {
  const res = await fetch(`${base}${page.fetch}`);
  const html = await res.text();
  ok(res.ok, `${page.prod} HTTP ${res.status}`);

  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, "").trim();
  ok(Boolean(h1 && h1.length > 8), `${page.prod} has visible H1 text`);
  ok(/class="hero"/.test(html), `${page.prod} uses hero section`);
  ok(/class="marketingHeroArt"/.test(html), `${page.prod} includes hero device visual`);
  ok(/marketing\.css/.test(html), `${page.prod} links marketing.css`);
  ok(/href="\/#\/intro"/.test(html), `${page.prod} CTA routes to app intro (/#/intro)`);
  ok(/href="\/privacy"/.test(html), `${page.prod} footer privacy link uses clean URL`);
  ok(/class="marketingBrandMark"/.test(html), `${page.prod} uses NabadAi splash mark in header`);
  ok(/class="marketingBrandName">NabadAi/.test(html), `${page.prod} uses white NabadAi wordmark beside logo`);

  if (page.lang === "ar") {
    ok(/lang="ar"/.test(html) && /dir="rtl"/.test(html), `${page.prod} Arabic RTL markup`);
  }

  // Production routing: file must exist for cleanUrl path
  const disk =
    page.prod === "/ar"
      ? "ar/index.html"
      : page.prod.startsWith("/ar/")
        ? `ar/${page.prod.slice(4)}.html`
        : `${page.prod.slice(1)}.html`;
  ok(fs.existsSync(path.join(root, disk)), `${page.prod} maps to ${disk} for Vercel cleanUrls`);
}

// cleanUrls note: internal page links intentionally omit .html
const sample = fs.readFileSync(path.join(root, "ai-music-generator.html"), "utf8");
ok(/href="\/hum-to-song"/.test(sample), "internal links use production clean URLs (no .html suffix)");

console.log("\nNote: plain `python -m http.server` does not support Vercel cleanUrls.");
console.log("Local click-through of /hum-to-song will 404 until deployed; use *.html URLs locally.\n");

if (failures) {
  console.error(`Audit failed: ${failures} issue${failures === 1 ? "" : "s"}`);
  process.exit(1);
}
console.log("Audit passed for all 11 SEO landing pages");
