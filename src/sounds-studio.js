/** Sounds studio — preset chips and prompt helpers. */

export const SOUND_INSPIRATION_PRESETS = {
  rain: "Gentle rain on a window pane, soft droplets, distant thunder, calm and seamless loop.",
  ocean: "Slow ocean waves on a quiet shore, deep low rumble, seabirds far away, meditative loop.",
  fire: "Crackling fireplace embers, warm pops and hiss, cozy indoor ambience, seamless loop.",
  nature: "Forest morning birdsong, light breeze through leaves, distant stream, peaceful ambience.",
  cinematic: "Epic cinematic rise, orchestral swell, tension building, trailer-ready impact.",
  scifi: "Futuristic UI hum, soft synth pulse, spaceship ambience, clean and minimal loop.",
  gameui: "Short satisfying UI chime, soft click confirmation, modern game menu feedback.",
  city: "Urban night ambience, distant traffic hum, faint sirens, rain-slick streets.",
  whoosh: "Fast cinematic whoosh transition, airy sweep, clean SFX for editing.",
  wind: "Strong gust through open landscape, whistling air, desolate and wide.",
};

function syncSoundPresetChips(page, promptEl) {
  if (!page || !promptEl) return;
  const val = String(promptEl.value || "").trim();
  page.querySelectorAll("[data-sound-preset]").forEach((chip) => {
    const key = chip.getAttribute("data-sound-preset");
    const preset = SOUND_INSPIRATION_PRESETS[key];
    chip.classList.toggle("is-active", Boolean(preset && val === preset));
  });
}

export function initSoundsStudioOnce({ promptEl, haptic, syncCreateTabMorph, clearCreateFlow, scheduleApplyRoute }) {
  const page = document.querySelector('[data-route="sounds"]');
  if (!page || page.dataset.boundSoundsStudio === "1") return;
  page.dataset.boundSoundsStudio = "1";

  page.querySelectorAll("[data-sound-preset]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const key = chip.getAttribute("data-sound-preset");
      const text = SOUND_INSPIRATION_PRESETS[key];
      if (!text || !promptEl) return;
      promptEl.value = text;
      promptEl.focus();
      try { haptic?.("light"); } catch {}
      syncSoundPresetChips(page, promptEl);
      try { syncCreateTabMorph?.(); } catch {}
    });
  });

  promptEl?.addEventListener("input", () => {
    syncSoundPresetChips(page, promptEl);
    try { syncCreateTabMorph?.(); } catch {}
  });

  page.querySelector(".soundsStudioBack")?.addEventListener("click", (ev) => {
    ev.preventDefault();
    try { clearCreateFlow?.(); } catch {}
    try { location.hash = "#/challenges"; } catch {}
    try { scheduleApplyRoute?.(); } catch {}
  });

  syncSoundPresetChips(page, promptEl);
}
