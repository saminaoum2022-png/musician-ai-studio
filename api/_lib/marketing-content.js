/**
 * Marketing CMS — default homepage content, validation, and merge helpers.
 */

const { SEO_PAGE_KEYS, defaultSeoContent } = require("./marketing-seo-defaults");

const LOCALES = Object.freeze(["en", "ar"]);
const PAGE_CATALOG = Object.freeze([
  { key: "home", label: "Homepage", preview: { en: "/", ar: "/ar" } },
  { key: "ai-music-generator", label: "AI Music Generator", preview: { en: "/ai-music-generator", ar: "/ar/ai-music-generator" } },
  { key: "hum-to-song", label: "Hum to Song", preview: { en: "/hum-to-song", ar: "/ar/hum-to-song" } },
  { key: "lyrics-to-song", label: "Lyrics to Song", preview: { en: "/lyrics-to-song", ar: "/ar/lyrics-to-song" } },
  { key: "photo-to-song", label: "Photo to Song", preview: { en: "/photo-to-song", ar: "/ar/photo-to-song" } },
  { key: "arabic-ai-music-generator", label: "Arabic AI Music", preview: { en: "/arabic-ai-music-generator", ar: "/ar/arabic-ai-music-generator" } },
]);
const PAGE_KEYS = Object.freeze(["home", ...SEO_PAGE_KEYS]);

function isSeoPage(pageKey) {
  return SEO_PAGE_KEYS.includes(String(pageKey || "").trim().toLowerCase());
}

function defaultHomeContentEn() {
  return {
    seo: {
      title: "NabadAi Music — AI songs from your voice, lyrics, or a hum",
      description:
        "Create full AI songs from lyrics, a hum, or a photo. Save your voice as a Persona, share on Discover, and export proof of creation. Free to start on web and iOS.",
    },
    hero: {
      eyebrow: "AI music studio",
      title: "Music from a hum. Share what you make.",
      lead:
        "Turn lyrics, a melody you hum, or a photo mood into a full song. Save your voice as a Persona, publish to Discover, and connect with other creators.",
      ctaLabel: "Try free",
      ctaHref: "/app/#/intro",
      secondaryLabel: "See how it works",
      secondaryHref: "#features",
      storeNote: "Also on iPhone · Android coming soon",
      heroImageUrl: "/assets/marketing/seo-hero-device.png",
      heroImageAlt: "NabadAi app — create songs from lyrics, hums, and photos",
    },
    features: {
      eyebrow: "Create your way",
      title: "From idea to finished song",
      cards: [
        {
          title: "Photo, hum, or lyrics",
          body: "Start with a picture mood, record a melody guide, or write lyrics — then shape genre, voice, and style.",
          imageUrl: "",
          imageAlt: "Create with photo, hum, or lyrics",
          links: [
            { label: "Hum to song", href: "/hum-to-song" },
            { label: "Lyrics to song", href: "/lyrics-to-song" },
            { label: "Photo to song", href: "/photo-to-song" },
          ],
        },
        {
          title: "Your voice, every song",
          body: "Record a Persona once and reuse your vocal identity across new tracks and remixes.",
          imageUrl: "",
          imageAlt: "NabadAi Persona — your voice on every track",
        },
        {
          title: "Create & connect",
          body: "Keep drafts private, publish to your profile, climb Discover charts, and share with friends.",
          imageUrl: "",
          imageAlt: "NabadAi Discover — hear and share what creators make",
        },
      ],
    },
    discover: {
      eyebrow: "Discover",
      title: "Hear what creators are making",
      lead: "Charts, remixes, and community picks — updated inside the app.",
      ctaLabel: "Explore Discover",
      ctaHref: "/app/#/discover",
      featuredSongIds: [],
    },
    pricing: {
      eyebrow: "Pricing",
      title: "Free to start. Pro when you're ready.",
      free: {
        title: "Free",
        price: "$0",
        body: "Start with free credits. Create songs, save drafts, and explore the community.",
        ctaLabel: "Get started",
        ctaHref: "/app/#/intro",
        imageUrl: "",
        imageAlt: "Generate songs with NabadAi free credits",
      },
      pro: {
        title: "NabadAi Pro",
        price: "Weekly or monthly",
        body: "More credits, Persona voice, priority features, and the full creator toolkit on iOS and web.",
        ctaLabel: "Try free first",
        ctaHref: "/app/#/intro",
        imageUrl: "",
        imageAlt: "NabadAi Pro subscription features",
      },
    },
    faq: {
      title: "Frequently asked questions",
      items: [
        {
          question: "Do I need to download an app?",
          answerHtml:
            'You can try NabadAi in your browser at <a href="/app">nabadai.com/app</a> or install the iOS app for the best experience.',
        },
        {
          question: "Can I use my own lyrics and voice?",
          answerHtml:
            "Yes. Write or generate lyrics, upload a melody reference, or create a Persona from your own voice sample.",
        },
        {
          question: "Is it free?",
          answerHtml:
            "New accounts include free credits. Pro subscriptions add more credits and premium features.",
        },
      ],
    },
    finalCta: {
      title: "Start your next song",
      body: "Bring lyrics, melody, images, and voice into one focused creative space.",
      ctaLabel: "Try free",
      ctaHref: "/app/#/intro",
    },
    related: {
      title: "Explore more ways to create",
      links: [
        { label: "AI Music Generator", href: "/ai-music-generator" },
        { label: "Hum to Song", href: "/hum-to-song" },
        { label: "Lyrics to Song", href: "/lyrics-to-song" },
        { label: "Photo to Song", href: "/photo-to-song" },
        { label: "Arabic AI Music", href: "/arabic-ai-music-generator" },
      ],
    },
    footer: {
      social: [
        { platform: "instagram", href: "", label: "Instagram" },
        { platform: "facebook", href: "", label: "Facebook" },
        { platform: "tiktok", href: "", label: "TikTok" },
        { platform: "youtube", href: "", label: "YouTube" },
        { platform: "discord", href: "", label: "Discord" },
      ],
    },
  };
}

function defaultHomeContentAr() {
  const en = defaultHomeContentEn();
  return {
    ...en,
    seo: {
      title: "NabadAi Music — أغاني بالذكاء الاصطناعي من صوتك أو كلماتك",
      description:
        "أنشئ أغاني كاملة من كلمات أو دندنة أو صورة. احفظ صوتك كشخصية، شارك على Discover، وابدأ مجاناً على الويب و iOS.",
    },
    hero: {
      ...en.hero,
      eyebrow: "استوديو موسيقى بالذكاء الاصطناعي",
      title: "موسيقى من دندنة. شارك ما تصنعه.",
      lead:
        "حوّل الكلمات أو اللحن الذي تدندنه أو مزاج صورة إلى أغنية كاملة. احفظ صوتك كشخصية، انشر على Discover، وتواصل مع المبدعين.",
      ctaLabel: "جرّب مجاناً",
      secondaryLabel: "كيف يعمل",
      storeNote: "متوفر على iPhone · Android قريباً",
      heroImageAlt: "تطبيق NabadAi — إنشاء أغاني من كلمات ودندنات وصور",
    },
    features: {
      eyebrow: "أنشئ بطريقتك",
      title: "من الفكرة إلى أغنية كاملة",
      cards: en.features.cards.map((c, i) => ({
        title: ["صورة أو دندنة أو كلمات", "صوتك في كل أغنية", "أنشئ وتواصل"][i] || c.title,
        body: c.body,
      })),
    },
    discover: {
      ...en.discover,
      eyebrow: "Discover",
      title: "استمع لما يصنعه المبدعون",
      lead: "قوائم وريمكسات واختيارات المجتمع — محدّثة داخل التطبيق.",
      ctaLabel: "استكشف Discover",
    },
    pricing: {
      eyebrow: "الأسعار",
      title: "ابدأ مجاناً. Pro عندما تكون جاهزاً.",
      free: {
        title: "مجاني",
        price: "$0",
        body: "ابدأ برصيد مجاني. أنشئ أغاني، احفظ مسودات، واستكشف المجتمع.",
        ctaLabel: "ابدأ",
        ctaHref: "/app/#/intro",
      },
      pro: {
        title: "NabadAi Pro",
        price: "أسبوعي أو شهري",
        body: "المزيد من الرصيد، صوت Persona، ميزات أولوية، ومجموعة المبدع الكاملة.",
        ctaLabel: "جرّب مجاناً أولاً",
        ctaHref: "/app/#/intro",
      },
    },
    faq: {
      title: "أسئلة شائعة",
      items: en.faq.items.map((item, i) => ({
        question: ["هل أحتاج تحميل تطبيق؟", "هل يمكنني استخدام كلماتي وصوتي؟", "هل هو مجاني؟"][i] || item.question,
        answerHtml: item.answerHtml,
      })),
    },
    finalCta: {
      title: "ابدأ أغنيتك التالية",
      body: "اجمع الكلمات واللحن والصورة والصوت في مساحة إبداعية واحدة.",
      ctaLabel: "جرّب مجاناً",
      ctaHref: "/app/#/intro",
    },
  };
}

function defaultContent(pageKey, locale) {
  const page = String(pageKey || "").trim().toLowerCase();
  const loc = String(locale || "en").trim().toLowerCase();
  if (page === "home" && loc === "ar") return defaultHomeContentAr();
  if (page === "home") return defaultHomeContentEn();
  const seo = defaultSeoContent(page, loc);
  return seo || {};
}

function clip(str, max) {
  return String(str ?? "").trim().slice(0, max);
}

function clipOptional(str, max) {
  const s = String(str ?? "").trim();
  if (!s) return "";
  return s.slice(0, max);
}

function sanitizeHref(href, fallback = "#") {
  const h = String(href || "").trim();
  if (!h) return fallback;
  if (h.startsWith("#")) return h.slice(0, 120);
  if (h.startsWith("/")) return h.slice(0, 200);
  if (/^https?:\/\//i.test(h)) return h.slice(0, 400);
  if (h.startsWith("mailto:")) return h.slice(0, 200);
  return fallback;
}

function sanitizeImageUrl(url, fallback) {
  const u = String(url || "").trim();
  if (!u) return fallback;
  if (u.startsWith("/")) return u.slice(0, 400);
  if (/^https?:\/\//i.test(u)) return u.slice(0, 400);
  return fallback;
}

/** Strip scripts and event handlers from FAQ HTML. */
function sanitizeAnswerHtml(html) {
  let s = String(html || "").trim();
  if (!s) return "";
  s = s.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  return s.slice(0, 2000);
}

function normalizeFeatureCards(cards, defaults, { withLinks = false } = {}) {
  const src = Array.isArray(cards) ? cards : [];
  const out = [];
  for (let i = 0; i < 3; i += 1) {
    const d = defaults[i] || { title: "", body: "" };
    const c = src[i] || {};
    const item = {
      title: clip(c.title, 120) || d.title,
      body: clip(c.body, 500) || d.body,
      imageUrl: sanitizeImageUrl(c.imageUrl, d.imageUrl || ""),
      imageAlt: clip(c.imageAlt, 200) || d.imageAlt || d.title || "",
    };
    if (withLinks) {
      item.links = normalizeRelatedLinks(c.links, d.links || []).slice(0, 4);
    }
    out.push(item);
  }
  return out;
}

function normalizeRelatedLinks(links, defaults) {
  const src = Array.isArray(links) ? links : [];
  const out = [];
  const max = Math.max(src.length, defaults.length, 0);
  for (let i = 0; i < Math.min(max, 8); i += 1) {
    const d = defaults[i] || { label: "", href: "/" };
    const it = src[i] || {};
    const label = clip(it.label, 80) || d.label;
    const href = sanitizeHref(it.href, d.href);
    if (!label) continue;
    out.push({ label, href });
  }
  return out.length ? out : defaults;
}

function normalizeHeroBlock(heroIn, defaults) {
  return {
    eyebrow: clip(heroIn.eyebrow, 80) || defaults.eyebrow,
    title: clip(heroIn.title, 200) || defaults.title,
    lead: clip(heroIn.lead, 600) || defaults.lead,
    ctaLabel: clip(heroIn.ctaLabel, 60) || defaults.ctaLabel,
    ctaHref: sanitizeHref(heroIn.ctaHref, defaults.ctaHref),
    secondaryLabel: clip(heroIn.secondaryLabel, 60) || defaults.secondaryLabel,
    secondaryHref: sanitizeHref(heroIn.secondaryHref, defaults.secondaryHref),
    heroImageUrl: sanitizeImageUrl(heroIn.heroImageUrl, defaults.heroImageUrl),
    heroImageAlt: clip(heroIn.heroImageAlt, 200) || defaults.heroImageAlt,
  };
}

function normalizeSeoLikeContent(input, defaults) {
  const seoIn = input.seo && typeof input.seo === "object" ? input.seo : {};
  const heroIn = input.hero && typeof input.hero === "object" ? input.hero : {};
  const featuresIn = input.features && typeof input.features === "object" ? input.features : {};
  const faqIn = input.faq && typeof input.faq === "object" ? input.faq : {};
  const finalIn = input.finalCta && typeof input.finalCta === "object" ? input.finalCta : {};
  const relatedIn = input.related && typeof input.related === "object" ? input.related : {};
  return {
    seo: {
      title: clip(seoIn.title, 160) || defaults.seo?.title || "",
      description: clip(seoIn.description, 320) || defaults.seo?.description || "",
    },
    hero: normalizeHeroBlock(heroIn, defaults.hero || {}),
    features: {
      eyebrow: clip(featuresIn.eyebrow, 80) || defaults.features?.eyebrow || "",
      title: clip(featuresIn.title, 160) || defaults.features?.title || "",
      cards: normalizeFeatureCards(featuresIn.cards, defaults.features?.cards || []),
    },
    faq: {
      title: clip(faqIn.title, 160) || defaults.faq?.title || "Frequently asked questions",
      items: normalizeFaqItems(faqIn.items, defaults.faq?.items || []),
    },
    related: {
      title: clip(relatedIn.title, 160) || defaults.related?.title || "Explore more ways to create",
      links: normalizeRelatedLinks(relatedIn.links, defaults.related?.links || []),
    },
    finalCta: {
      title: clip(finalIn.title, 160) || defaults.finalCta?.title || "",
      body: clip(finalIn.body, 400) || defaults.finalCta?.body || "",
      ctaLabel: clip(finalIn.ctaLabel, 60) || defaults.finalCta?.ctaLabel || "",
      ctaHref: sanitizeHref(finalIn.ctaHref, defaults.finalCta?.ctaHref || "/app/#/intro"),
    },
  };
}

function normalizeFaqItems(items, defaults) {
  const src = Array.isArray(items) ? items : [];
  const out = [];
  const max = Math.max(src.length, defaults.length, 1);
  for (let i = 0; i < Math.min(max, 12); i += 1) {
    const d = defaults[i] || { question: "", answerHtml: "" };
    const it = src[i] || {};
    const question = clip(it.question, 200) || d.question;
    const answerHtml = sanitizeAnswerHtml(it.answerHtml) || d.answerHtml;
    if (!question) continue;
    out.push({ question, answerHtml });
  }
  return out.length ? out : defaults;
}

function normalizePricingTier(tier, defaults) {
  const t = tier && typeof tier === "object" ? tier : {};
  return {
    title: clip(t.title, 80) || defaults.title,
    price: clip(t.price, 40) || defaults.price,
    body: clip(t.body, 500) || defaults.body,
    ctaLabel: clip(t.ctaLabel, 60) || defaults.ctaLabel,
    ctaHref: sanitizeHref(t.ctaHref, defaults.ctaHref),
    imageUrl: sanitizeImageUrl(t.imageUrl, defaults.imageUrl || ""),
    imageAlt: clip(t.imageAlt, 200) || defaults.imageAlt || defaults.title || "",
  };
}

const SOCIAL_PLATFORMS = Object.freeze(["instagram", "facebook", "tiktok", "youtube", "discord"]);

function normalizeFooterSocial(links, defaults) {
  const src = Array.isArray(links) ? links : [];
  const out = [];
  for (let i = 0; i < SOCIAL_PLATFORMS.length; i += 1) {
    const platform = SOCIAL_PLATFORMS[i];
    const d = (defaults || []).find((it) => it.platform === platform) || { platform, href: "", label: platform };
    const it = src.find((row) => String(row?.platform || "").toLowerCase() === platform) || src[i] || {};
    out.push({
      platform,
      href: sanitizeHref(it.href, d.href || ""),
      label: clip(it.label, 60) || d.label || platform,
    });
  }
  return out;
}

function normalizeFeaturedSongIds(ids, defaults) {
  const { normalizeSongIds } = require("./marketing-featured-songs");
  const normalized = normalizeSongIds(Array.isArray(ids) ? ids : []);
  if (normalized.length) return normalized;
  return normalizeSongIds(Array.isArray(defaults) ? defaults : []);
}

function normalizeContent(pageKey, locale, raw) {
  const page = String(pageKey || "").trim().toLowerCase();
  const loc = String(locale || "en").trim().toLowerCase();
  if (!PAGE_KEYS.includes(page)) {
    return { error: "Unsupported page." };
  }
  if (!LOCALES.includes(loc)) {
    return { error: "Unsupported locale." };
  }

  const defaults = defaultContent(page, loc);
  const input = raw && typeof raw === "object" ? raw : {};

  if (page === "home") {
    const seoIn = input.seo && typeof input.seo === "object" ? input.seo : {};
    const heroIn = input.hero && typeof input.hero === "object" ? input.hero : {};
    const featuresIn = input.features && typeof input.features === "object" ? input.features : {};
    const discoverIn = input.discover && typeof input.discover === "object" ? input.discover : {};
    const pricingIn = input.pricing && typeof input.pricing === "object" ? input.pricing : {};
    const faqIn = input.faq && typeof input.faq === "object" ? input.faq : {};
    const finalIn = input.finalCta && typeof input.finalCta === "object" ? input.finalCta : {};

    return {
      content: {
        seo: {
          title: clip(seoIn.title, 160) || defaults.seo.title,
          description: clip(seoIn.description, 320) || defaults.seo.description,
        },
        hero: {
          eyebrow: clip(heroIn.eyebrow, 80) || defaults.hero.eyebrow,
          title: clip(heroIn.title, 200) || defaults.hero.title,
          lead: clip(heroIn.lead, 600) || defaults.hero.lead,
          ctaLabel: clip(heroIn.ctaLabel, 60) || defaults.hero.ctaLabel,
          ctaHref: sanitizeHref(heroIn.ctaHref, defaults.hero.ctaHref),
          secondaryLabel: clip(heroIn.secondaryLabel, 60) || defaults.hero.secondaryLabel,
          secondaryHref: sanitizeHref(heroIn.secondaryHref, defaults.hero.secondaryHref),
          storeNote: clipOptional(heroIn.storeNote, 200) || defaults.hero.storeNote,
          heroImageUrl: sanitizeImageUrl(heroIn.heroImageUrl, defaults.hero.heroImageUrl),
          heroImageAlt: clip(heroIn.heroImageAlt, 200) || defaults.hero.heroImageAlt,
        },
        features: {
          eyebrow: clip(featuresIn.eyebrow, 80) || defaults.features.eyebrow,
          title: clip(featuresIn.title, 160) || defaults.features.title,
          cards: normalizeFeatureCards(featuresIn.cards, defaults.features.cards, { withLinks: true }),
        },
        discover: {
          eyebrow: clip(discoverIn.eyebrow, 80) || defaults.discover.eyebrow,
          title: clip(discoverIn.title, 160) || defaults.discover.title,
          lead: clip(discoverIn.lead, 400) || defaults.discover.lead,
          ctaLabel: clip(discoverIn.ctaLabel, 60) || defaults.discover.ctaLabel,
          ctaHref: sanitizeHref(discoverIn.ctaHref, defaults.discover.ctaHref),
          featuredSongIds: normalizeFeaturedSongIds(
            discoverIn.featuredSongIds,
            defaults.discover.featuredSongIds || [],
          ),
        },
        pricing: {
          eyebrow: clip(pricingIn.eyebrow, 80) || defaults.pricing.eyebrow,
          title: clip(pricingIn.title, 160) || defaults.pricing.title,
          free: normalizePricingTier(pricingIn.free, defaults.pricing.free),
          pro: normalizePricingTier(pricingIn.pro, defaults.pricing.pro),
        },
        faq: {
          title: clip(faqIn.title, 160) || defaults.faq.title,
          items: normalizeFaqItems(faqIn.items, defaults.faq.items),
        },
        finalCta: {
          title: clip(finalIn.title, 160) || defaults.finalCta.title,
          body: clip(finalIn.body, 400) || defaults.finalCta.body,
          ctaLabel: clip(finalIn.ctaLabel, 60) || defaults.finalCta.ctaLabel,
          ctaHref: sanitizeHref(finalIn.ctaHref, defaults.finalCta.ctaHref),
        },
        related: {
          title: clip((input.related || {}).title, 160) || defaults.related?.title || "",
          links: normalizeRelatedLinks((input.related || {}).links, defaults.related?.links || []),
        },
        footer: {
          social: normalizeFooterSocial(
            (input.footer || {}).social,
            defaults.footer?.social || [],
          ),
        },
      },
    };
  }

  if (isSeoPage(page)) {
    return { content: normalizeSeoLikeContent(input, defaults) };
  }

  return { error: "Unsupported page." };
}

function deepMerge(defaults, stored) {
  if (!stored || typeof stored !== "object") return defaults;
  const out = { ...defaults };
  for (const key of Object.keys(stored)) {
    const val = stored[key];
    if (val && typeof val === "object" && !Array.isArray(val) && defaults[key] && typeof defaults[key] === "object") {
      out[key] = deepMerge(defaults[key], val);
    } else if (val !== undefined && val !== null && val !== "") {
      out[key] = val;
    }
  }
  return out;
}

function mergeWithDefaults(pageKey, locale, stored) {
  const defaults = defaultContent(pageKey, locale);
  const normalized = normalizeContent(pageKey, locale, deepMerge(defaults, stored || {}));
  return normalized.content || defaults;
}

module.exports = {
  PAGE_KEYS,
  PAGE_CATALOG,
  LOCALES,
  isSeoPage,
  defaultContent,
  normalizeContent,
  mergeWithDefaults,
};
