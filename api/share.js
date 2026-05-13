// Dynamic share landing page for Hub posts. Returns HTML with proper
// Open Graph + Twitter Card meta tags so chat apps (iMessage, WhatsApp,
// Discord, Slack), social platforms (X, Facebook), and link unfurlers
// fetch a real preview card with cover art, song title, and creator.
//
// Real users (browsers running JS) auto-redirect to the SPA hub with
// `?post=ID` so the actual playback experience is reached. Crawlers
// just read the meta tags and stop — that's the whole point.
//
// Routed via vercel.json rewrite from /s/:id (short URL).

const SITE_NAME = "Nabadai";
const DEFAULT_TITLE = "Listen on Nabadai";
const DEFAULT_DESCRIPTION = "Made on Nabadai. Take a listen.";
const DEFAULT_IMAGE = "/assets/nabadai-logo.png";

function escapeAttr(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function absoluteUrl(req, path) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  if (!host) return path;
  if (/^https?:\/\//i.test(path)) return path;
  const slash = path.startsWith("/") ? "" : "/";
  return `${proto}://${host}${slash}${path}`;
}

async function fetchPost(id) {
  const supaUrl = process.env.SUPABASE_URL || "";
  const supaKey = process.env.SUPABASE_ANON_KEY || "";
  if (!supaUrl || !supaKey || !id) return null;
  const cols = [
    "id",
    "title",
    "cover_url",
    "song_url",
    "creator_username",
    "creator_avatar",
    "kind",
    "remix_of",
  ].join(",");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4500);
  try {
    const r = await fetch(
      `${supaUrl}/rest/v1/hub_posts?select=${encodeURIComponent(cols)}&id=eq.${encodeURIComponent(id)}&limit=1`,
      {
        headers: { apikey: supaKey },
        signal: ctrl.signal,
      }
    );
    clearTimeout(timer);
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

function renderHtml({ title, description, image, url, redirectTo, creator, songUrl }) {
  const safeTitle = escapeAttr(title);
  const safeDesc = escapeAttr(description);
  const safeImg = escapeAttr(image);
  const safeUrl = escapeAttr(url);
  const safeRedirect = escapeAttr(redirectTo);
  const safeCreator = escapeHtml(creator || "");
  const safeSong = escapeAttr(songUrl || "");
  const audioTag = songUrl
    ? `<meta property="og:audio" content="${safeSong}" /><meta property="og:audio:type" content="audio/mpeg" />`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${safeTitle}</title>
<meta name="description" content="${safeDesc}" />

<meta property="og:type" content="music.song" />
<meta property="og:site_name" content="${SITE_NAME}" />
<meta property="og:title" content="${safeTitle}" />
<meta property="og:description" content="${safeDesc}" />
<meta property="og:image" content="${safeImg}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:url" content="${safeUrl}" />
${audioTag}

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${safeTitle}" />
<meta name="twitter:description" content="${safeDesc}" />
<meta name="twitter:image" content="${safeImg}" />

<link rel="canonical" href="${safeUrl}" />
<style>
  html,body{margin:0;padding:0;background:#12151e;color:#e9eefb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}
  .wrap{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;gap:18px;}
  .cover{width:min(90vw,420px);aspect-ratio:1/1;border-radius:18px;object-fit:cover;border:1px solid rgba(255,255,255,0.10);box-shadow:0 18px 60px -20px rgba(124,92,255,0.55);}
  .title{font-size:24px;font-weight:800;letter-spacing:-0.3px;background:linear-gradient(95deg,#f7f4ff 0%,#e0d6ff 50%,#d3f0ec 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;}
  .creator{font-size:14px;color:rgba(223,231,251,0.78);}
  .cta{display:inline-block;margin-top:6px;padding:14px 28px;border-radius:999px;border:1px solid rgba(124,92,255,0.55);background:linear-gradient(135deg,rgba(124,92,255,0.95),rgba(35,213,171,0.92));color:#fff;font-weight:800;font-size:15px;letter-spacing:0.2px;text-decoration:none;box-shadow:0 14px 36px -10px rgba(124,92,255,0.6);}
  .hint{font-size:12px;color:rgba(223,231,251,0.55);max-width:300px;line-height:1.4;}
</style>
<script>
  // Always redirect on the client. Bots don't execute JavaScript, so they
  // stop at the meta tags above (which is the whole point — that's how
  // they generate the preview card). Sniffing the UA to "skip the bot"
  // was actively harmful: WhatsApp/Telegram/etc in-app browsers can have
  // their app name in the UA string, and we'd refuse to redirect a real
  // user who tapped a link from chat.
  (function(){
    var url = ${JSON.stringify(redirectTo)};
    try { location.replace(url); }
    catch (e) {
      try { location.href = url; } catch (e2) {}
    }
    // Fallback: if for any reason `replace` doesn't navigate (very old
    // WebView quirks), force the navigation after a short tick.
    setTimeout(function(){
      try { if (location.pathname !== "/") location.href = url; } catch (e) {}
    }, 600);
  })();
</script>
</head>
<body>
  <div class="wrap">
    <img class="cover" src="${safeImg}" alt="${safeTitle}" />
    <div class="title">${escapeHtml(title)}</div>
    ${safeCreator ? `<div class="creator">by @${safeCreator}</div>` : ""}
    <a class="cta" href="${safeRedirect}">▶ Open in Nabadai</a>
    <div class="hint">If the player doesn't open automatically, tap the button above.</div>
  </div>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  // Accept id from /api/share?id=POST_ID, /api/share/POST_ID rewrites,
  // or path segment fallbacks.
  let id = "";
  try {
    if (req.query && typeof req.query.id === "string") id = req.query.id;
    else if (req.query && Array.isArray(req.query.id)) id = req.query.id[0];
  } catch {}
  if (!id) {
    try {
      const u = new URL(req.url, "http://x");
      id = u.searchParams.get("id") || "";
    } catch {}
  }
  id = String(id || "").trim();

  const post = id ? await fetchPost(id) : null;

  const title = post?.title
    ? `${post.title}${post.creator_username ? ` — by @${post.creator_username}` : ""} · ${SITE_NAME}`
    : DEFAULT_TITLE;
  const description = post?.creator_username
    ? `“${post.title || "this song"}” by @${post.creator_username} on Nabadai`
    : DEFAULT_DESCRIPTION;

  let image = post?.cover_url || post?.creator_avatar || DEFAULT_IMAGE;
  if (!/^https?:\/\//i.test(image)) image = absoluteUrl(req, image);

  const url = absoluteUrl(req, id ? `/s/${encodeURIComponent(id)}` : "/");
  const redirectTo = id
    ? `/#/generate`
    : `/#/generate`;

  const html = renderHtml({
    title,
    description,
    image,
    url,
    redirectTo,
    creator: post?.creator_username || "",
    songUrl: post?.song_url || "",
  });

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Short cache: lets bots see fresh meta if a post is edited, while still
  // taking the load off the function for repeated unfurls.
  res.setHeader(
    "Cache-Control",
    post ? "public, max-age=120, s-maxage=300, stale-while-revalidate=600" : "no-store"
  );
  res.end(html);
};
