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
  res.setHeader("Cache-Control", "no-store");
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

