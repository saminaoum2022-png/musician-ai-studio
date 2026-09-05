#!/usr/bin/env node
/**
 * NabadAi press kit — built from the official splash mark (assets/icons/splash-mark.png).
 *
 *   npm run build:press-kit
 */
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MARK_SOURCE = path.join(ROOT, "assets/icons/splash-mark.png");
const OUT = path.join(ROOT, "assets/press");
const SVG_DIR = path.join(OUT, "svg");
const PNG_DIR = path.join(OUT, "png");
const SOURCE_DIR = path.join(OUT, "source");

const BRAND = {
  text: "#F7FAFF",
  bg: "#05070D",
};

async function markBase64(size = 900) {
  const buf = await sharp(MARK_SOURCE)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return buf.toString("base64");
}

function lockupSvg({ markB64, markSize = 112, text = "abadAi", textFill = BRAND.text, bg = "none" }) {
  const bgRect =
    bg === "none"
      ? ""
      : `<rect width="100%" height="100%" fill="${BRAND.bg}"/>`;
  const textY = 92;
  const textX = markSize + 10;
  const viewW = text === "NabadAi" ? 480 : 520;
  const markBlock =
    text === "NabadAi"
      ? ""
      : `<image x="0" y="8" width="${markSize}" height="${markSize}" href="data:image/png;base64,${markB64}"/>`;
  const textXFull = text === "NabadAi" ? 0 : textX;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewW} 128" width="${viewW}" height="128" role="img" aria-label="NabadAi">
  ${bgRect}
  ${markBlock}
  <text x="${textXFull}" y="${textY}"
    font-family="Inter Display, Inter, system-ui, -apple-system, Helvetica, Arial, sans-serif"
    font-weight="900"
    font-size="78"
    letter-spacing="-4.1"
    fill="${textFill}">${text}</text>
</svg>`;
}

function markOnlySvg(markB64) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900" width="900" height="900" role="img" aria-label="NabadAi mark">
  <image width="900" height="900" href="data:image/png;base64,${markB64}"/>
</svg>`;
}

async function svgToPng(svg, outPath, width) {
  await sharp(Buffer.from(svg))
    .resize(width)
    .png({ compressionLevel: 9, force: true })
    .toFile(outPath);
}

async function exportMarkPngs() {
  const sizes = [
    { name: "nabadai-mark-2048.png", size: 2048 },
    { name: "nabadai-mark-1024.png", size: 1024 },
    { name: "nabadai-mark-512.png", size: 512 },
    { name: "nabadai-mark-256.png", size: 256 },
  ];
  for (const { name, size } of sizes) {
    await sharp(MARK_SOURCE)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9, force: true })
      .toFile(path.join(PNG_DIR, name));
    console.log("wrote assets/press/png/" + name);
  }
}

function pressKitHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>NabadAi Press Kit</title>
  <style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body { font-family: Inter, system-ui, sans-serif; color: #0f1724; line-height: 1.45; font-size: 10.5pt; margin: 0; padding: 24px; }
    h1 { font-size: 22pt; margin: 0 0 8px; }
    h2 { font-size: 11pt; font-weight: 700; margin: 18px 0 8px; color: #334155; text-transform: uppercase; letter-spacing: 0.06em; }
    p, li { margin: 0 0 8px; }
    ul { margin: 0 0 8px 18px; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #05070d; padding-bottom: 14px; margin-bottom: 16px; }
    .header img { height: 52px; }
    .quote { margin: 14px 0; padding: 12px 14px; border-left: 4px solid #23d5ab; background: #f0fdf9; font-style: italic; }
    .footer { margin-top: 18px; font-size: 9pt; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 10px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>NabadAi Press Kit</h1>
      <p>AI music studio — from a hum to a finished song · Dubai, UAE</p>
    </div>
    <img src="png/nabadai-lockup-marketing-1200.png" alt="NabadAi">
  </div>
  <h2>One-liner</h2>
  <p><strong>NabadAi is an AI music studio that turns hums, lyrics, and moods into full songs — built for talented creators, not just professionals.</strong></p>
  <h2>Short (50 words)</h2>
  <p>NabadAi helps anyone with a musical idea hear it as a finished song with arrangement and vocals. Web and iOS, with strong Arabic music support. Free credits to try; no DAW required.</p>
  <h2>Founder</h2>
  <p><strong>Sami Naoum</strong> — Founder &amp; CEO. From Lebanon, based in Dubai. Artist name: <strong>Samy Naoum</strong> (music &amp; social).</p>
  <div class="quote">“Your thought doesn't have to stay a dream only — that's what NabadAi is for.”</div>
  <h2>Links</h2>
  <ul>
    <li>https://www.nabadai.com</li>
    <li>https://www.nabadai.com/app/</li>
    <li>help@nabadai.com</li>
  </ul>
  <h2>Logo files in this kit</h2>
  <ul>
    <li><strong>nabadai-mark</strong> — the N logo mark only (transparent PNG + SVG)</li>
    <li><strong>nabadai-lockup-marketing</strong> — N mark + white “abadAi” (site nav style)</li>
    <li><strong>nabadai-wordmark</strong> — “NabadAi” text only</li>
  </ul>
  <div class="footer">© 2026 NabadAi · ${new Date().toISOString().slice(0, 10)}</div>
</body>
</html>`;
}

async function writePdf(htmlPath) {
  const pdfPath = path.join(OUT, "nabadai-press-kit.pdf");
  const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  try {
    await fs.access(chrome);
    await execFileAsync(chrome, [
      "--headless=new",
      "--disable-gpu",
      "--no-pdf-header-footer",
      `--print-to-pdf=${pdfPath}`,
      `file://${htmlPath}`,
    ]);
    console.log("wrote assets/press/nabadai-press-kit.pdf");
  } catch {
    console.warn("PDF: open assets/press/press-kit.html → Print → Save as PDF");
  }
}

async function main() {
  await fs.mkdir(SVG_DIR, { recursive: true });
  await fs.mkdir(PNG_DIR, { recursive: true });
  await fs.mkdir(SOURCE_DIR, { recursive: true });

  await fs.copyFile(MARK_SOURCE, path.join(SOURCE_DIR, "nabadai-mark.png"));
  console.log("wrote assets/press/source/nabadai-mark.png (official mark)");

  const b64 = await markBase64(900);

  const svgs = {
    "nabadai-mark.svg": markOnlySvg(b64),
    "nabadai-lockup-marketing.svg": lockupSvg({ markB64: b64, text: "abadAi", textFill: BRAND.text }),
    "nabadai-lockup-marketing-on-dark.svg": lockupSvg({
      markB64: b64,
      text: "abadAi",
      textFill: BRAND.text,
      bg: BRAND.bg,
    }),
    "nabadai-wordmark.svg": lockupSvg({ markB64: b64, text: "NabadAi", textFill: BRAND.text }),
    "nabadai-wordmark-on-dark.svg": lockupSvg({
      markB64: b64,
      text: "NabadAi",
      textFill: BRAND.text,
      bg: BRAND.bg,
    }),
  };

  for (const [name, svg] of Object.entries(svgs)) {
    await fs.writeFile(path.join(SVG_DIR, name), svg, "utf8");
    console.log("wrote assets/press/svg/" + name);
  }

  await exportMarkPngs();

  await svgToPng(
    svgs["nabadai-lockup-marketing.svg"],
    path.join(PNG_DIR, "nabadai-lockup-marketing-1200.png"),
    1200,
  );
  console.log("wrote assets/press/png/nabadai-lockup-marketing-1200.png");

  await svgToPng(
    svgs["nabadai-lockup-marketing.svg"],
    path.join(PNG_DIR, "nabadai-lockup-marketing-2400.png"),
    2400,
  );
  console.log("wrote assets/press/png/nabadai-lockup-marketing-2400.png");

  await svgToPng(
    svgs["nabadai-lockup-marketing-on-dark.svg"],
    path.join(PNG_DIR, "nabadai-lockup-marketing-on-dark-1200.png"),
    1200,
  );
  console.log("wrote assets/press/png/nabadai-lockup-marketing-on-dark-1200.png");

  await svgToPng(svgs["nabadai-wordmark.svg"], path.join(PNG_DIR, "nabadai-wordmark-1200.png"), 1200);
  console.log("wrote assets/press/png/nabadai-wordmark-1200.png");

  const htmlPath = path.join(OUT, "press-kit.html");
  await fs.writeFile(htmlPath, pressKitHtml(), "utf8");
  console.log("wrote assets/press/press-kit.html");

  await fs.writeFile(
    path.join(OUT, "README.md"),
    `# NabadAi press kit

Built from the **official app logo**: \`assets/icons/splash-mark.png\`

## What to use

| File | What it is |
|------|------------|
| \`source/nabadai-mark.png\` | **N mark only** — master file (transparent) |
| \`png/nabadai-mark-*.png\` | N mark at 256 / 512 / 1024 / 2048 px |
| \`svg/nabadai-mark.svg\` | N mark (SVG wrapper; scales cleanly) |
| \`svg/nabadai-lockup-marketing.svg\` | **Site nav logo**: N + white **abadAi** on transparent |
| \`png/nabadai-lockup-marketing-1200.png\` | Same lockup, ready for decks / press |
| \`svg/nabadai-wordmark.svg\` | **NabadAi** text only (when you need the full name spelled out) |

Use **lockup-marketing** on dark backgrounds (website, app, social headers).
Use **mark only** for app icons, avatars, favicons.

## Regenerate
\`\`\`bash
npm run build:press-kit
\`\`\`
`,
    "utf8",
  );
  console.log("wrote assets/press/README.md");

  await writePdf(htmlPath);

  // Remove broken files from the previous bad export
  for (const stale of [
    "nabadai-lockup-gradient.svg",
    "nabadai-lockup-gradient-1200.png",
    "nabadai-wordmark-full.svg",
    "nabadai-wordmark-full-on-dark.svg",
    "nabadai-wordmark-full-1200.png",
  ]) {
    for (const dir of [SVG_DIR, PNG_DIR]) {
      try {
        await fs.unlink(path.join(dir, stale));
      } catch {
        /* gone */
      }
    }
  }

  console.log("\nDone — open assets/press/png/ and check nabadai-mark-1024.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
