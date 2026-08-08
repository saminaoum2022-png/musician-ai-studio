// Dynamic share landing page for library tracks (`user_songs`).
// Returns HTML with Open Graph + Twitter Card meta so WhatsApp/iMessage/etc.
// unfurl cover art, title, and creator — not a raw .mp3 URL.
//
// Routed via vercel.json rewrite: /s/:id → /api/share?id=:id

const SITE_NAME = "NabadAi";
const SITE_ORIGIN = "https://www.nabadai.com";
const DEFAULT_IMAGE = `${SITE_ORIGIN}/assets/marketing/nabadai-social-card.png`;

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

function supaHeaders() {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";
  return key ? { apikey: key, Authorization: `Bearer ${key}` } : null;
}

async function supaGet(path, { signal } = {}) {
  const supaUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const headers = supaHeaders();
  if (!supaUrl || !headers) return null;
  try {
    const r = await fetch(`${supaUrl}/rest/v1/${path}`, { headers, signal });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch {
    return null;
  }
}

async function fetchLibraryTrack(id, signal) {
  const cols = [
    "id",
    "title",
    "art_url",
    "song_url",
    "user_id",
    "published_at",
    "public_on_profile",
  ].join(",");
  const row = await supaGet(
    `user_songs?select=${encodeURIComponent(cols)}&id=eq.${encodeURIComponent(id)}&public_on_profile=eq.true&limit=1`,
    { signal },
  );
  if (!row) return null;
  let creator_username = "";
  let creator_avatar = "";
  const uid = String(row.user_id || "").trim();
  if (uid) {
    const prof = await supaGet(
      `profiles?select=username,avatar&user_id=eq.${encodeURIComponent(uid)}&limit=1`,
      { signal },
    );
    creator_username = String(prof?.username || "").trim();
    creator_avatar = String(prof?.avatar || "").trim();
  }
  return {
    kind: "track",
    title: row.title || "",
    cover_url: row.art_url || "",
    song_url: row.song_url || "",
    creator_username,
    creator_avatar,
    published_at: row.published_at || "",
  };
}

async function fetchShareRecord(id) {
  if (!id) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4500);
  try {
    return await fetchLibraryTrack(id, ctrl.signal);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function shareRedirectFor(record, id) {
  if (!id) return "/#/generate";
  return `/#/player?track=${encodeURIComponent(id)}`;
}

function renderHtml({ title, description, image, url, redirectTo, creator, songUrl, publishedAt }) {
  const safeTitle = escapeAttr(title);
  const safeDesc = escapeAttr(description);
  const safeImg = escapeAttr(image);
  const safeUrl = escapeAttr(url);
  const safeRedirect = escapeAttr(redirectTo);
  const safeCreator = escapeHtml(creator || "");
  const safeSong = escapeAttr(songUrl || "");
  const recordingSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "MusicRecording",
    name: title,
    url,
    image,
    byArtist: creator
      ? { "@type": "Person", name: `@${creator}` }
      : { "@type": "Organization", name: SITE_NAME },
    datePublished: publishedAt || undefined,
    audio: songUrl || undefined,
  }).replace(/</g, "\\u003c");
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
<meta name="robots" content="index, follow, max-image-preview:large" />

<meta property="og:type" content="music.song" />
<meta property="og:site_name" content="${SITE_NAME}" />
<meta property="og:title" content="${safeTitle}" />
<meta property="og:description" content="${safeDesc}" />
<meta property="og:image" content="${safeImg}" />
<meta property="og:image:alt" content="Cover art for ${safeTitle}" />
<meta property="og:url" content="${safeUrl}" />
${audioTag}

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${safeTitle}" />
<meta name="twitter:description" content="${safeDesc}" />
<meta name="twitter:image" content="${safeImg}" />
<meta name="twitter:image:alt" content="Cover art for ${safeTitle}" />

<link rel="canonical" href="${safeUrl}" />
<script type="application/ld+json">${recordingSchema}</script>
<style>
  html,body{margin:0;padding:0;background:#12151e;color:#e9eefb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}
  .wrap{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;gap:18px;}
  .cover{width:min(90vw,420px);aspect-ratio:1/1;border-radius:18px;object-fit:cover;border:1px solid rgba(255,255,255,0.10);box-shadow:0 18px 60px -20px rgba(124,92,255,0.55);}
  .title{font-size:24px;font-weight:800;letter-spacing:-0.3px;background:linear-gradient(95deg,#f7f4ff 0%,#e0d6ff 50%,#d3f0ec 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;}
  .creator{font-size:14px;color:rgba(223,231,251,0.78);}
  .cta{display:inline-block;margin-top:6px;padding:14px 28px;border-radius:999px;border:1px solid rgba(124,92,255,0.55);background:linear-gradient(135deg,rgba(124,92,255,0.95),rgba(35,213,171,0.92));color:#fff;font-weight:800;font-size:15px;letter-spacing:0.2px;text-decoration:none;box-shadow:0 14px 36px -10px rgba(124,92,255,0.6);}
  .hint{font-size:12px;color:rgba(223,231,251,0.55);max-width:300px;line-height:1.4;}
</style>
</head>
<body>
  <div class="wrap">
    <img class="cover" src="${safeImg}" alt="${safeTitle}" />
    <div class="title">${escapeHtml(title)}</div>
    ${safeCreator ? `<div class="creator">by @${safeCreator}</div>` : ""}
    <a class="cta" href="${safeRedirect}">▶ Open in NabadAi</a>
    <div class="hint">Listen, create, and share music with NabadAi.</div>
  </div>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
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

  const record = id ? await fetchShareRecord(id) : null;

  if (!id || !record) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.end(`<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Song not found — NabadAi</title><meta name="robots" content="noindex,nofollow"></head><body><main><h1>Song not found</h1><p>This song is unavailable or no longer public.</p><a href="${SITE_ORIGIN}/">Open NabadAi</a></main></body></html>`);
    return;
  }

  const plainTitle = String(record.title || "").trim() || "Untitled song";
  const title = `${plainTitle}${record.creator_username ? ` — by @${record.creator_username}` : ""} · ${SITE_NAME}`;
  const description = record.creator_username
    ? `“${plainTitle}” by @${record.creator_username} on NabadAi`
    : `Listen to “${plainTitle}” on NabadAi`;

  let image = record.cover_url || record.creator_avatar || DEFAULT_IMAGE;
  if (!/^https?:\/\//i.test(image)) {
    image = `${SITE_ORIGIN}${image.startsWith("/") ? "" : "/"}${image}`;
  }

  const url = `${SITE_ORIGIN}/s/${encodeURIComponent(id)}`;
  const redirectTo = shareRedirectFor(record, id);

  const html = renderHtml({
    title,
    description,
    image,
    url,
    redirectTo,
    creator: record?.creator_username || "",
    songUrl: record?.song_url || "",
    publishedAt: record?.published_at || "",
  });

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    record ? "public, max-age=120, s-maxage=300, stale-while-revalidate=600" : "no-store",
  );
  res.end(html);
};
