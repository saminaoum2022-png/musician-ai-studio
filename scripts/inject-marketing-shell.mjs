#!/usr/bin/env node
/**
 * Inject shared marketing nav + footer into static HTML pages.
 */
import fs from "fs";
import path from "path";

const root = path.join(import.meta.dirname, "..");
const partialsDir = path.join(root, "marketing", "partials");

function readPartial(name) {
  return fs.readFileSync(path.join(partialsDir, name), "utf8");
}

const footerEn = readPartial("footer-en.html");
const footerAr = readPartial("footer-ar.html");
const navEnHome = readPartial("nav-en-home.html");
const navEnSub = readPartial("nav-en-sub.html");
const navArHome = readPartial("nav-ar-home.html");
const navArSub = readPartial("nav-ar-sub.html");

const LANG_AR_SUB = `<a class="marketingLangSwitch" href="{{AR_HREF}}" lang="ar" hreflang="ar" aria-label="Switch to Arabic">العربية</a>`;
const LANG_EN_SUB = `<a class="marketingLangSwitch" href="{{EN_HREF}}" lang="en" hreflang="en" aria-label="Switch to English">English</a>`;

/** @type {{ file: string, nav: string, footer: string }[]} */
const pages = [
  { file: "home.html", nav: navEnHome, footer: footerEn },
  { file: "support.html", nav: navEnSub.replace("{{LANG_AR}}", LANG_AR_SUB.replace("{{AR_HREF}}", "/ar")), footer: footerEn },
  { file: "about.html", nav: navEnSub.replace("{{LANG_AR}}", LANG_AR_SUB.replace("{{AR_HREF}}", "/ar/about")), footer: footerEn },
  { file: "blog.html", nav: navEnSub.replace("{{LANG_AR}}", LANG_AR_SUB.replace("{{AR_HREF}}", "/ar/blog")), footer: footerEn },
  { file: "ai-music-generator.html", nav: navEnSub.replace("{{LANG_AR}}", LANG_AR_SUB.replace("{{AR_HREF}}", "/ar/ai-music-generator")), footer: footerEn },
  { file: "hum-to-song.html", nav: navEnSub.replace("{{LANG_AR}}", LANG_AR_SUB.replace("{{AR_HREF}}", "/ar/hum-to-song")), footer: footerEn },
  { file: "lyrics-to-song.html", nav: navEnSub.replace("{{LANG_AR}}", LANG_AR_SUB.replace("{{AR_HREF}}", "/ar/lyrics-to-song")), footer: footerEn },
  { file: "photo-to-song.html", nav: navEnSub.replace("{{LANG_AR}}", LANG_AR_SUB.replace("{{AR_HREF}}", "/ar/photo-to-song")), footer: footerEn },
  {
    file: "arabic-ai-music-generator.html",
    nav: navEnSub.replace("{{LANG_AR}}", LANG_AR_SUB.replace("{{AR_HREF}}", "/ar/arabic-ai-music-generator")),
    footer: footerEn,
  },
  { file: "ar/index.html", nav: navArHome, footer: footerAr },
  { file: "ar/about.html", nav: navArSub.replace("{{LANG_EN}}", LANG_EN_SUB.replace("{{EN_HREF}}", "/about")), footer: footerAr },
  { file: "ar/blog.html", nav: navArSub.replace("{{LANG_EN}}", LANG_EN_SUB.replace("{{EN_HREF}}", "/blog")), footer: footerAr },
  { file: "ar/ai-music-generator.html", nav: navArSub.replace("{{LANG_EN}}", LANG_EN_SUB.replace("{{EN_HREF}}", "/ai-music-generator")), footer: footerAr },
  { file: "ar/hum-to-song.html", nav: navArSub.replace("{{LANG_EN}}", LANG_EN_SUB.replace("{{EN_HREF}}", "/hum-to-song")), footer: footerAr },
  { file: "ar/lyrics-to-song.html", nav: navArSub.replace("{{LANG_EN}}", LANG_EN_SUB.replace("{{EN_HREF}}", "/lyrics-to-song")), footer: footerAr },
  { file: "ar/photo-to-song.html", nav: navArSub.replace("{{LANG_EN}}", LANG_EN_SUB.replace("{{EN_HREF}}", "/photo-to-song")), footer: footerAr },
  {
    file: "ar/arabic-ai-music-generator.html",
    nav: navArSub.replace("{{LANG_EN}}", LANG_EN_SUB.replace("{{EN_HREF}}", "/arabic-ai-music-generator")),
    footer: footerAr,
  },
];

const NAV_RE = /    <nav class="marketingNav"[\s\S]*?<\/nav>\s*\n/;
const FOOTER_RE = /    <footer class="marketingFooter[^"]*"[\s\S]*?<\/footer>\s*\n/;

for (const { file, nav, footer } of pages) {
  const abs = path.join(root, file);
  if (!fs.existsSync(abs)) {
    console.warn(`inject-marketing-shell: skip missing ${file}`);
    continue;
  }
  let html = fs.readFileSync(abs, "utf8");
  if (!NAV_RE.test(html) || !FOOTER_RE.test(html)) {
    console.warn(`inject-marketing-shell: nav/footer pattern not found in ${file}`);
    continue;
  }
  html = html.replace(NAV_RE, nav).replace(FOOTER_RE, footer);
  fs.writeFileSync(abs, html);
  console.log(`inject-marketing-shell: ${file}`);
}
