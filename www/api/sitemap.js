const SITE_ORIGIN = "https://www.nabadai.com";
const PRODUCTION_HOSTS = new Set(["www.nabadai.com", "nabadai.com"]);
/** Bump when /terms or /privacy content changes — helps search engines recrawl. */
const LEGAL_LASTMOD = "2026-08-12";
const STATIC_PATHS = [
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
  { path: "/privacy", lastmod: LEGAL_LASTMOD },
  { path: "/terms", lastmod: LEGAL_LASTMOD },
  "/support",
];

function requestHost(req) {
  return String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toIsoDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

async function fetchPublishedSongs() {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";
  if (!supabaseUrl || !key) return [];

  const query =
    "user_songs?select=id,published_at&public_on_profile=eq.true" +
    "&order=published_at.desc.nullslast&limit=1000";
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return [];
    const rows = await response.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

module.exports = async function handler(req, res) {
  if (!PRODUCTION_HOSTS.has(requestHost(req))) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end("Not found");
    return;
  }

  const songs = await fetchPublishedSongs();
  const urls = STATIC_PATHS.map((entry) => {
    if (typeof entry === "string") return { loc: `${SITE_ORIGIN}${entry}` };
    return {
      loc: `${SITE_ORIGIN}${entry.path}`,
      lastmod: entry.lastmod || "",
    };
  });
  for (const song of songs) {
    const id = String(song?.id || "").trim();
    if (!id) continue;
    urls.push({
      loc: `${SITE_ORIGIN}/s/${encodeURIComponent(id)}`,
      lastmod: song?.published_at || "",
    });
  }

  const entries = urls
    .map(({ loc, lastmod }) => {
      const isoDate = toIsoDate(lastmod);
      const modified = isoDate
        ? `\n    <lastmod>${escapeXml(isoDate)}</lastmod>`
        : "";
      return `  <url>\n    <loc>${escapeXml(loc)}</loc>${modified}\n  </url>`;
    })
    .join("\n");
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `${entries}\n` +
    "</urlset>\n";

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
  );
  res.end(body);
};
