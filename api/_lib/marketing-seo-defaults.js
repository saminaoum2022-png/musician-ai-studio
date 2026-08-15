/**
 * Default CMS content for SEO landing pages (en + ar).
 */

function seoPage(en, ar) {
  return { en, ar: ar || en };
}

const SEO_DEFAULTS = Object.freeze({
  "ai-music-generator": seoPage(
    {
      seo: {
        title: "AI Music Generator & Song Maker | NabadAi",
        description:
          "Create complete songs from lyrics, a hum, or a photo with NabadAi's AI music generator. Shape the style, voice, artwork, and mood.",
      },
      hero: {
        eyebrow: "AI music creation",
        title: "Turn your idea into a complete song",
        lead:
          "NabadAi is an AI music generator built for the whole creative path: start with words, a melody you hum, or a photo, then shape the sound and share what you make.",
        ctaLabel: "Open NabadAi",
        ctaHref: "/app/#/intro",
        secondaryLabel: "See how it works",
        secondaryHref: "#features",
        heroImageUrl: "/assets/marketing/seo-hero-device.png",
        heroImageAlt: "NabadAi app on iPhone — create songs, hum melodies, and more",
      },
      features: {
        eyebrow: "Create with NabadAi",
        title: "Flexible tools for your idea",
        cards: [
          { title: "Start your way", body: "Write lyrics, describe a sound, hum a melody, or begin with a photo mood." },
          { title: "Shape the result", body: "Choose vocal direction, genre, mood, artwork style, and the details that make the song yours." },
          { title: "Create and connect", body: "Keep drafts on your device, publish finished songs, and discover what other creators are making." },
        ],
      },
      faq: {
        title: "Frequently asked questions",
        items: [
          { question: "What is an AI music generator?", answerHtml: "It is a creative tool that turns instructions such as lyrics, mood, style, or melody references into generated music." },
          { question: "Can I use my own lyrics?", answerHtml: "Yes. You can write your own lyrics, generate a draft, edit it, and pair it with your chosen musical direction." },
          { question: "Can NabadAi create vocals and instrumentals?", answerHtml: "Yes. Song creation supports vocal and instrumental directions, depending on the flow and options you choose." },
        ],
      },
      related: {
        title: "Explore more ways to create",
        links: [
          { label: "Hum to Song", href: "/hum-to-song" },
          { label: "Lyrics to Song", href: "/lyrics-to-song" },
          { label: "Photo to Song", href: "/photo-to-song" },
          { label: "Arabic AI Music", href: "/arabic-ai-music-generator" },
        ],
      },
      finalCta: {
        title: "Start your next song",
        body: "Bring lyrics, melody, images, and voice into one focused creative space.",
        ctaLabel: "Open NabadAi",
        ctaHref: "/app/#/intro",
      },
    },
    {
      seo: {
        title: "مولّد موسيقى بالذكاء الاصطناعي | NabadAi",
        description: "حوّل كلمات أو همهمة أو صورة إلى أغنية كاملة بالذكاء الاصطناعي مع NabadAi.",
      },
      hero: {
        eyebrow: "إنشاء موسيقى بالذكاء الاصطناعي",
        title: "حوّل فكرتك إلى أغنية كاملة",
        lead: "NabadAi مولّد موسيقى يرافقك من الكلمات أو الهمهمة أو الصورة إلى أغنية جاهزة للمشاركة.",
        ctaLabel: "افتح NabadAi",
        ctaHref: "/app/#/intro",
        secondaryLabel: "تعرّف إلى الأدوات",
        secondaryHref: "#features",
        heroImageUrl: "/assets/marketing/seo-hero-device.png",
        heroImageAlt: "واجهة NabadAi لإنشاء الموسيقى",
      },
      features: {
        eyebrow: "صفحات الإنشاء",
        title: "أدوات مرنة لفكرتك",
        cards: [
          { title: "ابدأ بطريقتك", body: "اكتب كلمات، صف صوتاً، سجّل همهمة، أو ابدأ بمزاج صورة." },
          { title: "شكّل النتيجة", body: "اختر الاتجاه الغنائي والنوع والمزاج وستايل الغلاف." },
          { title: "أنشئ وتواصل", body: "احفظ المسودات، انشر الأغاني، واكتشف ما يصنعه المبدعون." },
        ],
      },
      faq: {
        title: "أسئلة شائعة",
        items: [
          { question: "ما هو مولّد الموسيقى بالذكاء الاصطناعي؟", answerHtml: "أداة إبداعية تحوّل التعليمات مثل الكلمات والمزاج والأسلوب إلى موسيقى مُولَّدة." },
          { question: "هل يمكنني استخدام كلماتي؟", answerHtml: "نعم. اكتب كلماتك أو عدّل مسودة ثم اربطها بالاتجاه الموسيقي الذي تختاره." },
          { question: "هل يدعم NabadAi غناء وعزفاً منفرداً؟", answerHtml: "نعم. يدعم إنشاء الأغاني اتجاهات غنائية وآلاتية حسب المسار الذي تختاره." },
        ],
      },
      related: {
        title: "اكتشف أدوات أخرى",
        links: [
          { label: "من الهمهمة إلى أغنية", href: "/ar/hum-to-song" },
          { label: "الكلمات إلى أغنية", href: "/ar/lyrics-to-song" },
          { label: "الصورة إلى أغنية", href: "/ar/photo-to-song" },
        ],
      },
      finalCta: {
        title: "ابدأ أغنيتك التالية",
        body: "اجمع الكلمات واللحن والصورة والصوت في مساحة إبداعية واحدة.",
        ctaLabel: "افتح NabadAi",
        ctaHref: "/app/#/intro",
      },
    },
  ),
  "hum-to-song": seoPage(
    {
      seo: {
        title: "Hum to Song AI Melody Generator | NabadAi",
        description:
          "Record or upload a hum and turn your melody idea into music. Use NabadAi to shape a hummed tune into an instrumental or complete song.",
      },
      hero: {
        eyebrow: "Hum to song",
        title: "Hum the melody. Build the song.",
        lead:
          "When the tune arrives before the words, capture it. NabadAi lets you record or upload a short hum and use that melody as the starting point for a new track.",
        ctaLabel: "Open NabadAi",
        ctaHref: "/app/#/intro",
        secondaryLabel: "See how it works",
        secondaryHref: "#features",
        heroImageUrl: "/assets/marketing/seo-hero-device.png",
        heroImageAlt: "NabadAi app on iPhone — create songs, hum melodies, and more",
      },
      features: {
        eyebrow: "Create with NabadAi",
        title: "Flexible tools for your idea",
        cards: [
          { title: "Capture the idea", body: "Record a short melody while it is fresh, or upload a hum you already saved." },
          { title: "Choose the direction", body: "Turn the melody into a solo instrumental or use it as guidance for a fuller song." },
          { title: "Keep creating", body: "Add style, lyrics, artwork, and a title when you are ready to develop the idea further." },
        ],
      },
      faq: {
        title: "Frequently asked questions",
        items: [
          { question: "How long should my hum be?", answerHtml: "A clear 15–30 second phrase works well. A quiet room and a steady melody help the system follow your idea." },
          { question: "Do I need to sing words?", answerHtml: "No. A simple hum is enough for the melody flow; words can be added separately if you want a vocal song." },
          { question: "Can I upload a recording?", answerHtml: "Yes. You can upload an existing melody guide when recording directly is not convenient." },
        ],
      },
      related: {
        title: "Explore more ways to create",
        links: [
          { label: "AI Music Generator", href: "/ai-music-generator" },
          { label: "Lyrics to Song", href: "/lyrics-to-song" },
          { label: "Photo to Song", href: "/photo-to-song" },
        ],
      },
      finalCta: {
        title: "Start your next song",
        body: "Bring lyrics, melody, images, and voice into one focused creative space.",
        ctaLabel: "Open NabadAi",
        ctaHref: "/app/#/intro",
      },
    },
    {
      hero: {
        eyebrow: "من الهمهمة إلى أغنية",
        title: "همهم اللحن وابنِ الأغنية",
        lead: "أحياناً يأتي اللحن قبل الكلمات. سجّل الفكرة فوراً أو ارفع تسجيلاً محفوظاً، واستخدم الهمهمة كنقطة انطلاق لمقطوعة أو أغنية جديدة.",
        ctaLabel: "افتح NabadAi",
        secondaryLabel: "تعرّف إلى الأدوات",
      },
      related: {
        title: "اكتشف أدوات أخرى",
        links: [
          { label: "مولد الموسيقى", href: "/ar/ai-music-generator" },
          { label: "الكلمات إلى أغنية", href: "/ar/lyrics-to-song" },
          { label: "الصورة إلى أغنية", href: "/ar/photo-to-song" },
        ],
      },
    },
  ),
  "lyrics-to-song": seoPage(
    {
      seo: {
        title: "Lyrics to Song AI Generator | NabadAi",
        description:
          "Turn your lyrics into a complete AI-generated song. Edit the words, choose a musical style and vocal direction, then create with NabadAi.",
      },
      hero: {
        eyebrow: "Lyrics to song",
        title: "Give your lyrics a voice",
        lead:
          "Bring a chorus, verse, or full lyric draft into NabadAi and hear it in a musical setting. You control the words and guide the style, mood, and vocal character.",
        ctaLabel: "Open NabadAi",
        ctaHref: "/app/#/intro",
        secondaryLabel: "See how it works",
        secondaryHref: "#features",
        heroImageUrl: "/assets/marketing/seo-hero-device.png",
        heroImageAlt: "NabadAi app on iPhone — create songs, hum melodies, and more",
      },
      features: {
        eyebrow: "Create with NabadAi",
        title: "Flexible tools for your idea",
        cards: [
          { title: "Write or generate", body: "Start with your own lyrics or ask for a draft, then edit every line before creating." },
          { title: "Direct the sound", body: "Choose genre, energy, vocal range, language, and musical references that fit the words." },
          { title: "Finish the release", body: "Create cover art, save the result, and publish when you decide the song is ready." },
        ],
      },
      faq: {
        title: "Frequently asked questions",
        items: [
          { question: "Can I edit generated lyrics?", answerHtml: "Yes. Lyrics remain editable so you can rewrite lines, structure sections, and keep your own voice." },
          { question: "Does NabadAi support Arabic lyrics?", answerHtml: "Yes. Arabic is available alongside English and other language choices, with regional music options in the creative tools." },
          { question: "Can I make an instrumental instead?", answerHtml: "Yes. Choose an instrumental direction when you want music without a sung lyric." },
        ],
      },
      related: {
        title: "Explore more ways to create",
        links: [
          { label: "AI Music Generator", href: "/ai-music-generator" },
          { label: "Hum to Song", href: "/hum-to-song" },
          { label: "Arabic AI Music", href: "/arabic-ai-music-generator" },
        ],
      },
      finalCta: {
        title: "Start your next song",
        body: "Bring lyrics, melody, images, and voice into one focused creative space.",
        ctaLabel: "Open NabadAi",
        ctaHref: "/app/#/intro",
      },
    },
  ),
  "photo-to-song": seoPage(
    {
      seo: {
        title: "Photo to Song AI Generator | NabadAi",
        description:
          "Upload a photo and turn its mood into music. NabadAi reads visual atmosphere for style ideas, lyric direction, and song artwork.",
      },
      hero: {
        eyebrow: "Photo to song",
        title: "Turn a photo into a musical mood",
        lead:
          "A photo already carries a place, feeling, and story. Photo Mood helps translate that visual atmosphere into style ideas, lyric direction, and a song cover.",
        ctaLabel: "Open NabadAi",
        ctaHref: "/app/#/intro",
        secondaryLabel: "See how it works",
        secondaryHref: "#features",
        heroImageUrl: "/assets/marketing/seo-hero-device.png",
        heroImageAlt: "NabadAi app on iPhone — create songs, hum melodies, and more",
      },
      features: {
        eyebrow: "Create with NabadAi",
        title: "Flexible tools for your idea",
        cards: [
          { title: "Choose a photo", body: "Use a moment, landscape, portrait, or memory as the visual starting point." },
          { title: "Find the musical mood", body: "Analyze the scene for style tags and a lyric idea, or keep your existing lyrics and direction." },
          { title: "Use it as artwork", body: "Keep the original image as the song cover without changing the words or style." },
        ],
      },
      faq: {
        title: "Frequently asked questions",
        items: [
          { question: "Does analyzing a photo change my lyrics?", answerHtml: "It can suggest a lyric and style direction, but you stay in control and can edit or replace the result." },
          { question: "Can I use the photo only as cover art?", answerHtml: "Yes. You can attach the image as the cover without running analysis or changing the song details." },
          { question: "What kinds of photos work?", answerHtml: "Clear photos with a recognizable scene, subject, or atmosphere give the strongest creative context." },
        ],
      },
      related: {
        title: "Explore more ways to create",
        links: [
          { label: "AI Music Generator", href: "/ai-music-generator" },
          { label: "Lyrics to Song", href: "/lyrics-to-song" },
          { label: "Hum to Song", href: "/hum-to-song" },
        ],
      },
      finalCta: {
        title: "Start your next song",
        body: "Bring lyrics, melody, images, and voice into one focused creative space.",
        ctaLabel: "Open NabadAi",
        ctaHref: "/app/#/intro",
      },
    },
  ),
  "arabic-ai-music-generator": seoPage(
    {
      seo: {
        title: "Arabic AI Music Generator | NabadAi",
        description:
          "Create Arabic-language songs with lyrics, regional style, and vocal direction. NabadAi supports Arabic pop, maqam-inspired color, and dialect choices.",
      },
      hero: {
        eyebrow: "Arabic AI music",
        title: "Create Arabic songs with regional character",
        lead:
          "NabadAi brings Arabic lyrics and Middle Eastern musical direction into the same creative studio as hum, photo, voice, and full-song generation.",
        ctaLabel: "Open NabadAi",
        ctaHref: "/app/#/intro",
        secondaryLabel: "See how it works",
        secondaryHref: "#features",
        heroImageUrl: "/assets/marketing/seo-hero-device.png",
        heroImageAlt: "NabadAi app on iPhone — create songs, hum melodies, and more",
      },
      features: {
        eyebrow: "Create with NabadAi",
        title: "Flexible tools for your idea",
        cards: [
          { title: "Arabic lyric support", body: "Write your own Arabic lyrics or develop a draft, including regional dialect choices in supported flows." },
          { title: "Regional direction", body: "Guide the result with Arabic pop, traditional instruments, maqam-inspired color, mood, and vocal character." },
          { title: "One creative studio", body: "Move from lyrics or melody to artwork, playback, publishing, and creator discovery." },
        ],
      },
      faq: {
        title: "Frequently asked questions",
        items: [
          { question: "Can I create a full song in Arabic?", answerHtml: "Yes. Choose Arabic for lyrics and guide the musical style and vocal direction before generation." },
          { question: "Does NabadAi support Arabic dialects?", answerHtml: "Supported lyric tools include dialect direction such as Lebanese, Egyptian, Iraqi, Gulf, Moroccan, Syrian, and Palestinian." },
          { question: "Can I use maqam ideas?", answerHtml: "NabadAi includes maqam-inspired and regional style tools for creative guidance; generated results can vary." },
        ],
      },
      related: {
        title: "Explore more ways to create",
        links: [
          { label: "AI Music Generator", href: "/ai-music-generator" },
          { label: "Lyrics to Song", href: "/lyrics-to-song" },
          { label: "Hum to Song", href: "/hum-to-song" },
        ],
      },
      finalCta: {
        title: "Start your next song",
        body: "Bring lyrics, melody, images, and voice into one focused creative space.",
        ctaLabel: "Open NabadAi",
        ctaHref: "/app/#/intro",
      },
    },
    {
      seo: {
        title: "مولّد موسيقى عربية بالذكاء الاصطناعي | NabadAi",
        description: "أنشئ أغاني باللغة العربية مع كلمات وأسلوب إقليمي واتجاه صوتي — للمبدعين الذين يريدون نتيجة قابلة للمشاركة.",
      },
      hero: {
        eyebrow: "موسيقى عربية بالذكاء الاصطناعي",
        title: "أغاني عربية من أفكارك",
        lead: "أنشئ موسيقى باللغة العربية مع كلمات ومزاج واتجاه صوتي — في نفس الاستوديو الذي يدعم الهمهمة والصورة والصوت.",
        ctaLabel: "افتح NabadAi",
        secondaryLabel: "تعرّف إلى الأدوات",
      },
      related: {
        title: "اكتشف أدوات أخرى",
        links: [
          { label: "مولّد الموسيقى", href: "/ar/ai-music-generator" },
          { label: "الكلمات إلى أغنية", href: "/ar/lyrics-to-song" },
          { label: "من الهمهمة إلى أغنية", href: "/ar/hum-to-song" },
        ],
      },
    },
  ),
});

function defaultSeoContent(pageKey, locale) {
  const pack = SEO_DEFAULTS[pageKey];
  if (!pack) return null;
  const loc = locale === "ar" ? "ar" : "en";
  const base = pack.en;
  const overlay = pack[loc] || {};
  return deepMergeSeo(base, overlay);
}

function deepMergeSeo(base, overlay) {
  const out = JSON.parse(JSON.stringify(base));
  for (const key of Object.keys(overlay)) {
    const val = overlay[key];
    if (val && typeof val === "object" && !Array.isArray(val) && out[key] && typeof out[key] === "object") {
      out[key] = deepMergeSeo(out[key], val);
    } else if (val !== undefined) {
      out[key] = val;
    }
  }
  return out;
}

module.exports = {
  SEO_PAGE_KEYS: Object.freeze(Object.keys(SEO_DEFAULTS)),
  SEO_DEFAULTS,
  defaultSeoContent,
};
