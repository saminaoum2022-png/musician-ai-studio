/**
 * GET /api/admin/music-engine-panel
 *
 * Admin-only. Returns the Settings "Music engine" panel markup so it is never
 * part of the public /app HTML (search engines and anonymous users never see it).
 * The client inserts it after a signed-in admin check (same rule as /api/credits/me).
 */

const { verifyUser, sendJson, setCors } = require("../_lib/credits-auth");
const { userIsAdmin, adminForbidden, adminUnauthorized } = require("../_lib/admin-auth");

const PANEL_HTML = `
<section id="settingsMusicProviderSection" class="settingsSection" aria-labelledby="settingsMusicProviderTitle">
  <h2 id="settingsMusicProviderTitle" class="settingsSectionLabel">Music engine</h2>
  <div class="settingsList">
    <div class="settingsRow settingsThemeRow">
      <span class="settingsRowIco" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
      </span>
      <span class="settingsRowBody">
        <span class="settingsRowTitle">Generation provider</span>
        <span class="settingsRowSub" id="settingsMusicProviderSub">Default engine — two variants per song</span>
      </span>
      <div id="settingsMusicProviderPicker" class="settingsThemePicker" role="radiogroup" aria-label="Music generation provider">
        <button type="button" class="settingsThemeOpt" data-music-provider="suno" role="radio" aria-checked="true">Default</button>
        <button type="button" class="settingsThemeOpt" data-music-provider="minimax" role="radio" aria-checked="false">MiniMax</button>
        <button type="button" class="settingsThemeOpt" data-music-provider="lyria" role="radio" aria-checked="false">Lyria</button>
        <button type="button" class="settingsThemeOpt" data-music-provider="lyria_clip" role="radio" aria-checked="false">Lyria clip</button>
        <button type="button" class="settingsThemeOpt" data-music-provider="elevenlabs" role="radio" aria-checked="false">Eleven</button>
        <button type="button" class="settingsThemeOpt" data-music-provider="mureka" role="radio" aria-checked="false">Mureka</button>
      </div>
    </div>
    <div id="settingsElevenFinetuneRow" class="settingsRow settingsThemeRow" hidden>
      <span class="settingsRowIco" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M8 7h8M7 12h10M8 17h8"/></svg>
      </span>
      <span class="settingsRowBody">
        <span class="settingsRowTitle">ElevenLabs voice model</span>
        <span class="settingsRowSub" id="settingsElevenFinetuneSub">NabadAi DNA finetune — custom voice</span>
      </span>
      <div id="settingsElevenFinetunePicker" class="settingsThemePicker" role="radiogroup" aria-label="ElevenLabs finetune">
        <button type="button" class="settingsThemeOpt is-active" data-eleven-finetune="1" role="radio" aria-checked="true">Finetune</button>
        <button type="button" class="settingsThemeOpt" data-eleven-finetune="0" role="radio" aria-checked="false">Base</button>
      </div>
    </div>
    <div id="settingsGeminiProducerRow" class="settingsRow settingsThemeRow">
      <span class="settingsRowIco" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="M5 19l.8 2.2L8 22l-2.2.8L5 25l-.8-2.2L2 22l2.2-.8L5 19z"/></svg>
      </span>
      <span class="settingsRowBody">
        <span class="settingsRowTitle">Gemini producer</span>
        <span class="settingsRowSub" id="settingsGeminiProducerSub">On — Gemini plans song sections and lyrics; your style line stays as written</span>
      </span>
      <div id="settingsGeminiProducerPicker" class="settingsThemePicker" role="radiogroup" aria-label="Gemini producer">
        <button type="button" class="settingsThemeOpt is-active" data-gemini-producer="1" role="radio" aria-checked="true">On</button>
        <button type="button" class="settingsThemeOpt" data-gemini-producer="0" role="radio" aria-checked="false">Off</button>
      </div>
    </div>
    <div id="settingsHumConductorRow" class="settingsRow settingsThemeRow" hidden>
      <span class="settingsRowIco" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
      </span>
      <span class="settingsRowBody">
        <span class="settingsRowTitle">Hum Conductor</span>
        <span class="settingsRowSub" id="settingsHumConductorSub">Off — Gemini does not read your Hum for Lyria</span>
      </span>
      <div id="settingsHumConductorPicker" class="settingsThemePicker" role="radiogroup" aria-label="Hum Conductor">
        <button type="button" class="settingsThemeOpt" data-hum-conductor="1" role="radio" aria-checked="false">On</button>
        <button type="button" class="settingsThemeOpt is-active" data-hum-conductor="0" role="radio" aria-checked="true">Off</button>
      </div>
    </div>
    <p class="settingsOrbModeIntro">Admin test only. Default engine gives Arabic + two variants. MiniMax is English-only. Lyria = full song (~3 min). Lyria clip = ~30s hook on the clip model (Lyria v2 prompt on staging). Gemini producer applies to Lyria full only when v1 is on. Hum Conductor (admin) sends a Hum to Lyria: Instrumental + custom style is Hum to Track; lyrics keep Producer v3 and place the motif.</p>
  </div>
</section>`;

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });
  res.setHeader("Cache-Control", "private, no-store");
  const user = await verifyUser(req);
  if (!user) return adminUnauthorized(res);
  if (!(await userIsAdmin(user))) return adminForbidden(res, "Admin only.");
  return sendJson(res, 200, { ok: true, html: PANEL_HTML.trim() });
};
