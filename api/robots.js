const PRODUCTION_HOSTS = new Set(["www.nabadai.com", "nabadai.com"]);

function requestHost(req) {
  return String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
}

module.exports = function handler(req, res) {
  const isProduction = PRODUCTION_HOSTS.has(requestHost(req));
  const body = isProduction
    ? [
        "User-agent: *",
        "Allow: /",
        "Disallow: /admin",
        "Disallow: /api/",
        "",
        "Sitemap: https://www.nabadai.com/sitemap.xml",
        "",
      ].join("\n")
    : ["User-agent: *", "Disallow: /", ""].join("\n");

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    isProduction
      ? "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
      : "no-store",
  );
  res.end(body);
};
