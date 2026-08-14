/**
 * Premium Nabad-style vinyl player for standard feed song posts.
 * Reuses existing playback attributes and seek sliders — no separate audio element.
 */

import { hasUserPhotoCoverMeta, metaFlagIsTrue } from "./cover-art/params.js";

const FEED_VINYL_REV_SEC = 10;
const FEED_VINYL_DEG_PER_SEC = 360 / FEED_VINYL_REV_SEC;
const FEED_VINYL_ROOTS = [
  "friendsPage",
  "profileActivitiesList",
  "profileRepostsList",
  "userPublicSongs",
  "userPublicRepostsList",
];

let _feedVinylIo = null;
const _feedVinylObserved = new WeakSet();
let _feedVinylSpinRaf = 0;
let _feedVinylGetCur = () => 0;
let _feedVinylGetAudible = () => false;

function trackModeBlocksVinylLayout(modeRaw) {
  const mode = String(modeRaw || "").trim().toLowerCase();
  if (!mode) return false;
  if (/\bphoto\b/.test(mode) || /\bvideo\b/.test(mode)) return true;
  if (/\bimage[- ]/.test(mode) || mode.startsWith("image")) return true;
  return mode.includes("photo mood") || mode.includes("photo_mood");
}

export function feedTrackEligibleForVinylPlayer(track, activityType) {
  if (String(activityType || "") !== "release") return false;
  if (typeof track !== "object" || !track) return false;
  const meta = track.meta && typeof track.meta === "object" ? track.meta : {};
  // Album art lives in imageUrl/imageThumb for every song — only real photo/custom covers block vinyl.
  if (hasUserPhotoCoverMeta(meta)) return false;
  if (metaFlagIsTrue(meta.imageOnlyInstrumental)) return false;
  if (trackModeBlocksVinylLayout(meta.mode)) return false;
  if (String(track.kind || "").trim().toLowerCase() === "music_video") return false;
  return true;
}

export function feedPostMediaLayoutForTrack(track) {
  const meta = track?.meta && typeof track.meta === "object" ? track.meta : {};
  const layout = String(meta.postMediaLayout || "").trim().toLowerCase();
  if (layout === "cover") return "cover";
  if (layout === "vinyl") return "vinyl";
  return "";
}

export function feedVinylPlayerUsesLightPrototype(track, activityType, { xstyle = false } = {}) {
  if (!xstyle) return false;
  const layout = feedPostMediaLayoutForTrack(track);
  if (layout === "cover") return false;
  if (layout === "vinyl") return feedTrackEligibleForVinylPlayer(track, activityType);
  // Legacy posts without postMediaLayout: keep cover layout. Vinyl is opt-in at publish only.
  return false;
}

/** @param {{ artSafe: string, encUrl: string, encTitle: string, encArt: string, encBy: string, playData: string, safeTitle: string, centerPlayIconsHtml: string, durLabel?: string, durSec?: number }} opts */
export function feedVinylPlayerBlockHtml(opts) {
  const {
    artSafe,
    encUrl,
    encTitle,
    encArt,
    encBy,
    playData,
    safeTitle,
    centerPlayIconsHtml,
    durLabel = "0:00",
    durSec = 0,
  } = opts;
  const playLabel = `Play ${safeTitle}`;
  return `
          <div class="feedVinylWrap followActMediaWrap" data-feed-vinyl="1" data-user-lib-url="${encUrl}">
            <div class="feedVinylStage">
              <div class="feedVinylShadow" aria-hidden="true"></div>
              <div class="feedVinylDeck">
                <div
                  class="feedVinylPlatter"
                  data-user-lib-url="${encUrl}"
                  data-user-lib-title="${encTitle}"
                  data-user-lib-art="${encArt}"
                  data-discovery-by="${encBy}"
                  ${playData}
                >
                  <div class="feedVinylRotor" aria-hidden="true">
                    <div class="feedVinylBase"></div>
                    <div class="feedVinylGrooveTex"></div>
                    <div class="feedVinylSheen"></div>
                    <div class="feedVinylSpinReflect"></div>
                    <div class="feedVinylLabel" style="background-image:url('${artSafe}')">
                      <span class="feedVinylLabelRing" aria-hidden="true"></span>
                    </div>
                  </div>
                  <div class="feedVinylBlackReflect" aria-hidden="true"></div>
                  <div class="feedVinylGloss" aria-hidden="true"></div>
                  <button
                    type="button"
                    class="feedVinylCenterBtn"
                    data-user-lib-play="1"
                    data-user-lib-url="${encUrl}"
                    data-user-lib-title="${encTitle}"
                    data-user-lib-art="${encArt}"
                    data-discovery-by="${encBy}"
                    ${playData}
                    aria-label="${playLabel}"
                  >
                    <span class="feedVinylCenterVis" aria-hidden="true">
                      <span class="feedVinylCenterIco">${centerPlayIconsHtml}</span>
                    </span>
                  </button>
                </div>
                <div class="feedVinylTonearm" aria-hidden="true">
                  <div class="feedVinylTonearmPivot">
                    <span class="feedVinylTonearmPivotCore"></span>
                    <span class="feedVinylTonearmPivotGlow"></span>
                  </div>
                  <div class="feedVinylTonearmBody">
                    <span class="feedVinylTonearmShaft"></span>
                    <span class="feedVinylTonearmHead">
                      <span class="feedVinylTonearmNeedle"></span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div class="feedVinylMeta">
              <h3 class="feedVinylTitle" dir="auto">${safeTitle}</h3>
            </div>
            <div class="followActRealtimeProgress feedVinylTimeline" data-user-lib-url="${encUrl}">
              <span class="feedVinylTimeCur" aria-hidden="true">0:00</span>
              <input class="followActRealtimeSeek feedVinylSeek" type="range" min="0" max="1000" value="0" step="1" aria-label="Seek ${safeTitle}" />
              <span class="feedVinylTimeDur" aria-hidden="true" data-fallback-dur="${Math.max(0, Number(durSec) || 0)}">${durLabel}</span>
            </div>
          </div>`;
}

function feedVinylReducedMotion() {
  try {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch {
    return false;
  }
}

function feedVinylRoots() {
  return FEED_VINYL_ROOTS.map((id) => document.getElementById(id)).filter(Boolean);
}

function feedVinylDegFromSec(sec) {
  const s = Math.max(0, Number(sec) || 0);
  return (s * FEED_VINYL_DEG_PER_SEC) % 360;
}

function applyFeedVinylRotorDeg(rotor, deg) {
  if (!rotor) return;
  rotor.style.transform = `rotate3d(0,0,1,${deg}deg)`;
}

function tickFeedVinylSpin() {
  _feedVinylSpinRaf = 0;
  if (feedVinylReducedMotion()) return;

  const cur = _feedVinylGetCur();
  const audible = _feedVinylGetAudible();
  const deg = feedVinylDegFromSec(cur);
  let keepSpinning = false;

  for (const root of feedVinylRoots()) {
    root.querySelectorAll(".feedVinylWrap[data-feed-vinyl].isPlaying").forEach((wrap) => {
      if (!wrap.classList.contains("isInView")) return;
      if (!audible) return;
      const rotor = wrap.querySelector(".feedVinylRotor");
      if (!rotor) return;
      applyFeedVinylRotorDeg(rotor, deg);
      keepSpinning = true;
    });
  }

  if (keepSpinning) {
    _feedVinylSpinRaf = requestAnimationFrame(tickFeedVinylSpin);
  }
}

function ensureFeedVinylSpinLoop() {
  if (_feedVinylSpinRaf || feedVinylReducedMotion()) return;
  _feedVinylSpinRaf = requestAnimationFrame(tickFeedVinylSpin);
}

function stopFeedVinylSpinLoopIfIdle() {
  if (_feedVinylSpinRaf) return;
  let anyPlaying = false;
  for (const root of feedVinylRoots()) {
    if (root.querySelector(".feedVinylWrap[data-feed-vinyl].isPlaying.isInView")) {
      anyPlaying = true;
      break;
    }
  }
  if (!anyPlaying) return;
  ensureFeedVinylSpinLoop();
}

function ensureFeedVinylIntersectionObserver() {
  if (_feedVinylIo || typeof IntersectionObserver === "undefined") return;
  _feedVinylIo = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        entry.target.classList.toggle("isInView", entry.isIntersecting);
      }
      stopFeedVinylSpinLoopIfIdle();
      ensureFeedVinylSpinLoop();
    },
    { root: null, rootMargin: "80px 0px", threshold: 0.08 },
  );
}

export function observeFeedVinylPlayerWrap(wrap) {
  if (!wrap || _feedVinylObserved.has(wrap)) return;
  ensureFeedVinylIntersectionObserver();
  _feedVinylObserved.add(wrap);
  wrap.classList.add("isInView");
  try {
    _feedVinylIo?.observe(wrap);
  } catch {}
}

export function initFeedVinylPlayerSystem() {
  ensureFeedVinylIntersectionObserver();
}

function applyFeedVinylRotation(rotor, { spinning, cur, reduced }) {
  if (!rotor) return;
  const deg = feedVinylDegFromSec(cur);
  rotor.classList.toggle("isSpinning", Boolean(spinning && !reduced));
  applyFeedVinylRotorDeg(rotor, deg);
}

/**
 * Sync vinyl rotation, tonearm state + timeline labels with the global audio element.
 */
export function syncFeedVinylPlayers(deps) {
  const {
    curRef,
    cur,
    dur,
    audible,
    getCur,
    getAudible,
    formatTime,
    decodeDiscoveryPlayUrl,
    audioUrlsEquivalent,
  } = deps;
  _feedVinylGetCur = typeof getCur === "function" ? getCur : () => cur;
  _feedVinylGetAudible = typeof getAudible === "function" ? getAudible : () => audible;

  const reduced = feedVinylReducedMotion();
  const roots = feedVinylRoots();
  if (!roots.length) return;

  let needsSpinLoop = false;

  for (const root of roots) {
    root.querySelectorAll(".feedVinylWrap[data-feed-vinyl]").forEach((wrap) => {
      observeFeedVinylPlayerWrap(wrap);
      const trackUrl = decodeDiscoveryPlayUrl(wrap);
      const active = Boolean(curRef && trackUrl && audioUrlsEquivalent(curRef, trackUrl));
      const inView = wrap.classList.contains("isInView");
      const liveCur = active ? _feedVinylGetCur() : 0;
      const liveAudible = active && _feedVinylGetAudible();
      const shouldSpin = active && liveAudible && inView && !reduced;

      wrap.classList.toggle("isActive", active);
      wrap.classList.toggle("isPlaying", active && liveAudible);

      const rotor = wrap.querySelector(".feedVinylRotor");
      if (!shouldSpin) {
        applyFeedVinylRotation(rotor, { spinning: false, cur: active ? liveCur : 0, reduced });
        try {
          rotor?.style?.removeProperty?.("will-change");
        } catch {}
      } else {
        needsSpinLoop = true;
        rotor?.classList?.add?.("isSpinning");
        applyFeedVinylRotorDeg(rotor, feedVinylDegFromSec(liveCur));
        try {
          rotor?.style?.setProperty?.("will-change", "transform");
        } catch {}
      }

      const timeCur = wrap.querySelector(".feedVinylTimeCur");
      const timeDur = wrap.querySelector(".feedVinylTimeDur");
      if (timeCur) timeCur.textContent = active ? formatTime(liveCur) : "0:00";
      if (timeDur) {
        const fallback = Number(timeDur.dataset.fallbackDur || "0") || 0;
        const total = active && dur > 0 ? dur : fallback;
        timeDur.textContent = formatTime(total > 0 ? total : 0);
      }
    });
  }

  if (needsSpinLoop) ensureFeedVinylSpinLoop();
}
