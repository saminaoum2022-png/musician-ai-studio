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
 */
export const NABAD_VIBE_PUBLIC_SHIPPED = false;

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
 * When true: Oriental Studio Styles tab is live for users (AB vs Arabic).
 * Keep false until the AB is approved — staging bake uses nabadOrientalStylesUi.
 */
export const NABAD_ORIENTAL_STYLES_PUBLIC_SHIPPED = false;

/** When false: hide play counts on Discover cards, charts, and challenge heroes (sorting unchanged). */
export const DISCOVER_SHOW_PLAY_COUNTS = false;

/**
 * When true: Settings Appearance (Dark / Light / Auto) is shown.
 * Keep false until light theme is ready to ship — the code stays, the picker is hidden,
 * and the app always renders dark.
 */
export const LIGHT_THEME_PUBLIC_SHIPPED = false;
