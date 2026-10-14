/** When false: no Create/Watch music video UI or Suno visualizer jobs. */
export const MUSIC_VIDEO_FEATURE_ENABLED = false;

/**
 * When true: Nabad Producer is live for users (Create hub card, routes).
 * Keep false until explicit launch — dev phone testing uses baked nabadProducerUi instead.
 */
export const NABAD_PRODUCER_PUBLIC_SHIPPED = false;

/**
 * When true: Vibe Create tab is live for users.
 * Keep false until explicit launch — dev phone testing uses baked nabadVibeUi instead.
 * This is NOT Revibe (Discover/hub). Revibe has its own flag.
 */
export const NABAD_VIBE_PUBLIC_SHIPPED = false;

/**
 * When true: Discover / player / library show Revibe instead of Remix.
 * Revibe reads style + structure (inspiration only) and generates on Lyria.
 * Admin Vibe in Create + stays a separate, hidden feature.
 * Public — Discover / player / library. Do not confuse with admin Vibe.
 */
export const NABAD_REVIBE_PUBLIC_SHIPPED = true;

/**
 * When true: Edit Create tab (ElevenLabs section rewrite) is live for users.
 * Keep false until explicit Pro launch — staging bake uses nabadSongEditUi + admin.
 */
export const NABAD_SONG_EDIT_PUBLIC_SHIPPED = false;

/**
 * When true: Gold member perks (avatar rings, crown badge, caption/profile styling) are live for users.
 * Keep false until explicit launch — staging bake uses nabadGoldUi + admin.
 */
export const NABAD_GOLD_PUBLIC_SHIPPED = false;

/**
 * When true: Nabad Stickers (Pack 1 Studio Pulse in DMs) are live for users.
 * Keep false until explicit launch — staging bake uses nabadGoldUi + admin.
 */
export const NABAD_STICKERS_PUBLIC_SHIPPED = false;

/**
 * When true: Live Listen (host-owned one-song session) is live for users.
 * Launched publicly — keep true. Staging bake is no longer required to see it.
 */
export const NABAD_LIVE_LISTEN_PUBLIC_SHIPPED = true;

/**
 * When true: Oriental Studio Styles tab is live for users (replaces the old Arabic tab).
 * Launched with batch 1 — keep true. Staging bake is no longer required to see it.
 */
export const NABAD_ORIENTAL_STYLES_PUBLIC_SHIPPED = true;

/**
 * When true: blank Create (and templates) use Lyria 3.5 for everyone.
 * Remix / persona / mashup stay on Suno. Hum uses Conductor → Lyria when
 * NABAD_HUM_CONDUCTOR_PUBLIC_SHIPPED is true.
 * Batch 2 — keep true. Admin Settings → engine still overrides for admins.
 */
export const NABAD_LYRIA_CREATE_PUBLIC_SHIPPED = true;

/**
 * When true: a Hum in Create goes through Hum Conductor → Lyria for everyone.
 * Remix and persona stay on Suno. Admin Settings can still turn Conductor off.
 */
export const NABAD_HUM_CONDUCTOR_PUBLIC_SHIPPED = true;

/**
 * When true: Persona (voice clone) is live — Create pill, home card, Settings.
 * Keep false until explicit launch. Remix stays; Persona is parked.
 */
export const NABAD_PERSONA_PUBLIC_SHIPPED = false;

/**
 * When true: Hum Track (solo instrumental from a hum) is live in Create / Home.
 * Keep false for now — the old Create Hum tab (melody reference → song) stays.
 */
export const NABAD_HUM_TRACK_PUBLIC_SHIPPED = false;

/**
 * When true: Mashup (blend two tracks) is live — player sheet, #/mashup route.
 * Keep false until explicit launch. Remix stays; Mashup is parked.
 */
export const NABAD_MASHUP_PUBLIC_SHIPPED = false;

/** When false: hide play counts on Discover cards, charts, and challenge heroes (sorting unchanged). */
export const DISCOVER_SHOW_PLAY_COUNTS = false;

/**
 * When true: Settings Appearance (Dark / Light / Auto) is shown.
 * Keep false until light theme is ready to ship — the code stays, the picker is hidden,
 * and the app always renders dark.
 */
export const LIGHT_THEME_PUBLIC_SHIPPED = false;
