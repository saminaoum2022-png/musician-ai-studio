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
          links: [],
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
    templates: {
      eyebrow: "Song templates",
      title: "A song for the moment",
      lead:
        "Pick an occasion — NabadAi guides lyrics and style so you don't start from a blank page. Perfect for gifts, events, and surprises.",
      ctaLabel: "Browse templates",
      ctaHref: "/app/#/challenges",
      showcaseEyebrow: "Hear examples",
      showcaseLead: "Preview real occasion songs before you create yours — tap play, then sign up to make your own.",
      showcaseItems: [],
      showcaseSongIds: [],
      imageUrl: "",
      imageAlt: "",
      cards: [
        {
          tone: "birthday",
          title: "Birthday",
          body: "Warm, personal, and ready to gift.",
          href: "/app/#/challenges",
          imageUrl: "/assets/marketing/occasion-templates/birthday.png",
        },
        {
          tone: "wedding",
          title: "Wedding & dabke",
          body: "Celebration energy for the dance floor.",
          href: "/app/#/challenges",
          imageUrl: "/assets/marketing/occasion-templates/wedding.png",
        },
        {
          tone: "love",
          title: "Love song",
          body: "Romantic lyrics with your own twist.",
          href: "/app/#/challenges",
          imageUrl: "/assets/marketing/occasion-templates/love.png",
        },
        {
          tone: "apology",
          title: "Apology",
          body: "Say it sincerely in a song.",
          href: "/app/#/challenges",
          imageUrl: "/assets/marketing/occasion-templates/apology.png",
        },
        {
          tone: "thanks",
          title: "Thank you",
          body: "Gratitude that feels personal.",
          href: "/app/#/challenges",
          imageUrl: "/assets/marketing/occasion-templates/thanks.png",
        },
        {
          tone: "arabic",
          title: "Arabic occasion",
          body: "Dialect-friendly templates for regional style.",
          href: "/app/#/challenges",
          imageUrl: "/assets/marketing/occasion-templates/arabic.png",
        },
      ],
    },
    collab: {
      eyebrow: "Creators & voices",
      title: "AI first. Real people when it matters.",
      lead:
        "Generate in minutes, then go further — publish on Discover, remix with friends, or request a pro singer for weddings and special releases.",
      ctaPrimaryLabel: "Apply now",
      ctaPrimaryHref: "/app/#/settings?singer=apply",
      ctaSecondaryLabel: "Request a vocalist",
      ctaSecondaryHref: "/app/#/settings?proSinger=request",
      imageUrl: "/assets/marketing/collab-ai-human.png",
      imageAlt: "Singer and AI collaborating in a neon music studio",
      points: [
        {
          title: "Pro Singers",
          body: "Request a real vocalist on your track — re-vocals, occasion songs, and premium delivery when AI isn't enough.",
        },
        {
          title: "Discover & remix",
          body: "Publish to your profile, climb charts, and connect with musicians who remix and respond to your songs.",
        },
      ],
    },
    pricing: {
      eyebrow: "Pricing",
      title: "Free to start. Pro when you're ready.",
      free: {
        title: "Free",
        price: "$0",
        body: "Starter credits to create songs — no card needed.",
        features: [
          { label: "Starter credits · 12 credits = 1 song (2 versions)" },
          { label: "Lyrics, hum, photo & publish to Discover" },
          { label: "AI lyrics help & ✦ Boost style" },
          { label: "NabadAi Coach · daily limit" },
        ],
        ctaLabel: "Get started",
        ctaHref: "/app/#/intro",
        imageUrl: "",
        imageAlt: "Generate songs with NabadAi free credits",
      },
      pro: {
        title: "NabadAi Pro",
        price: "",
        body: "Weekly or monthly credits, Studio, cover refresh, unlimited Coach, and private song analytics.",
        features: [
          { label: "400/week or 1,000+200 bonus/month · giftable" },
          { label: "Unlimited NabadAi Coach" },
          { label: "NabadAi Studio & cover refresh" },
          { label: "Song analytics & Pro badge" },
          { label: "WAV & stem exports — coming soon" },
        ],
        finePrint: "1 full song = 12 credits (2 versions). Cancel anytime in Settings.",
        ctaLabel: "View plans",
        ctaHref: "/app/#/pro",
        imageUrl: "",
        imageAlt: "NabadAi Pro subscription features",
      },
    },
    faq: {
      title: "Frequently asked questions",
      lead: "Everything you need to know about creating with NabadAi.",
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
        {
          question: "What can I create with NabadAi?",
          answerHtml:
            'Turn lyrics, a hum, or a photo mood into a full song — plus covers, remixes, instrumentals, and occasion templates. Explore <a href="/ai-music-generator">AI music generator</a>, <a href="/hum-to-song">hum to song</a>, and <a href="/photo-to-song">photo to song</a>.',
        },
        {
          question: "Does NabadAi support Arabic music, dabke, and dialects?",
          answerHtml:
            'Yes. Write Arabic lyrics, guide Lebanese and other dialects where supported, and shape dabke, khaleeji, tarab, and regional styles. See our <a href="/arabic-ai-music-generator">Arabic AI music</a> page.',
        },
        {
          question: "Can I publish songs on Discover?",
          answerHtml:
            "Yes. Keep drafts private, then publish to your profile and share on Discover when you're ready.",
        },
        {
          question: "Are there templates for birthdays, weddings, and occasions?",
          answerHtml:
            "Yes. In the app, pick an occasion or dedication template to get lyrics and style direction faster — useful for gifts and events.",
        },
        {
          question: "Do I need music production experience?",
          answerHtml:
            "No. NabadAi is built for people who start with an idea, not a DAW. You guide mood, lyrics, and style; the studio handles generation.",
        },
        {
          question: "How can I cancel my subscription?",
          answerHtml:
            'On <strong>iPhone</strong>, open <strong>Settings → Apple ID → Subscriptions → NabadAi</strong> and cancel there. On the <strong>web</strong>, sign in at <a href="/app/#/pro">NabadAi Pro</a> and tap <strong>Manage subscription</strong>. Canceling stops future charges — you keep Pro until the end of your current billing period. Questions? Email <a href="mailto:help@nabadai.com">help@nabadai.com</a>.',
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
    brand: defaultBrand(),
  };
}

const BRAND_FONTS = Object.freeze(["inter-display", "inter", "system"]);

function defaultBrand() {
  return {
    ctaColor: "#23d5ab",
    ctaTextColor: "#051018",
    headingFont: "inter-display",
    bodyFont: "inter",
    accentViolet: "#7c5cff",
  };
}

function sanitizeHexColor(hex, fallback) {
  const h = String(hex || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(h)) return h.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(h)) {
    const r = h[1];
    const g = h[2];
    const b = h[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

function normalizeBrand(raw, defaults) {
  const d = defaults || defaultBrand();
  const b = raw && typeof raw === "object" ? raw : {};
  return {
    ctaColor: sanitizeHexColor(b.ctaColor, d.ctaColor),
    ctaTextColor: sanitizeHexColor(b.ctaTextColor, d.ctaTextColor),
    headingFont: BRAND_FONTS.includes(b.headingFont) ? b.headingFont : d.headingFont,
    bodyFont: BRAND_FONTS.includes(b.bodyFont) ? b.bodyFont : d.bodyFont,
    accentViolet: sanitizeHexColor(b.accentViolet, d.accentViolet),
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
    templates: {
      eyebrow: "قوالب الأغاني",
      title: "أغنية للمناسبة",
      lead:
        "اختر مناسبة — NabadAi يوجّه الكلمات والأسلوب حتى لا تبدأ من صفحة فارغة. مثالي للهدايا والأعراس والمفاجآت.",
      ctaLabel: "تصفّح القوالب",
      ctaHref: "/app/#/challenges",
      showcaseEyebrow: "استمع لأمثلة",
      showcaseLead: "معاينة أغاني مناسبات حقيقية قبل أن تنشئ أغانيك — ثم سجّل لصنع أغنيتك.",
      showcaseItems: [],
      showcaseSongIds: [],
      imageUrl: "",
      imageAlt: "",
      cards: [
        {
          tone: "birthday",
          title: "عيد ميلاد",
          body: "دافئة وشخصية — جاهزة للإهداء.",
          href: "/app/#/challenges",
          imageUrl: "/assets/marketing/occasion-templates/birthday.png",
        },
        {
          tone: "wedding",
          title: "عرس ودبكة",
          body: "طاقة احتفال للرقصة والفرح.",
          href: "/app/#/challenges",
          imageUrl: "/assets/marketing/occasion-templates/wedding.png",
        },
        {
          tone: "love",
          title: "أغنية حب",
          body: "كلمات رومانسية بلمستك.",
          href: "/app/#/challenges",
          imageUrl: "/assets/marketing/occasion-templates/love.png",
        },
        {
          tone: "apology",
          title: "اعتذار",
          body: "عبّر بصدق في أغنية.",
          href: "/app/#/challenges",
          imageUrl: "/assets/marketing/occasion-templates/apology.png",
        },
        {
          tone: "thanks",
          title: "شكر",
          body: "امتنان يبدو شخصياً.",
          href: "/app/#/challenges",
          imageUrl: "/assets/marketing/occasion-templates/thanks.png",
        },
        {
          tone: "arabic",
          title: "مناسبة عربية",
          body: "قوالب مع لهجة وأسلوب إقليمي.",
          href: "/app/#/challenges",
          imageUrl: "/assets/marketing/occasion-templates/arabic.png",
        },
      ],
    },
    collab: {
      eyebrow: "مبدعون وأصوات",
      title: "ذكاء اصطناعي أولاً. أشخاص حقيقيون عندما يهم الأمر.",
      lead:
        "أنشئ في دقائق، ثم تابع — انشر على Discover، ريمكس مع الأصدقاء، أو اطلب مغنياً محترفاً للأعراس والمناسبات.",
      ctaPrimaryLabel: "قدّم الآن",
      ctaPrimaryHref: "/app/#/settings?singer=apply",
      ctaSecondaryLabel: "اطلب مغنياً",
      ctaSecondaryHref: "/app/#/settings?proSinger=request",
      imageUrl: "/assets/marketing/collab-ai-human.png",
      imageAlt: "مغنية وذكاء اصطناعي يتعاونان في استوديو موسيقى نيون",
      points: [
        {
          title: "Pro Singers",
          body: "اطلب صوتاً حقيقياً على مقطعك — إعادة غناء، أغاني مناسبات، وتسليم premium عندما لا يكفي الذكاء الاصطناعي.",
        },
        {
          title: "Discover وريمكس",
          body: "انشر على ملفك، تصدر القوائم، وتواصل مع موسيقيين يريمكسون ويردون على أغانيك.",
        },
      ],
    },
    pricing: {
      eyebrow: "الأسعار",
      title: "ابدأ مجاناً. Pro عندما تكون جاهزاً.",
      free: {
        title: "مجاني",
        price: "$0",
        body: "رصيد للبداية لإنشاء أغاني — بدون بطاقة.",
        features: [
          { label: "رصيد البداية · 12 رصيد = أغنية (نسختان)" },
          { label: "كلمات، دندنة، صورة والنشر على Discover" },
          { label: "مساعدة الكلمات و✦ Boost style" },
          { label: "NabadAi Coach · حد يومي" },
        ],
        ctaLabel: "ابدأ",
        ctaHref: "/app/#/intro",
      },
      pro: {
        title: "NabadAi Pro",
        price: "",
        body: "رصيد أسبوعي أو شهري، Studio، تجديد الغلاف، Coach غير محدود، وتحليلات أغانٍ خاصة بك.",
        features: [
          { label: "400/أسبوع أو 1,000+200 بونص/شهر · قابل للإهداء" },
          { label: "NabadAi Coach غير محدود" },
          { label: "NabadAi Studio وتجديد الغلاف" },
          { label: "تحليلات الأغاني وشارة Pro" },
          { label: "تصدير WAV والـ stems — قريباً" },
        ],
        finePrint: "أغنية كاملة = 12 رصيد (نسختان). إلغاء في أي وقت من الإعدادات.",
        ctaLabel: "عرض الخطط",
        ctaHref: "/app/#/pro",
      },
    },
    faq: {
      title: "أسئلة شائعة",
      lead: "كل ما تحتاج معرفته عن الإنشاء مع NabadAi.",
      items: [
        {
          question: "هل أحتاج تحميل تطبيق؟",
          answerHtml:
            'يمكنك تجربة NabadAi في المتصفح على <a href="/app">nabadai.com/app</a> أو تثبيت تطبيق iOS لتجربة أفضل.',
        },
        {
          question: "هل يمكنني استخدام كلماتي وصوتي؟",
          answerHtml:
            "نعم. اكتب أو ولّد كلمات، ارفع مرجعاً للحن، أو أنشئ Persona من عينة صوتك.",
        },
        {
          question: "هل الخدمة مجانية؟",
          answerHtml:
            "الحسابات الجديدة تتضمن رصيداً مجانياً. اشتراك Pro يضيف المزيد من الرصيد والميزات المتقدمة.",
        },
        {
          question: "ماذا يمكنني إنشاؤه مع NabadAi؟",
          answerHtml:
            'حوّل الكلمات أو الهمهمة أو مزاج صورة إلى أغنية كاملة — مع أغلفة وريمكسات وموسيقى instrumental وقوالب للمناسبات. اكتشف <a href="/ar/ai-music-generator">مولد الموسيقى</a> و<a href="/ar/hum-to-song">الهمهمة إلى أغنية</a> و<a href="/ar/photo-to-song">الصورة إلى أغنية</a>.',
        },
        {
          question: "هل يدعم NabadAi الموسيقى العربية والدبكة واللهجات؟",
          answerHtml:
            'نعم. اكتب كلماتاً عربية، وجّه اللهجة اللبنانية وغيرها حيث تتوفر، واختر اتجاهات مثل الدبكة والخليجي والطرب. المزيد في صفحة <a href="/ar/arabic-ai-music-generator">الموسيقى العربية</a>.',
        },
        {
          question: "هل يمكنني نشر أغانيي على Discover؟",
          answerHtml:
            "نعم. احتفظ بالمسودات خاصة، ثم انشر على ملفك الشخصي وشارك على Discover عندما تكون جاهزاً.",
        },
        {
          question: "هل توجد قوالب لأعياد الميلاد والأعراس والمناسبات؟",
          answerHtml:
            "نعم. داخل التطبيق، اختر قالب مناسبة أو إهداء للحصول على كلمات واتجاه أسلوب أسرع — مفيد للهدايا والمناسبات.",
        },
        {
          question: "هل أحتاج خبرة في الإنتاج الموسيقي؟",
          answerHtml:
            "لا. NabadAi مُصمَّم للمبدعين الذين يبدأون بفكرة، لا ببرنامج DAW. أنت توجّه المزاج والكلمات والأسلوب؛ والاستوديو يتولى التوليد.",
        },
        {
          question: "كيف ألغي اشتراك Pro؟",
          answerHtml:
            'على <strong>iPhone</strong>: <strong>الإعدادات → Apple ID → الاشتراكات → NabadAi</strong> ثم إلغاء الاشتراك. على <strong>الويب</strong>: سجّل الدخول وافتح <a href="/app/#/pro">NabadAi Pro</a> واضغط <strong>إدارة الاشتراك</strong>. الإلغاء يوقف التجديد فقط — تبقى مزايا Pro حتى نهاية فترة الفوترة الحالية. للمساعدة: <a href="mailto:help@nabadai.com">help@nabadai.com</a>.',
        },
      ],
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
      lead: clip(faqIn.lead, 240) || defaults.faq?.lead || "",
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

function normalizePricingFeatures(items, defaults) {
  const src = Array.isArray(items) ? items : [];
  const out = [];
  const max = Math.max(src.length, defaults.length, 1);
  for (let i = 0; i < Math.min(max, 12); i += 1) {
    const d = defaults[i] || { label: "" };
    const it = src[i] || {};
    const label = clip(it.label, 200) || d.label;
    const sub = clip(it.sub, 300) || d.sub || "";
    if (!label) continue;
    out.push(sub ? { label, sub } : { label });
  }
  return out.length ? out : defaults;
}

function normalizePricingTier(tier, defaults) {
  const t = tier && typeof tier === "object" ? tier : {};
  return {
    title: clip(t.title, 80) || defaults.title,
    price: clip(t.price, 40) || defaults.price || "",
    body: clip(t.body, 500) || defaults.body,
    featuresTitle: clip(t.featuresTitle, 80) || defaults.featuresTitle || "",
    features: normalizePricingFeatures(t.features, defaults.features || []),
    finePrint: clip(t.finePrint, 300) || defaults.finePrint || "",
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

const SHOWCASE_ITEM_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeShowcaseItems(itemsIn, legacyIds, defaults) {
  const defaultItems = Array.isArray(defaults?.showcaseItems) ? defaults.showcaseItems : [];
  let items = [];
  if (Array.isArray(itemsIn) && itemsIn.length) {
    const seen = new Set();
    for (const raw of itemsIn) {
      if (!raw || typeof raw !== "object") continue;
      const songId = String(raw.songId || raw.id || "").trim();
      if (!SHOWCASE_ITEM_UUID_RE.test(songId) || seen.has(songId)) continue;
      seen.add(songId);
      items.push({
        songId,
        tag: clip(raw.tag || raw.label || raw.occasionLabel, 80),
      });
      if (items.length >= 12) break;
    }
  }
  if (!items.length) {
    const legacy = normalizeFeaturedSongIds(legacyIds, []);
    items = legacy.map((songId) => ({ songId, tag: "" }));
  }
  if (!items.length && defaultItems.length) {
    return normalizeShowcaseItems(defaultItems, [], { showcaseItems: [] });
  }
  return items;
}

function normalizeTemplateCards(cards, defaults, showcaseItems) {
  const src = Array.isArray(cards) ? cards : [];
  const legacyItems = Array.isArray(showcaseItems) ? showcaseItems : [];
  const out = [];
  for (let i = 0; i < 6; i += 1) {
    const d = defaults[i] || { tone: "birthday", title: "", body: "", href: "/app/#/challenges" };
    const c = src[i] || {};
    const tone = clip(c.tone, 24) || d.tone || "birthday";
    const legacySongId = String(legacyItems[i]?.songId || "").trim();
    const exampleSongId = String(c.exampleSongId || legacySongId || "").trim();
    out.push({
      tone,
      title: clip(c.title, 80) || d.title,
      body: clip(c.body, 200) || d.body,
      href: sanitizeHref(c.href, d.href || "/app/#/challenges"),
      imageUrl: sanitizeImageUrl(c.imageUrl, d.imageUrl || ""),
      exampleSongId: SHOWCASE_ITEM_UUID_RE.test(exampleSongId) ? exampleSongId : "",
    });
  }
  return out;
}

function normalizeCollabPoints(points, defaults) {
  const src = Array.isArray(points) ? points : [];
  const out = [];
  for (let i = 0; i < 2; i += 1) {
    const d = defaults[i] || { title: "", body: "" };
    const p = src[i] || {};
    out.push({
      title: clip(p.title, 120) || d.title,
      body: clip(p.body, 400) || d.body,
    });
  }
  return out;
}

const HOME_SECTION_TYPES = Object.freeze([
  "hero",
  "features",
  "templates",
  "discover",
  "collab",
  "pricing",
  "faq",
  "related",
  "finalCta",
]);

const SEO_SECTION_TYPES = Object.freeze([
  "hero",
  "features",
  "faq",
  "related",
  "finalCta",
]);

const SECTION_TYPE_TO_ID = Object.freeze({
  hero: "hero",
  features: "features",
  templates: "templates",
  discover: "discover",
  collab: "collab",
  pricing: "pricing",
  faq: "faq",
  related: "related",
  finalCta: "final",
});

const OPTIONAL_BLOCK_TYPES = Object.freeze([
  "testimonials",
  "logoStrip",
  "mediaBlock",
  "contentCarousel",
]);

const BLOCK_TYPES = new Set(OPTIONAL_BLOCK_TYPES);

const SECTION_CATALOG = Object.freeze({
  hero: { label: "Hero", home: true, seo: true },
  features: { label: "Features", home: true, seo: true },
  templates: { label: "Song templates", home: true, seo: false },
  discover: { label: "Discover teaser", home: true, seo: false },
  collab: { label: "Creators & voices", home: true, seo: false },
  pricing: { label: "Pricing", home: true, seo: false },
  faq: { label: "FAQ", home: true, seo: true },
  related: { label: "Related pages", home: true, seo: true },
  finalCta: { label: "Final CTA", home: true, seo: true },
  testimonials: { label: "Testimonials", home: true, seo: false, optional: true, duplicatable: true },
  logoStrip: { label: "Logo strip", home: true, seo: false, optional: true, duplicatable: true },
  mediaBlock: { label: "Photo & copy", home: true, seo: false, optional: true, duplicatable: true },
  contentCarousel: { label: "Image carousel", home: true, seo: false, optional: true, duplicatable: true },
});

function isBlockSectionType(type) {
  return BLOCK_TYPES.has(String(type || "").trim());
}

function defaultBlockContent(type) {
  const t = String(type || "").trim();
  if (t === "testimonials") {
    return {
      type: t,
      eyebrow: "Community",
      title: "What creators are saying",
      items: [
        { quote: "I hummed a melody and had a full song in minutes.", name: "Creator name", role: "NabadAi user" },
        { quote: "Publishing to Discover changed how I share music.", name: "Creator name", role: "Pro member" },
        { quote: "Arabic lyrics and dabke style just worked.", name: "Creator name", role: "NabadAi user" },
      ],
    };
  }
  if (t === "logoStrip") {
    return {
      type: t,
      title: "As featured in",
      logos: [
        { label: "Partner 1", imageUrl: "", href: "" },
        { label: "Partner 2", imageUrl: "", href: "" },
        { label: "Partner 3", imageUrl: "", href: "" },
      ],
    };
  }
  if (t === "mediaBlock") {
    return {
      type: t,
      eyebrow: "",
      title: "Section title",
      body: "Supporting copy for this photo block.",
      imageUrl: "",
      imageAlt: "",
      imagePosition: "right",
    };
  }
  if (t === "contentCarousel") {
    return {
      type: t,
      eyebrow: "",
      title: "Carousel",
      lead: "",
      size: "normal",
      visibleCount: 3,
      autoSlide: true,
      intervalMs: 5000,
      items: [
        { title: "Slide 1", body: "", imageUrl: "", href: "" },
        { title: "Slide 2", body: "", imageUrl: "", href: "" },
        { title: "Slide 3", body: "", imageUrl: "", href: "" },
      ],
    };
  }
  return null;
}

function newBlockSectionId(type) {
  const base = String(type || "block").replace(/[^a-z0-9]/gi, "").slice(0, 12) || "block";
  return `${base}-${Date.now().toString(36)}`;
}

function normalizeTestimonialItems(items, defaults) {
  const src = Array.isArray(items) ? items : [];
  const out = [];
  for (let i = 0; i < Math.max(src.length, defaults.length, 1); i += 1) {
    if (i >= 6) break;
    const d = defaults[i] || { quote: "", name: "", role: "" };
    const it = src[i] || {};
    const quote = clip(it.quote, 400) || d.quote;
    const name = clip(it.name, 80) || d.name;
    const role = clip(it.role, 120) || d.role;
    if (!quote.trim()) continue;
    out.push({ quote, name, role });
  }
  return out.length ? out : defaults;
}

function normalizeLogoItems(items, defaults) {
  const src = Array.isArray(items) ? items : [];
  const out = [];
  for (let i = 0; i < Math.max(src.length, defaults.length, 1); i += 1) {
    if (i >= 12) break;
    const d = defaults[i] || { label: "", imageUrl: "", href: "" };
    const it = src[i] || {};
    out.push({
      label: clip(it.label, 80) || d.label,
      imageUrl: sanitizeImageUrl(it.imageUrl, d.imageUrl || ""),
      href: sanitizeHref(it.href, d.href || ""),
    });
  }
  return out.length ? out : defaults;
}

function normalizeCarouselItems(items, defaults) {
  const src = Array.isArray(items) ? items : [];
  const out = [];
  for (let i = 0; i < Math.max(src.length, defaults.length, 1); i += 1) {
    if (i >= 12) break;
    const d = defaults[i] || { title: "", body: "", imageUrl: "", href: "" };
    const it = src[i] || {};
    const title = clip(it.title, 120) || d.title;
    if (!title.trim() && !sanitizeImageUrl(it.imageUrl, "")) continue;
    out.push({
      title,
      body: clip(it.body, 300) || d.body || "",
      imageUrl: sanitizeImageUrl(it.imageUrl, d.imageUrl || ""),
      href: sanitizeHref(it.href, d.href || ""),
    });
  }
  return out.length ? out : defaults;
}

function normalizeBlockEntry(type, raw, id) {
  const defaults = defaultBlockContent(type);
  if (!defaults) return null;
  const input = raw && typeof raw === "object" ? raw : {};
  if (type === "testimonials") {
    return {
      type,
      id,
      eyebrow: clip(input.eyebrow, 80) || defaults.eyebrow,
      title: clip(input.title, 160) || defaults.title,
      items: normalizeTestimonialItems(input.items, defaults.items),
    };
  }
  if (type === "logoStrip") {
    return {
      type,
      id,
      title: clip(input.title, 160) || defaults.title,
      logos: normalizeLogoItems(input.logos, defaults.logos),
    };
  }
  if (type === "mediaBlock") {
    const pos = String(input.imagePosition || defaults.imagePosition).toLowerCase();
    return {
      type,
      id,
      eyebrow: clip(input.eyebrow, 80) || defaults.eyebrow,
      title: clip(input.title, 160) || defaults.title,
      body: clip(input.body, 600) || defaults.body,
      imageUrl: sanitizeImageUrl(input.imageUrl, defaults.imageUrl),
      imageAlt: clip(input.imageAlt, 200) || defaults.imageAlt,
      imagePosition: pos === "left" ? "left" : "right",
    };
  }
  if (type === "contentCarousel") {
    const size = String(input.size || defaults.size).toLowerCase() === "large" ? "large" : "normal";
    let visibleCount = Number(input.visibleCount);
    if (!Number.isFinite(visibleCount)) visibleCount = defaults.visibleCount;
    visibleCount = Math.min(6, Math.max(1, Math.round(visibleCount)));
    let intervalMs = Number(input.intervalMs);
    if (!Number.isFinite(intervalMs)) intervalMs = defaults.intervalMs;
    intervalMs = Math.min(15000, Math.max(2000, Math.round(intervalMs)));
    return {
      type,
      id,
      eyebrow: clip(input.eyebrow, 80) || defaults.eyebrow,
      title: clip(input.title, 160) || defaults.title,
      lead: clip(input.lead, 400) || defaults.lead,
      size,
      visibleCount,
      autoSlide: input.autoSlide !== false,
      intervalMs,
      items: normalizeCarouselItems(input.items, defaults.items),
    };
  }
  return null;
}

function normalizeBlocks(pageKey, sections, rawBlocks) {
  if (pageKey !== "home") return {};
  const blocks = {};
  const input = rawBlocks && typeof rawBlocks === "object" ? rawBlocks : {};
  const sectionList = Array.isArray(sections) ? sections : [];
  for (const row of sectionList) {
    if (!row || !isBlockSectionType(row.type)) continue;
    const id = clip(String(row.id || ""), 40) || newBlockSectionId(row.type);
    const raw = input[id] || input[row.id] || {};
    const normalized = normalizeBlockEntry(row.type, { ...raw, type: row.type }, id);
    if (normalized) blocks[id] = normalized;
  }
  return blocks;
}

function attachBlocks(content, pageKey, sections, rawBlocks) {
  return {
    ...content,
    blocks: normalizeBlocks(pageKey, sections, rawBlocks ?? content?.blocks),
  };
}

function defaultSections(pageKey) {
  const types = pageKey === "home" ? HOME_SECTION_TYPES : SEO_SECTION_TYPES;
  return types.map((type) => ({
    type,
    id: SECTION_TYPE_TO_ID[type] || type,
    enabled: true,
  }));
}

function normalizeSections(pageKey, rawSections) {
  const page = String(pageKey || "").trim().toLowerCase();
  const defaults = defaultSections(page);
  if (!Array.isArray(rawSections) || rawSections.length === 0) {
    return defaults;
  }

  const coreAllowed = new Set(page === "home" ? HOME_SECTION_TYPES : SEO_SECTION_TYPES);
  const defaultByType = Object.fromEntries(defaults.map((s) => [s.type, s]));
  const out = [];
  const seenCoreTypes = new Set();
  const seenIds = new Set();

  for (const row of rawSections) {
    if (!row || typeof row !== "object") continue;
    const type = String(row.type || "").trim();
    const isBlock = isBlockSectionType(type);
    if (!coreAllowed.has(type) && !(page === "home" && isBlock)) continue;
    if (!isBlock && seenCoreTypes.has(type)) continue;
    const def = defaultByType[type];
    const id = clip(String(row.id || def?.id || newBlockSectionId(type)), 40) || def?.id || type;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    if (!isBlock) seenCoreTypes.add(type);
    out.push({
      type,
      id,
      enabled: type === "hero" ? true : row.enabled !== false,
    });
  }

  for (const def of defaults) {
    if (!seenCoreTypes.has(def.type)) {
      out.push({ ...def, enabled: false });
    }
  }

  const heroIdx = out.findIndex((s) => s.type === "hero");
  if (heroIdx > 0) {
    const [heroRow] = out.splice(heroIdx, 1);
    out.unshift(heroRow);
  }

  return out.length ? out : defaults;
}

function attachSectionsAndBlocks(content, pageKey, rawSections, rawBlocks) {
  const sections = normalizeSections(pageKey, rawSections ?? content?.sections);
  return attachBlocks({ ...content, sections }, pageKey, sections, rawBlocks);
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
    const templatesIn = input.templates && typeof input.templates === "object" ? input.templates : {};
    const collabIn = input.collab && typeof input.collab === "object" ? input.collab : {};
    const pricingIn = input.pricing && typeof input.pricing === "object" ? input.pricing : {};
    const faqIn = input.faq && typeof input.faq === "object" ? input.faq : {};
    const finalIn = input.finalCta && typeof input.finalCta === "object" ? input.finalCta : {};

    const homeContent = {
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
        templates: {
          eyebrow: clip(templatesIn.eyebrow, 80) || defaults.templates.eyebrow,
          title: clip(templatesIn.title, 160) || defaults.templates.title,
          lead: clip(templatesIn.lead, 400) || defaults.templates.lead,
          ctaLabel: clip(templatesIn.ctaLabel, 60) || defaults.templates.ctaLabel,
          ctaHref: sanitizeHref(templatesIn.ctaHref, defaults.templates.ctaHref),
          showcaseEyebrow: clip(templatesIn.showcaseEyebrow, 80) || defaults.templates.showcaseEyebrow,
          showcaseLead: clip(templatesIn.showcaseLead, 400) || defaults.templates.showcaseLead,
          showcaseItems: normalizeShowcaseItems(
            templatesIn.showcaseItems,
            templatesIn.showcaseSongIds,
            defaults.templates,
          ),
          showcaseSongIds: normalizeShowcaseItems(
            templatesIn.showcaseItems,
            templatesIn.showcaseSongIds,
            defaults.templates,
          ).map((it) => it.songId),
          imageUrl: sanitizeImageUrl(templatesIn.imageUrl, defaults.templates.imageUrl),
          imageAlt: clip(templatesIn.imageAlt, 200) || defaults.templates.imageAlt,
          cards: normalizeTemplateCards(
            templatesIn.cards,
            defaults.templates.cards,
            normalizeShowcaseItems(
              templatesIn.showcaseItems,
              templatesIn.showcaseSongIds,
              defaults.templates,
            ),
          ),
        },
        collab: {
          eyebrow: clip(collabIn.eyebrow, 80) || defaults.collab.eyebrow,
          title: clip(collabIn.title, 160) || defaults.collab.title,
          lead: clip(collabIn.lead, 400) || defaults.collab.lead,
          ctaPrimaryLabel: clip(collabIn.ctaPrimaryLabel, 60) || defaults.collab.ctaPrimaryLabel,
          ctaPrimaryHref: sanitizeHref(collabIn.ctaPrimaryHref, defaults.collab.ctaPrimaryHref),
          ctaSecondaryLabel: clip(collabIn.ctaSecondaryLabel, 60) || defaults.collab.ctaSecondaryLabel,
          ctaSecondaryHref: sanitizeHref(collabIn.ctaSecondaryHref, defaults.collab.ctaSecondaryHref),
          imageUrl: sanitizeImageUrl(collabIn.imageUrl, defaults.collab.imageUrl),
          imageAlt: clip(collabIn.imageAlt, 200) || defaults.collab.imageAlt,
          points: normalizeCollabPoints(collabIn.points, defaults.collab.points),
        },
        pricing: {
          eyebrow: clip(pricingIn.eyebrow, 80) || defaults.pricing.eyebrow,
          title: clip(pricingIn.title, 160) || defaults.pricing.title,
          free: normalizePricingTier(pricingIn.free, defaults.pricing.free),
          pro: normalizePricingTier(pricingIn.pro, defaults.pricing.pro),
        },
        faq: {
          title: clip(faqIn.title, 160) || defaults.faq.title,
          lead: clip(faqIn.lead, 240) || defaults.faq.lead || "",
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
        brand: normalizeBrand(input.brand, defaults.brand),
    };
    return {
      content: attachSectionsAndBlocks(homeContent, page, input.sections, input.blocks),
    };
  }

  if (isSeoPage(page)) {
    const seoContent = normalizeSeoLikeContent(input, defaults);
    return {
      content: attachSectionsAndBlocks(seoContent, page, input.sections, input.blocks),
    };
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
  defaultBrand,
  defaultSections,
  normalizeSections,
  SECTION_CATALOG,
  SECTION_TYPE_TO_ID,
  OPTIONAL_BLOCK_TYPES,
  BLOCK_TYPES,
  defaultBlockContent,
  newBlockSectionId,
  isBlockSectionType,
  normalizeContent,
  mergeWithDefaults,
};
