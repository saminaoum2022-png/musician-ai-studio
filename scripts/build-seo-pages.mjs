#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origin = "https://www.nabadai.com";
const image = `${origin}/assets/marketing/nabadai-social-card.png`;
const heroDeviceWidth = 2560;
const heroDeviceHeight = 1440;

function heroImageSrc(slug, locale = "en") {
  return `/api/marketing/hero-image?page=${encodeURIComponent(slug)}&locale=${encodeURIComponent(locale)}`;
}

const pages = [
  {
    slug: "ai-music-generator",
    title: "AI Music Generator & Song Maker | NabadAi",
    description: "Create complete songs from lyrics, a hum, or a photo with NabadAi's AI music generator. Shape the style, voice, artwork, and mood.",
    eyebrow: "AI music creation",
    h1: "Turn your idea into a complete song",
    intro: "NabadAi is an AI music generator built for the whole creative path: start with words, a melody you hum, or a photo, then shape the sound and share what you make.",
    features: [
      ["Start your way", "Write lyrics, describe a sound, hum a melody, or begin with a photo mood."],
      ["Shape the result", "Choose vocal direction, genre, mood, artwork style, and the details that make the song yours."],
      ["Create and connect", "Keep drafts on your device, publish finished songs, and discover what other creators are making."],
    ],
    faqs: [
      ["What is an AI music generator?", "It is a creative tool that turns instructions such as lyrics, mood, style, or melody references into generated music."],
      ["Can I use my own lyrics?", "Yes. You can write your own lyrics, generate a draft, edit it, and pair it with your chosen musical direction."],
      ["Can NabadAi create vocals and instrumentals?", "Yes. Song creation supports vocal and instrumental directions, depending on the flow and options you choose."],
    ],
    related: ["hum-to-song", "lyrics-to-song", "photo-to-song", "arabic-ai-music-generator"],
  },
  {
    slug: "hum-to-song",
    title: "Hum to Song AI Melody Generator | NabadAi",
    description: "Record or upload a hum and turn your melody idea into music. Use NabadAi to shape a hummed tune into an instrumental or complete song.",
    eyebrow: "Hum to song",
    h1: "Hum the melody. Build the song.",
    intro: "When the tune arrives before the words, capture it. NabadAi lets you record or upload a short hum and use that melody as the starting point for a new track.",
    features: [
      ["Capture the idea", "Record a short melody while it is fresh, or upload a hum you already saved."],
      ["Choose the direction", "Turn the melody into a solo instrumental or use it as guidance for a fuller song."],
      ["Keep creating", "Add style, lyrics, artwork, and a title when you are ready to develop the idea further."],
    ],
    faqs: [
      ["How long should my hum be?", "A clear 15–30 second phrase works well. A quiet room and a steady melody help the system follow your idea."],
      ["Do I need to sing words?", "No. A simple hum is enough for the melody flow; words can be added separately if you want a vocal song."],
      ["Can I upload a recording?", "Yes. You can upload an existing melody guide when recording directly is not convenient."],
    ],
    related: ["ai-music-generator", "lyrics-to-song", "photo-to-song"],
  },
  {
    slug: "lyrics-to-song",
    title: "Lyrics to Song AI Generator | NabadAi",
    description: "Turn your lyrics into a complete AI-generated song. Edit the words, choose a musical style and vocal direction, then create with NabadAi.",
    eyebrow: "Lyrics to song",
    h1: "Give your lyrics a voice",
    intro: "Bring a chorus, verse, or full lyric draft into NabadAi and hear it in a musical setting. You control the words and guide the style, mood, and vocal character.",
    features: [
      ["Write or generate", "Start with your own lyrics or ask for a draft, then edit every line before creating."],
      ["Direct the sound", "Choose genre, energy, vocal range, language, and musical references that fit the words."],
      ["Finish the release", "Create cover art, save the result, and publish when you decide the song is ready."],
    ],
    faqs: [
      ["Can I edit generated lyrics?", "Yes. Lyrics remain editable so you can rewrite lines, structure sections, and keep your own voice."],
      ["Does NabadAi support Arabic lyrics?", "Yes. Arabic is available alongside English and other language choices, with regional music options in the creative tools."],
      ["Can I make an instrumental instead?", "Yes. Choose an instrumental direction when you want music without a sung lyric."],
    ],
    related: ["ai-music-generator", "hum-to-song", "arabic-ai-music-generator"],
  },
  {
    slug: "photo-to-song",
    title: "Photo to Song AI Music Generator | NabadAi",
    description: "Turn a photo mood into music with NabadAi. Analyze the image for song ideas, style and lyrics, and optionally use it as the cover art.",
    eyebrow: "Photo to song",
    h1: "Turn a photo into a musical mood",
    intro: "A photo already carries a place, feeling, and story. Photo Mood helps translate that visual atmosphere into style ideas, lyric direction, and a song cover.",
    features: [
      ["Choose a photo", "Use a moment, landscape, portrait, or memory as the visual starting point."],
      ["Find the musical mood", "Analyze the scene for style tags and a lyric idea, or keep your existing lyrics and direction."],
      ["Use it as artwork", "Keep the original image as the song cover without changing the words or style."],
    ],
    faqs: [
      ["Does analyzing a photo change my lyrics?", "It can suggest a lyric and style direction, but you stay in control and can edit or replace the result."],
      ["Can I use the photo only as cover art?", "Yes. You can attach the image as the cover without running analysis or changing the song details."],
      ["What kinds of photos work?", "Clear photos with a recognizable scene, subject, or atmosphere give the strongest creative context."],
    ],
    related: ["ai-music-generator", "lyrics-to-song", "hum-to-song"],
  },
  {
    slug: "arabic-ai-music-generator",
    title: "Arabic AI Music & Song Generator | NabadAi",
    description: "Create Arabic AI songs with lyrics, regional style direction, maqam-inspired ideas and vocal options. Build and share music with NabadAi.",
    eyebrow: "Arabic AI music",
    h1: "Create Arabic songs with regional character",
    intro: "NabadAi brings Arabic lyrics and Middle Eastern musical direction into the same creative studio as hum, photo, voice, and full-song generation.",
    features: [
      ["Arabic lyric support", "Write your own Arabic lyrics or develop a draft, including regional dialect choices in supported flows."],
      ["Regional direction", "Guide the result with Arabic pop, traditional instruments, maqam-inspired color, mood, and vocal character."],
      ["One creative studio", "Move from lyrics or melody to artwork, playback, publishing, and creator discovery."],
    ],
    faqs: [
      ["Can I create a full song in Arabic?", "Yes. Choose Arabic for lyrics and guide the musical style and vocal direction before generation."],
      ["Does NabadAi support Arabic dialects?", "Supported lyric tools include dialect direction such as Lebanese, Egyptian, Iraqi, Gulf, Moroccan, Syrian, and Palestinian."],
      ["Can I use maqam ideas?", "NabadAi includes maqam-inspired and regional style tools for creative guidance; generated results can vary."],
    ],
    related: ["ai-music-generator", "lyrics-to-song", "hum-to-song"],
  },
];

const arPages = [
  {
    slug: "ai-music-generator",
    title: "مولد موسيقى وأغاني بالذكاء الاصطناعي | NabadAi",
    description: "أنشئ أغنية كاملة من كلمات أو همهمة أو صورة مع NabadAi، وحدد الأسلوب والصوت والغلاف والمزاج الموسيقي الذي تريده.",
    eyebrow: "صناعة الموسيقى بالذكاء الاصطناعي",
    h1: "حوّل فكرتك إلى أغنية كاملة",
    intro: "NabadAi استوديو موسيقي بالذكاء الاصطناعي يرافقك من الفكرة الأولى إلى الأغنية: ابدأ بكلمات أو همهمة أو صورة، ثم وجّه الأسلوب والصوت وشارك ما تصنعه.",
    features: [
      ["ابدأ بطريقتك", "اكتب كلماتك، صف الإحساس المطلوب، همهم لحناً، أو استخدم صورة كبداية."],
      ["وجّه النتيجة", "اختر نوع الصوت والأسلوب والمزاج واتجاه الغلاف والتفاصيل التي تعبّر عن فكرتك."],
      ["أنشئ وشارك", "احتفظ بمسوداتك على جهازك، وانشر الأغاني التي تختارها واكتشف أعمال المبدعين."],
    ],
    faqs: [
      ["ما هو مولد الموسيقى بالذكاء الاصطناعي؟", "هو أداة إبداعية تحوّل تعليمات مثل الكلمات والمزاج والأسلوب واللحن المرجعي إلى موسيقى مولّدة."],
      ["هل أستطيع استخدام كلماتي الخاصة؟", "نعم. يمكنك كتابة كلماتك أو توليد مسودة ثم تعديلها قبل اختيار الاتجاه الموسيقي."],
      ["هل يمكن إنشاء أغنية بصوت أو موسيقى فقط؟", "نعم. يمكنك اختيار اتجاه غنائي أو موسيقي بحسب مسار الإنشاء والخيارات المتاحة."],
    ],
    related: ["hum-to-song", "lyrics-to-song", "photo-to-song", "arabic-ai-music-generator"],
  },
  {
    slug: "hum-to-song",
    title: "تحويل الهمهمة إلى لحن وأغنية | NabadAi",
    description: "سجّل همهمة قصيرة أو ارفعها، ثم حوّل فكرتك اللحنية إلى موسيقى أو أغنية مع أدوات NabadAi لصناعة الموسيقى.",
    eyebrow: "من الهمهمة إلى أغنية",
    h1: "همهم اللحن وابنِ الأغنية",
    intro: "أحياناً يأتي اللحن قبل الكلمات. سجّل الفكرة فوراً أو ارفع تسجيلاً محفوظاً، واستخدم الهمهمة كنقطة انطلاق لمقطوعة أو أغنية جديدة.",
    features: [
      ["التقط الفكرة", "سجّل جملة لحنية قصيرة في مكان هادئ أو ارفع تسجيلاً لديك."],
      ["اختر الاتجاه", "حوّل اللحن إلى عزف منفرد أو استخدمه كمرجع لأغنية أكثر اكتمالاً."],
      ["أكمل العمل", "أضف الأسلوب والكلمات والغلاف والعنوان عندما تصبح الفكرة جاهزة للتطوير."],
    ],
    faqs: [
      ["ما المدة المناسبة للهمهمة؟", "جملة واضحة مدتها بين 15 و30 ثانية مناسبة عادةً، مع لحن ثابت وضوضاء قليلة."],
      ["هل يجب أن أغني كلمات؟", "لا. تكفي همهمة بسيطة لمسار اللحن، ويمكن إضافة الكلمات لاحقاً إذا أردت أغنية غنائية."],
      ["هل أستطيع رفع تسجيل جاهز؟", "نعم. يمكنك رفع ملف همهمة محفوظ بدلاً من التسجيل المباشر."],
    ],
    related: ["ai-music-generator", "lyrics-to-song", "photo-to-song"],
  },
  {
    slug: "lyrics-to-song",
    title: "تحويل الكلمات إلى أغنية بالذكاء الاصطناعي | NabadAi",
    description: "حوّل كلماتك إلى أغنية كاملة، وعدّل النص واختر الأسلوب الموسيقي واتجاه الصوت واللغة قبل الإنشاء مع NabadAi.",
    eyebrow: "من الكلمات إلى أغنية",
    h1: "امنح كلماتك صوتاً وموسيقى",
    intro: "أدخل لازمة أو مقطعاً أو نصاً كاملاً، ثم اسمعه في قالب موسيقي تختاره. أنت تتحكم بالكلمات وتوجّه الأسلوب والمزاج والصوت.",
    features: [
      ["اكتب أو ولّد مسودة", "ابدأ بكلماتك أو اطلب مسودة، ثم عدّل كل سطر وبنية الأغنية."],
      ["حدّد اللون الموسيقي", "اختر النوع والطاقة واللغة واتجاه الصوت والمراجع المناسبة للكلمات."],
      ["أكمل الأغنية", "أنشئ الغلاف واحفظ النتيجة وانشرها عندما ترى أنها جاهزة."],
    ],
    faqs: [
      ["هل يمكن تعديل الكلمات المولّدة؟", "نعم. يمكنك إعادة كتابة السطور وترتيب المقاطع والحفاظ على أسلوبك الخاص."],
      ["هل يدعم NabadAi الكلمات العربية؟", "نعم. تتوفر العربية مع خيارات لغوية واتجاهات موسيقية إقليمية ضمن أدوات الإنشاء."],
      ["هل يمكن إنشاء موسيقى بلا غناء؟", "نعم. اختر المسار الموسيقي عندما تريد مقطوعة من دون كلمات مغناة."],
    ],
    related: ["ai-music-generator", "hum-to-song", "arabic-ai-music-generator"],
  },
  {
    slug: "photo-to-song",
    title: "تحويل الصورة إلى أغنية وموسيقى | NabadAi",
    description: "حوّل إحساس الصورة إلى موسيقى مع NabadAi، واستخرج أفكاراً للأسلوب والكلمات أو استخدم الصورة نفسها كغلاف للأغنية.",
    eyebrow: "من الصورة إلى أغنية",
    h1: "حوّل إحساس الصورة إلى موسيقى",
    intro: "تحمل الصورة مكاناً وشعوراً وحكاية. يساعدك Photo Mood على ترجمة هذا الجو إلى أفكار للأسلوب والكلمات وغلاف الأغنية.",
    features: [
      ["اختر الصورة", "ابدأ بلحظة أو منظر أو بورتريه أو ذكرى تحمل جواً واضحاً."],
      ["اكتشف المزاج الموسيقي", "حلّل المشهد للحصول على اتجاه أسلوبي وفكرة للكلمات، أو احتفظ بتفاصيلك الحالية."],
      ["استخدمها كغلاف", "اجعل الصورة غلافاً للأغنية من دون تغيير الكلمات أو الأسلوب."],
    ],
    faqs: [
      ["هل يغيّر تحليل الصورة كلماتي؟", "قد يقترح اتجاهاً للكلمات والأسلوب، لكن يمكنك تعديل النتيجة أو استبدالها بالكامل."],
      ["هل أستطيع استخدام الصورة كغلاف فقط؟", "نعم. يمكنك إرفاقها كغلاف من دون تحليل أو تغيير تفاصيل الأغنية."],
      ["ما الصور الأنسب؟", "الصور الواضحة التي تحمل مشهداً أو موضوعاً أو إحساساً محدداً تمنح سياقاً إبداعياً أفضل."],
    ],
    related: ["ai-music-generator", "lyrics-to-song", "hum-to-song"],
  },
  {
    slug: "arabic-ai-music-generator",
    title: "مولد أغاني عربية بالذكاء الاصطناعي | NabadAi",
    description: "أنشئ أغاني عربية بكلمات واتجاهات إقليمية وأفكار مستوحاة من المقامات وخيارات صوتية ضمن استوديو NabadAi.",
    eyebrow: "موسيقى عربية بالذكاء الاصطناعي",
    h1: "أنشئ أغاني عربية بروح إقليمية",
    intro: "يجمع NabadAi الكلمات العربية والاتجاه الموسيقي الشرق أوسطي مع أدوات الهمهمة والصورة والصوت وإنشاء الأغنية الكاملة.",
    features: [
      ["دعم الكلمات العربية", "اكتب كلماتك أو طوّر مسودة مع توجيه للهجة في المسارات التي تدعم ذلك."],
      ["اتجاه موسيقي إقليمي", "وجّه النتيجة نحو البوب العربي والآلات التقليدية والألوان المستوحاة من المقامات."],
      ["استوديو واحد", "انتقل من الكلمات أو اللحن إلى الغلاف والاستماع والنشر واكتشاف المبدعين."],
    ],
    faqs: [
      ["هل يمكن إنشاء أغنية كاملة بالعربية؟", "نعم. اختر العربية للكلمات وحدد الأسلوب واتجاه الصوت قبل الإنشاء."],
      ["هل تتوفر لهجات عربية؟", "تتضمن أدوات الكلمات توجيهاً للهجات مثل اللبنانية والمصرية والعراقية والخليجية والمغربية والسورية والفلسطينية."],
      ["هل يمكن استخدام أفكار المقامات؟", "توجد أدوات مستوحاة من المقامات والأساليب الإقليمية للتوجيه الإبداعي، وقد تختلف النتائج المولّدة."],
    ],
    related: ["ai-music-generator", "lyrics-to-song", "hum-to-song"],
  },
];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function labelFor(slug, lang) {
  const en = {
    "ai-music-generator": "AI Music Generator",
    "hum-to-song": "Hum to Song",
    "lyrics-to-song": "Lyrics to Song",
    "photo-to-song": "Photo to Song",
    "arabic-ai-music-generator": "Arabic AI Music",
  };
  const ar = {
    "ai-music-generator": "مولد الموسيقى",
    "hum-to-song": "الهمهمة إلى أغنية",
    "lyrics-to-song": "الكلمات إلى أغنية",
    "photo-to-song": "الصورة إلى أغنية",
    "arabic-ai-music-generator": "أغاني عربية",
  };
  return (lang === "ar" ? ar : en)[slug];
}

function renderPage(page, lang) {
  const isAr = lang === "ar";
  const pathName = isAr ? `/ar/${page.slug}` : `/${page.slug}`;
  const alternate = isAr ? `/${page.slug}` : `/ar/${page.slug}`;
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faqs.map(([name, text]) => ({
      "@type": "Question",
      name,
      acceptedAnswer: { "@type": "Answer", text },
    })),
  };
  const appSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "NabadAi Music",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web, iOS",
    url: `${origin}${pathName}`,
    description: page.description,
  };
  const related = page.related
    .map((slug) => {
      const href = isAr ? `/ar/${slug}` : `/${slug}`;
      return `<a href="${href}">${escapeHtml(labelFor(slug, lang))}</a>`;
    })
    .join("");
  const features = page.features
    .map(([title, text]) => `<article class="featureCard"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></article>`)
    .join("");
  const faqs = page.faqs
    .map(([title, text]) => `<article class="faqItem"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></article>`)
    .join("");
  const navLabel = isAr ? "صفحات الإنشاء" : "Create with NabadAi";
  const openLabel = isAr ? "افتح NabadAi" : "Open NabadAi";
  const featuresLabel = isAr ? "أدوات مرنة لفكرتك" : "Flexible tools for your idea";
  const faqLabel = isAr ? "أسئلة شائعة" : "Frequently asked questions";
  const relatedLabel = isAr ? "اكتشف أدوات أخرى" : "Explore more ways to create";
  const finalTitle = isAr ? "ابدأ أغنيتك التالية" : "Start your next song";
  const finalText = isAr
    ? "اجمع الكلمات واللحن والصورة والصوت في مساحة إبداعية واحدة."
    : "Bring lyrics, melody, images, and voice into one focused creative space.";

  return `<!doctype html>
<html lang="${lang}"${isAr ? ' dir="rtl"' : ""}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="color-scheme" content="dark">
  <meta name="theme-color" content="#05070d">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Display:wght@800;900&family=Inter:wght@400;600;700;800&display=swap">
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeHtml(page.description)}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <link rel="canonical" href="${origin}${pathName}">
  <link rel="alternate" hreflang="en" href="${origin}${isAr ? alternate : pathName}">
  <link rel="alternate" hreflang="ar" href="${origin}${isAr ? pathName : alternate}">
  <link rel="alternate" hreflang="x-default" href="${origin}/${page.slug}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="NabadAi">
  <meta property="og:locale" content="${isAr ? "ar_AR" : "en_US"}">
  <meta property="og:url" content="${origin}${pathName}">
  <meta property="og:title" content="${escapeHtml(page.title)}">
  <meta property="og:description" content="${escapeHtml(page.description)}">
  <meta property="og:image" content="${image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="NabadAi AI music studio">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(page.title)}">
  <meta name="twitter:description" content="${escapeHtml(page.description)}">
  <meta name="twitter:image" content="${image}">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="stylesheet" href="/marketing.css">
  <script type="application/ld+json">${JSON.stringify(faqSchema)}</script>
  <script type="application/ld+json">${JSON.stringify(appSchema)}</script>
</head>
<body>
  <div class="marketingShell">
    <nav class="marketingNav" aria-label="${navLabel}">
      <a class="marketingBrand" href="${isAr ? "/ar" : "/"}" aria-label="NabadAi">
        <span class="marketingBrandMark" aria-hidden="true"></span>
        <span class="marketingBrandName">NabadAi</span>
      </a>
      <div class="marketingNavLinks">
        <a class="marketingLangSwitch" href="${alternate}" lang="${isAr ? "en" : "ar"}" hreflang="${isAr ? "en" : "ar"}" aria-label="${isAr ? "Switch to English" : "التبديل إلى العربية"}">${isAr ? "English" : "العربية"}</a>
        <a class="marketingCta" href="/#/intro">${openLabel}</a>
      </div>
    </nav>
    <main>
      <section class="hero">
        <div class="heroCopy">
          <p class="eyebrow">${escapeHtml(page.eyebrow)}</p>
          <h1>${escapeHtml(page.h1)}</h1>
          <p class="heroLead">${escapeHtml(page.intro)}</p>
          <div class="heroActions">
            <a class="marketingCta" href="/#/intro">${openLabel}</a>
            <a class="textLink" href="#features">${isAr ? "تعرّف إلى الأدوات" : "See how it works"}</a>
          </div>
        </div>
        <div class="marketingHeroArt"><img src="${heroImageSrc(page.slug, isAr ? "ar" : "en")}" width="${heroDeviceWidth}" height="${heroDeviceHeight}" alt="${isAr ? "واجهة NabadAi لإنشاء الموسيقى" : "NabadAi app on iPhone — create songs, hum melodies, and more"}"></div>
      </section>
      <section class="section" id="features">
        <header class="sectionHead"><p class="eyebrow">${navLabel}</p><h2>${featuresLabel}</h2></header>
        <div class="featureGrid">${features}</div>
      </section>
      <section class="section">
        <header class="sectionHead"><h2>${faqLabel}</h2></header>
        <div class="faqList">${faqs}</div>
      </section>
      <section class="section">
        <header class="sectionHead"><h2>${relatedLabel}</h2></header>
        <nav class="relatedLinks" aria-label="${relatedLabel}">${related}</nav>
      </section>
      <section class="finalCta"><h2>${finalTitle}</h2><p>${finalText}</p><a class="marketingCta" href="/#/intro">${openLabel}</a></section>
    </main>
    <footer class="marketingFooter"><span>© 2026 NabadAi</span><nav><a href="/privacy">${isAr ? "الخصوصية" : "Privacy"}</a><a href="/terms">${isAr ? "الشروط" : "Terms"}</a><a href="mailto:help@nabadai.com">${isAr ? "الدعم" : "Support"}</a></nav></footer>
  </div>
</body>
</html>
`;
}

for (const page of pages) {
  fs.writeFileSync(path.join(root, `${page.slug}.html`), renderPage(page, "en"));
}
fs.mkdirSync(path.join(root, "ar"), { recursive: true });
for (const page of arPages) {
  fs.writeFileSync(path.join(root, "ar", `${page.slug}.html`), renderPage(page, "ar"));
}
fs.writeFileSync(
  path.join(root, "ar", "index.html"),
  renderPage(arPages[0], "ar").replaceAll(
    `${origin}/ar/ai-music-generator`,
    `${origin}/ar`,
  ),
);

console.log(`build-seo-pages: generated ${pages.length + arPages.length + 1} pages`);
