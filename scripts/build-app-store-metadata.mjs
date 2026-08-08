#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const metadataRoot = path.join(root, "app-store", "metadata");

const locales = {
  "en-US": {
    name: "NabadAi: AI Music Maker",
    subtitle: "Hum, write & create songs",
    promotional_text:
      "Turn lyrics, a melody you hum, or a photo into a complete song. Shape the sound, save your voice as a Persona, and share what you create.",
    keywords:
      "lyrics,melody,voice,persona,Arabic,maqam,photo,remix,mashup,studio,beat,songwriter",
    description: `Turn an idea into a song with NabadAi, an AI music creation studio built for lyrics, melody, voice, artwork, and sharing.

CREATE YOUR WAY
• Write your own lyrics or develop an editable draft
• Describe a sound, mood, genre, or musical direction
• Hum a melody and use it to guide a new track
• Start with a photo and translate its mood into music
• Choose vocal or instrumental directions

YOUR VOICE AND YOUR SOUND
• Save a voice Persona for creative inspiration
• Explore vocal character, range, language, and style options
• Create cover art or use your own photo as the cover
• Play your songs in the background and from the lock screen

ARABIC MUSIC TOOLS
• Create with Arabic lyrics and regional style direction
• Explore dialect options in supported lyric flows
• Use maqam-inspired ideas and Middle Eastern musical color

CREATE, SHARE, CONNECT
• Publish finished songs to your creator profile
• Discover music made by the NabadAi community
• Follow creators, react, reply, remix, and mash up songs
• Keep private drafts on the device where you made them

NabadAi is for musicians, songwriters, and curious creators who want a focused path from inspiration to a finished track.

Generated results can vary. Rights and permitted uses may depend on your inputs, the output, and applicable terms.

Support: https://www.nabadai.com/support
Privacy: https://www.nabadai.com/privacy
Terms: https://www.nabadai.com/terms`,
    release_notes: `Welcome to NabadAi 1.0.3.

• Create songs from lyrics, a hum, or a photo
• Explore Arabic and regional music direction
• Save a voice Persona for future creations
• Publish songs, discover creators, and share with friends
• Improved cover art, playback, stability, and creator profiles`,
  },
  "ar-SA": {
    name: "NabadAi: صانع الأغاني",
    subtitle: "حوّل كلماتك ولحنك لموسيقى",
    promotional_text:
      "حوّل الكلمات أو الهمهمة أو الصورة إلى أغنية كاملة. وجّه الأسلوب، واحفظ صوتك كشخصية Persona، وشارك ما تصنعه.",
    keywords:
      "ذكاء اصطناعي,همهمة,لحن,كلمات,صوت,مقام,عربي,صورة,ريمكس,استوديو,موسيقى",
    description: `حوّل فكرتك إلى أغنية مع NabadAi، استوديو لصناعة الموسيقى بالذكاء الاصطناعي يجمع الكلمات واللحن والصوت والغلاف والمشاركة.

أنشئ بطريقتك
• اكتب كلماتك أو طوّر مسودة قابلة للتعديل
• صف الصوت أو المزاج أو النوع الموسيقي الذي تريده
• همهم لحناً واستخدمه كمرجع لمسار جديد
• ابدأ بصورة وحوّل إحساسها إلى اتجاه موسيقي
• اختر بين الاتجاه الغنائي أو الموسيقي

صوتك وأسلوبك
• احفظ شخصية صوتية Persona للإلهام في أعمالك القادمة
• استكشف طابع الصوت والمدى واللغة والأسلوب
• أنشئ غلافاً أو استخدم صورتك الخاصة
• استمع إلى أغانيك في الخلفية ومن شاشة القفل

أدوات للموسيقى العربية
• أنشئ باستخدام كلمات عربية واتجاهات موسيقية إقليمية
• استكشف توجيه اللهجات في مسارات الكلمات التي تدعم ذلك
• استخدم أفكاراً مستوحاة من المقامات والألوان الموسيقية الشرق أوسطية

أنشئ وشارك وتواصل
• انشر الأغاني المكتملة على ملفك كمبدع
• اكتشف موسيقى مجتمع NabadAi
• تابع المبدعين وتفاعل ورد وأعد المزج
• احتفظ بالمسودات الخاصة على الجهاز الذي أنشأتها عليه

NabadAi للموسيقيين وكتّاب الأغاني وكل من يريد طريقاً واضحاً من الإلهام إلى أغنية مكتملة.

قد تختلف النتائج المولّدة، وقد تعتمد الحقوق والاستخدامات المسموحة على المدخلات والنتيجة والشروط المطبقة.

الدعم: https://www.nabadai.com/support
الخصوصية: https://www.nabadai.com/privacy
الشروط: https://www.nabadai.com/terms`,
    release_notes: `مرحباً بك في NabadAi 1.0.3.

• أنشئ أغاني من الكلمات أو الهمهمة أو الصورة
• استكشف اتجاهات عربية وإقليمية
• احفظ شخصية صوتية Persona لأعمالك القادمة
• انشر الأغاني واكتشف المبدعين وشارك مع الأصدقاء
• تحسينات على الأغلفة والتشغيل والثبات والملفات الشخصية`,
  },
};

const common = {
  privacy_url: "https://www.nabadai.com/privacy",
  support_url: "https://www.nabadai.com/support",
  marketing_url: "https://www.nabadai.com/ai-music-generator",
};

for (const [locale, values] of Object.entries(locales)) {
  if (values.name.length > 30) throw new Error(`${locale} name exceeds 30 characters`);
  if (values.subtitle.length > 30) throw new Error(`${locale} subtitle exceeds 30 characters`);
  if (values.promotional_text.length > 170) {
    throw new Error(`${locale} promotional text exceeds 170 characters`);
  }
  if (values.keywords.length > 100) throw new Error(`${locale} keywords exceed 100 characters`);

  const dir = path.join(metadataRoot, locale);
  fs.mkdirSync(dir, { recursive: true });
  for (const [key, value] of Object.entries({ ...values, ...common })) {
    fs.writeFileSync(path.join(dir, `${key}.txt`), `${value.trim()}\n`);
  }
}

const captions = {
  "en-US": {
    "01-discover.png": "Discover music made by creators",
    "04-activity.png": "See every reaction in one place",
    "05-friends.png": "Share songs with your friends",
    "06-sounds.png": "Create sounds for any moment",
    "09-nabad-coach.png": "Get feedback from your AI music coach",
    "10-song-player.png": "Play, remix, and make it yours",
  },
  "ar-SA": {
    "01-discover.png": "اكتشف موسيقى يصنعها المبدعون",
    "04-activity.png": "تابع كل تفاعل في مكان واحد",
    "05-friends.png": "شارك الأغاني مع أصدقائك",
    "06-sounds.png": "أنشئ أصواتاً لكل لحظة",
    "09-nabad-coach.png": "طوّر موسيقاك مع مدرب NabadAi",
    "10-song-player.png": "استمع وأعد المزج بطريقتك",
  },
};
const appStoreRoot = path.join(root, "app-store");
fs.mkdirSync(appStoreRoot, { recursive: true });
fs.writeFileSync(
  path.join(appStoreRoot, "screenshot-captions.json"),
  `${JSON.stringify(captions, null, 2)}\n`,
);

console.log("build-app-store-metadata: generated en-US and ar-SA metadata");
for (const [locale, values] of Object.entries(locales)) {
  console.log(
    `build-app-store-metadata: ${locale} name=${values.name.length}/30 subtitle=${values.subtitle.length}/30 keywords=${values.keywords.length}/100`,
  );
}
