#!/usr/bin/env node
/** Add CMS data attributes + marketing-page.js to SEO landing HTML files. */
import fs from "fs";
import path from "path";

const root = process.cwd();

const pages = [
  { file: "ai-music-generator.html", key: "ai-music-generator", locale: "en" },
  { file: "hum-to-song.html", key: "hum-to-song", locale: "en" },
  { file: "lyrics-to-song.html", key: "lyrics-to-song", locale: "en" },
  { file: "photo-to-song.html", key: "photo-to-song", locale: "en" },
  { file: "arabic-ai-music-generator.html", key: "arabic-ai-music-generator", locale: "en" },
  { file: "ar/ai-music-generator.html", key: "ai-music-generator", locale: "ar" },
  { file: "ar/hum-to-song.html", key: "hum-to-song", locale: "ar" },
  { file: "ar/lyrics-to-song.html", key: "lyrics-to-song", locale: "ar" },
  { file: "ar/photo-to-song.html", key: "photo-to-song", locale: "ar" },
  { file: "ar/arabic-ai-music-generator.html", key: "arabic-ai-music-generator", locale: "ar" },
];

function patchHtml(html, { key, locale }) {
  let out = html;
  if (!out.includes("data-marketing-page")) {
    out = out.replace(
      /<html lang="[^"]*">/,
      `<html lang="${locale}" data-marketing-page="${key}">`,
    );
  }
  if (!out.includes("data-mk=\"hero.title\"")) {
    out = out
      .replace(/<p class="eyebrow">/g, '<p class="eyebrow" data-mk="hero.eyebrow">')
      .replace(/(<div class="heroCopy">\s*)<h1>/g, '$1<h1 data-mk="hero.title">')
      .replace(/<p class="heroLead">/g, '<p class="heroLead" data-mk="hero.lead">')
      .replace(
        /<a class="marketingCta" href="\/app\/#\/intro">/g,
        '<a class="marketingCta" data-mk="hero.cta" href="/app/#/intro">',
      )
      .replace(
        /<a class="textLink" href="#features">/g,
        '<a class="textLink" data-mk="hero.secondary" href="#features">',
      )
      .replace(
        /<img src="\/assets\/marketing\/seo-hero-device.png"/g,
        '<img data-mk="hero.image" src="/assets/marketing/seo-hero-device.png"',
      )
      .replace(
        /<header class="sectionHead"><p class="eyebrow">/g,
        '<header class="sectionHead"><p class="eyebrow" data-mk="features.eyebrow">',
      )
      .replace(
        /<header class="sectionHead"><p class="eyebrow" data-mk="features.eyebrow">[^<]*<\/p><h2>/g,
        (m) => m.replace("<h2>", '<h2 data-mk="features.title">'),
      )
      .replace(/<article class="featureCard"><h3>/g, '<article class="featureCard" data-mk-feature-card><h3 data-mk="feature.title">')
      .replace(/<\/h3><p>/g, '</h3><p data-mk="feature.body">')
      .replace(
        /<header class="sectionHead"><h2>Frequently asked questions<\/h2><\/header>/g,
        '<header class="sectionHead"><h2 data-mk="faq.title">Frequently asked questions</h2></header>',
      )
      .replace(
        /<header class="sectionHead"><h2>أسئلة شائعة<\/h2><\/header>/g,
        '<header class="sectionHead"><h2 data-mk="faq.title">أسئلة شائعة</h2></header>',
      )
      .replace(/<article class="faqItem"><h3>/g, '<article class="faqItem" data-mk-faq-item><h3 data-mk="faq.q">')
      .replace(/(<article class="faqItem"[^>]*><h3[^>]*>[^<]*<\/h3>)<p>/g, '$1<p data-mk="faq.a">')
      .replace(
        /<header class="sectionHead"><h2>Explore more ways to create<\/h2><\/header>/g,
        '<header class="sectionHead"><h2 data-mk="related.title">Explore more ways to create</h2></header>',
      )
      .replace(
        /<header class="sectionHead"><h2>اكتشف أدوات أخرى<\/h2><\/header>/g,
        '<header class="sectionHead"><h2 data-mk="related.title">اكتشف أدوات أخرى</h2></header>',
      )
      .replace(
        /<nav class="relatedLinks" aria-label="[^"]*">/g,
        '<nav class="relatedLinks" data-mk-related-links aria-label="Explore more ways to create">',
      )
      .replace(/<section class="finalCta"><h2>/g, '<section class="finalCta"><h2 data-mk="final.title">')
      .replace(/(<section class="finalCta"><h2[^>]*>[^<]*<\/h2>)<p>/g, '$1<p data-mk="final.body">')
      .replace(
        /(<section class="finalCta"[\s\S]*?<p[^>]*>[^<]*<\/p>\s*)<a class="marketingCta" href="\/app\/#\/intro">/g,
        '$1<a class="marketingCta" data-mk="final.cta" href="/app/#/intro">',
      );
  }
  if (!out.includes("marketing-page.js")) {
    out = out.replace(
      /<\/body>\s*<\/html>\s*$/,
      '  <script src="/src/marketing-page.js" defer></script>\n</body>\n</html>\n',
    );
  }
  return out;
}

for (const page of pages) {
  const abs = path.join(root, page.file);
  if (!fs.existsSync(abs)) {
    console.warn(`marketing-add-cms-hooks: skip ${page.file}`);
    continue;
  }
  const html = fs.readFileSync(abs, "utf8");
  const next = patchHtml(html, page);
  if (next !== html) {
    fs.writeFileSync(abs, next);
    console.log(`marketing-add-cms-hooks: ${page.file}`);
  }
}
