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
 * When true: Live Listen (host-owned one-song session) is live for users.
 * Keep false until explicit launch — staging bake uses nabadLiveListenUi + admin.
 */
export const NABAD_LIVE_LISTEN_PUBLIC_SHIPPED = false;

/** When false: hide play counts on Discover cards, charts, and challenge heroes (sorting unchanged). */
export const DISCOVER_SHOW_PLAY_COUNTS = false;

/**
 * When true: Settings Appearance (Dark / Light / Auto) is shown.
 * Keep false until light theme is ready to ship — the code stays, the picker is hidden,
 * and the app always renders dark.
 */
export const LIGHT_THEME_PUBLIC_SHIPPED = false;
