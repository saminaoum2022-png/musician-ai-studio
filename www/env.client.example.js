/**
 * Copy to env.client.js and fill from Vercel env vars + optional bypass token.
 * The Supabase anon key is safe to ship in the client (RLS protects data).
 *
 *   cp env.client.example.js env.client.js
 *   # edit env.client.js, then: npx cap sync ios
 *
 * Or generate from your machine:
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... VERCEL_PROTECTION_BYPASS=... node ../scripts/sync-client-env.mjs
 */
window.__NABAD_CLIENT_ENV__ = {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY",
  /** Must match the Vercel URL that serves /api/social (same as your live web app). */
  apiBase: "https://nabadai.com",
  /** From Vercel → Settings → Deployment Protection → Protection Bypass for Automation */
  vercelProtectionBypass: "",
};
