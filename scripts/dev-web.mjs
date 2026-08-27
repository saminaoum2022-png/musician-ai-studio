#!/usr/bin/env node
/**
 * Local web preview with Vercel-like rewrites + /api/* handlers.
 *
 * Usage:
 *   npm run dev:web
 *
 * Env (optional .env.local in repo root):
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *
 * Prefer `vercel login && vercel env pull .env.local` once, then `npm run dev:web`.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const require = createRequire(import.meta.url);
const PORT = Number(process.env.PORT || 3000);

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadDotEnv(path.join(root, ".env.local"));
loadDotEnv(path.join(root, ".env"));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".mp4": "video/mp4",
};

function rewritePath(pathname, search = "") {
  if (pathname === "/robots.txt") return { file: null, api: "/api/robots" };
  if (pathname === "/sitemap.xml") return { file: null, api: "/api/sitemap" };

  const blogMatch = pathname.match(/^\/blog\/([^/]+)$/);
  if (blogMatch) {
    const qs = new URLSearchParams(search.replace(/^\?/, ""));
    qs.set("slug", blogMatch[1]);
    return { file: `/blog-post?${qs.toString()}` };
  }
  const arBlogMatch = pathname.match(/^\/ar\/blog\/([^/]+)$/);
  if (arBlogMatch) {
    const qs = new URLSearchParams(search.replace(/^\?/, ""));
    qs.set("slug", arBlogMatch[1]);
    return { file: `/ar/blog-post?${qs.toString()}` };
  }

  if (pathname === "/admin" || pathname === "/admin/") {
    return { file: "/admin/index.html" };
  }
  if (pathname.startsWith("/admin/")) {
    return { file: pathname };
  }

  if (!path.extname(pathname)) {
    const clean = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
    const candidate = clean === "" ? "/index.html" : `${clean}.html`;
    const abs = path.join(root, candidate.replace(/^\//, ""));
    if (fs.existsSync(abs)) return { file: candidate };
  }

  return { file: pathname };
}

function resolveApiFile(pathname) {
  const rel = pathname.replace(/^\//, "");
  const direct = path.join(root, rel + ".js");
  if (fs.existsSync(direct)) return direct;
  const indexFile = path.join(root, rel, "index.js");
  if (fs.existsSync(indexFile)) return indexFile;
  return null;
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

async function invokeApi(req, res, pathname) {
  const apiFile = resolveApiFile(pathname.startsWith("/api") ? pathname : `/api${pathname}`);
  if (!apiFile) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "API route not found" }));
    return;
  }

  delete require.cache[require.resolve(apiFile)];
  const handler = require(apiFile);
  const fn = typeof handler === "function" ? handler : handler.default;
  if (typeof fn !== "function") {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Invalid API handler" }));
    return;
  }

  const body = await readBody(req);
  req.body = body;
  if (body.length && !req.headers["content-length"]) {
    req.headers["content-length"] = String(body.length);
  }

  try {
    await fn(req, res);
  } catch (err) {
    console.error("[api]", pathname, err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: err?.message || "Internal error" }));
    }
  }
}

function serveFile(res, filePath) {
  const abs = path.join(root, filePath.replace(/^\//, ""));
  if (!abs.startsWith(root) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found");
    return;
  }
  const ext = path.extname(abs).toLowerCase();
  res.statusCode = 200;
  res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
  fs.createReadStream(abs).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  const pathname = parsed.pathname;

  if (pathname.startsWith("/api/")) {
    await invokeApi(req, res, pathname);
    return;
  }

  const rewritten = rewritePath(pathname, parsed.search);
  if (rewritten.api) {
    req.url = rewritten.api + parsed.search;
    await invokeApi(req, res, rewritten.api);
    return;
  }

  serveFile(res, rewritten.file || pathname);
});

server.listen(PORT, "127.0.0.1", () => {
  const hasSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  console.log(`\n  NabadAi local preview → http://127.0.0.1:${PORT}`);
  console.log(`  Admin blog CMS      → http://127.0.0.1:${PORT}/admin`);
  console.log(`  Public blog         → http://127.0.0.1:${PORT}/blog`);
  if (!hasSupabase) {
    console.log("\n  ⚠ Missing Supabase env — API routes need .env.local");
    console.log("    Run: vercel login && vercel env pull .env.local\n");
  } else {
    console.log("\n  Supabase env loaded — API routes enabled.\n");
  }
});
