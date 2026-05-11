/**
 * CORS helper for all browser-facing API handlers.
 * The iOS Capacitor shell ships JS from `capacitor://localhost` and hits
 * this Vercel deployment cross-origin. Without these headers (and a 204
 * for OPTIONS preflight), the WebView blocks the response and the app
 * silently fails to generate / poll / etc.
 *
 * Usage:
 *   const { applyCors } = require("../_lib/cors");
 *   if (applyCors(req, res)) return; // short-circuits OPTIONS preflight
 */

function applyCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, apikey, x-client-info"
  );
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

module.exports = { applyCors };
