#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = String(process.argv[2] || "https://www.nabadai.com").replace(/\/$/, "");
const localOnly = process.argv.includes("--local");
const pages = [
  "/",
  "/ai-music-generator",
  "/hum-to-song",
  "/lyrics-to-song",
  "/photo-to-song",
  "/arabic-ai-music-generator",
  "/ar",
  "/ar/ai-music-generator",
  "/ar/hum-to-song",
  "/ar/lyrics-to-song",
  "/ar/photo-to-song",
  "/ar/arabic-ai-music-generator",
  "/privacy",
  "/terms",
  "/support",
];

let failures = 0;
function check(condition, message) {
  if (condition) console.log(`✓ ${message}`);
  else {
    failures += 1;
    console.error(`✗ ${message}`);
  }
}

function checkLocalHtml(relativePath, label) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    check(false, `${label} exists (${relativePath})`);
    return;
  }
  const html = fs.readFileSync(filePath, "utf8");
  check(true, `${label} exists (${relativePath})`);
  check(/<title>[^<]{8,}<\/title>/i.test(html), `${label} has a useful title`);
  check(
    /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{40,}/i.test(html),
    `${label} has a meta description`,
  );
  check(/rel=["']canonical["']/i.test(html), `${label} has a canonical`);
}

if (localOnly) {
  for (const route of pages.filter((r) => r !== "/")) {
    const relative =
      route === "/ar"
        ? "ar/index.html"
        : route.startsWith("/ar/")
          ? `ar/${route.slice(4)}.html`
          : `${route.slice(1)}.html`;
    checkLocalHtml(relative, route);
  }
  checkLocalHtml("index.html", "/");
  check(fs.existsSync(path.join(root, "api/robots.js")), "api/robots.js exists");
  check(fs.existsSync(path.join(root, "api/sitemap.js")), "api/sitemap.js exists");
  check(
    fs.existsSync(path.join(root, ".well-known/apple-app-site-association")),
    "apple-app-site-association exists",
  );
  if (failures) {
    console.error(`Local SEO check failed: ${failures} issue${failures === 1 ? "" : "s"}`);
    process.exit(1);
  }
  console.log("Local SEO check passed");
  process.exit(0);
}

for (const route of pages) {
  const response = await fetch(`${base}${route}`, {
    headers: { "user-agent": "NabadAi SEO release check" },
  });
  const html = await response.text();
  check(response.ok, `${route} returns ${response.status}`);
  check(/<title>[^<]{8,}<\/title>/i.test(html), `${route} has a useful title`);
  check(
    /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{40,}/i.test(html),
    `${route} has a meta description`,
  );
  check(/rel=["']canonical["']/i.test(html), `${route} has a canonical`);
}

const robotsResponse = await fetch(`${base}/robots.txt`);
const robots = await robotsResponse.text();
check(robotsResponse.ok, "robots.txt is reachable");
check(/Sitemap:\s*https:\/\/www\.nabadai\.com\/sitemap\.xml/i.test(robots), "robots advertises canonical sitemap");
check(!/Disallow:\s*\/\s*$/m.test(robots), "production crawling is allowed");

const sitemapResponse = await fetch(`${base}/sitemap.xml`);
const sitemap = await sitemapResponse.text();
check(sitemapResponse.ok, "sitemap.xml is reachable");
check(/<urlset\b/.test(sitemap), "sitemap contains a URL set");
for (const route of pages) {
  check(
    sitemap.includes(`<loc>https://www.nabadai.com${route}</loc>`),
    `sitemap includes ${route}`,
  );
}

if (failures) {
  console.error(`SEO check failed: ${failures} issue${failures === 1 ? "" : "s"}`);
  process.exit(1);
}
console.log("SEO check passed");
