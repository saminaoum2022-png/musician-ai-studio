module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  // Cache for 5 min on the Vercel edge + browser, with a 1h SWR window.
  // The payload (Supabase project URL + anon key + cert allowlist) only
  // changes on env redeploys, so serving a slightly stale copy saves a
  // full Vercel cold-start round-trip on every cellular app launch.
  res.setHeader(
    "Cache-Control",
    "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
  );
  const certRaw = String(process.env.NABAD_CERTIFIED_USER_IDS || "").trim();
  const nabadCertifiedUserIds = certRaw
    ? certRaw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)
    : [];

  res.end(
    JSON.stringify({
      supabaseUrl: process.env.SUPABASE_URL || "",
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
      // Optional UUID allowlist (env NABAD_CERTIFIED_USER_IDS) until
      // profiles.sound_certified is wired in Supabase.
      nabadCertifiedUserIds,
    })
  );
};

