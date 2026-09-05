/**
 * First-song prompt seeds — random prompt + style per language (no prefilled lyrics).
 */

export const FIRST_SONG_ICON_URLS = {
  love: "https://cdn.jsdelivr.net/npm/lucide-static@0.471.0/icons/heart.svg",
  apology: "https://cdn.jsdelivr.net/npm/lucide-static@0.471.0/icons/message-circle-heart.svg",
  dabke: "https://cdn.jsdelivr.net/npm/lucide-static@0.471.0/icons/music-2.svg",
  custom: "https://cdn.jsdelivr.net/npm/lucide-static@0.471.0/icons/pen-line.svg",
};

const LAST_SEED_KEY = "nabad_first_song_last_seed_v1";

/** @typedef {{ id: string, title: Record<string,string>, prompt: Record<string,string>, style: Record<string,string>, artworkTags: string[] }} FirstSongSeed */

/** @type {Record<string, FirstSongSeed[]>} */
export const FIRST_SONG_THEME_SEEDS = {
  love: [
    {
      id: "love-01",
      title: { english: "Missing you", arabic: "مشتاقلك", french: "Tu me manques" },
      prompt: {
        english: "A romantic pop song about missing someone you love and wanting them back",
        arabic: "أغنية pop رومانسية عن الحنين لشخص بتحبّو وبدّك يرجعلك",
        french: "Une chanson pop romantique sur quelqu'un qui manque et l'envie de le revoir",
      },
      style: {
        english: "Romantic pop, warm synth pads, intimate vocal, longing mood, 88 BPM",
        arabic: "Arabic pop romantic, Levantine vocal, warm oud accents, heartfelt, 90 BPM",
        french: "French pop chanson, romantic piano, soft vocal, 84 BPM",
      },
      artworkTags: ["Romantic", "Dreamy", "Golden hour"],
    },
    {
      id: "love-02",
      title: { english: "Close to you", arabic: "قريب منك", french: "Près de toi" },
      prompt: {
        english: "A tender love song about feeling at home when you're with someone special",
        arabic: "أغنية حبّ حنونة عن الإحساس بالأمان لما تكون جنب حبيبك",
        french: "Une chanson tendre sur le sentiment d'être chez soi auprès de l'être aimé",
      },
      style: {
        english: "Soft R&B pop, gentle piano, close-mic vocal, 82 BPM",
        arabic: "Arabic R&B pop, smooth bass, intimate Levantine vocal, 86 BPM",
        french: "Chanson pop douce, guitare acoustique, voix chaude, 80 BPM",
      },
      artworkTags: ["Intimate", "Warm glow", "City night"],
    },
    {
      id: "love-03",
      title: { english: "Under the stars", arabic: "تحت النجوم", french: "Sous les étoiles" },
      prompt: {
        english: "A dreamy love song about two people falling in love under the night sky",
        arabic: "أغنية حبّ حالمة عن ليلة تحت النجوم وقلوب عم تنبض سوا",
        french: "Une chanson rêveuse sur un amour né sous un ciel étoilé",
      },
      style: {
        english: "Dreamy pop, shimmering guitars, airy vocals, 94 BPM",
        arabic: "Arabic pop dreamy, soft darbuka, airy Levantine vocal, 92 BPM",
        french: "Pop onirique, synthés légers, voix aérienne, 90 BPM",
      },
      artworkTags: ["Starry sky", "Soft blur", "Cinematic"],
    },
    {
      id: "love-04",
      title: { english: "First glance", arabic: "أول نظرة", french: "Premier regard" },
      prompt: {
        english: "An upbeat romantic pop song about love at first sight and a catchy chorus",
        arabic: "أغنية pop مبهجة عن أول نظرة حبّ وكراس catchy",
        french: "Une pop joyeuse sur le coup de foudre et un refrain entraînant",
      },
      style: {
        english: "Upbeat romantic pop, bright keys, catchy hook, 102 BPM",
        arabic: "Arabic pop upbeat, modern drums, catchy Levantine hook, 100 BPM",
        french: "Pop française entraînante, clavier lumineux, 98 BPM",
      },
      artworkTags: ["Bright", "Youthful", "Sunset"],
    },
    {
      id: "love-05",
      title: { english: "Long distance", arabic: "بعد المسافات", french: "Longue distance" },
      prompt: {
        english: "An emotional song about long-distance love and waiting to reunite",
        arabic: "أغنية عاطفية عن حبّ عن بعد وانتظار اللقاء",
        french: "Une chanson émouvante sur l'amour à distance et l'attente des retrouvailles",
      },
      style: {
        english: "Emotional pop ballad, muted beats, vulnerable vocal, 78 BPM",
        arabic: "Arabic ballad pop, emotional oud, vulnerable vocal, 76 BPM",
        french: "Ballade pop émotionnelle, cordes douces, 74 BPM",
      },
      artworkTags: ["Midnight", "Minimal", "Phone glow"],
    },
    {
      id: "love-06",
      title: { english: "Hold me slow", arabic: "احضني", french: "Serre-moi" },
      prompt: {
        english: "A slow romantic jam about dancing slow and not wanting the night to end",
        arabic: "أغنية رومانسية بطيئة عن رقصة هادئة وليلة ما بدنا تخلص",
        french: "Une romance lente sur une danse qui dure toute la nuit",
      },
      style: {
        english: "Slow jam pop, Rhodes keys, silky vocal, 76 BPM",
        arabic: "Arabic slow jam, warm keys, silky Levantine vocal, 78 BPM",
        french: "Slow jam chanson, piano Rhodes, voix soyeuse, 75 BPM",
      },
      artworkTags: ["Vintage film", "Cozy", "Amber light"],
    },
    {
      id: "love-07",
      title: { english: "Back to us", arabic: "ارجع لنا", french: "Retour à nous" },
      prompt: {
        english: "A hopeful love song about fixing a relationship and starting again together",
        arabic: "أغنية أمل عن إصلاح علاقة والبداية من جديد سوا",
        french: "Une chanson d'espoir sur reconstruire une relation à deux",
      },
      style: {
        english: "Anthemic pop ballad, rising chorus, emotional strings, 84 BPM",
        arabic: "Arabic pop anthem, emotional strings, powerful chorus, 86 BPM",
        french: "Ballade pop anthemique, montée orchestrale, 82 BPM",
      },
      artworkTags: ["Epic", "Sunrise", "Hope"],
    },
    {
      id: "love-08",
      title: { english: "Your name", arabic: "اسمك", french: "Ton nom" },
      prompt: {
        english: "A passionate pop song about saying someone's name and meaning every word",
        arabic: "أغنية pop شغوفة عن قول اسم الحبيب وكل كلمة من القلب",
        french: "Une chanson passionnée sur prononcer son nom avec sincérité",
      },
      style: {
        english: "Passionate pop, punchy drums, bold vocal, 96 BPM",
        arabic: "Arabic pop passion, punchy Levantine drums, bold vocal, 94 BPM",
        french: "Pop passionnée, batterie punchy, voix affirmée, 92 BPM",
      },
      artworkTags: ["Bold", "Neon soft", "Portrait"],
    },
    {
      id: "love-09",
      title: { english: "Summer love", arabic: "حبّ الصيف", french: "Amour d'été" },
      prompt: {
        english: "A feel-good summer love song with beach vibes and a sing-along chorus",
        arabic: "أغنية صيفية مبهجة عن حبّ الصيف وكراس يرنّمها الكل",
        french: "Une chanson d'été feel-good avec un refrain à chanter ensemble",
      },
      style: {
        english: "Summer pop, bright guitars, feel-good groove, 108 BPM",
        arabic: "Arabic summer pop, bright percussion, feel-good Levantine, 106 BPM",
        french: "Pop estivale, guitares lumineuses, groove solaire, 104 BPM",
      },
      artworkTags: ["Summer", "Beach", "Golden hour"],
    },
    {
      id: "love-10",
      title: { english: "Forever mine", arabic: "لعمرك", french: "Pour toujours" },
      prompt: {
        english: "A wedding-ready love song about choosing each other forever",
        arabic: "أغنية حبّ للعرس عن اختيار بعض للأبد",
        french: "Une chanson d'amour pour un oui à vie et pour toujours",
      },
      style: {
        english: "Wedding pop ballad, strings, joyful climax, 88 BPM",
        arabic: "Arabic wedding pop, festive strings, joyful Levantine vocal, 90 BPM",
        french: "Ballade de mariage, cordes festives, climax joyeux, 86 BPM",
      },
      artworkTags: ["Wedding", "Gold", "Celebration"],
    },
    {
      id: "love-11",
      title: { english: "Whisper", arabic: "همسة", french: "Murmure" },
      prompt: {
        english: "An intimate love song with soft verses and a big emotional chorus",
        arabic: "أغنية حبّ حميمة، couplets هادئة وكراس مليانة شعور",
        french: "Une chanson intime, couplets doux et refrain plein d'émotion",
      },
      style: {
        english: "Indie pop romance, airy production, 92 BPM",
        arabic: "Arabic indie pop, airy production, intimate vocal, 90 BPM",
        french: "Indie pop romantique, production aérée, 88 BPM",
      },
      artworkTags: ["Indie", "Pastel", "Soft focus"],
    },
  ],
  apology: [
    {
      id: "sorry-01",
      title: { english: "I'm sorry", arabic: "آسف", french: "Pardon" },
      prompt: {
        english: "A sincere apology song asking for forgiveness after hurting someone you love",
        arabic: "أغنية اعتذار صادقة طالبة سامح بعد ما وجّعت حدا بتحبّو",
        french: "Une chanson d'excuses sincère pour demander pardon à quelqu'un qu'on aime",
      },
      style: {
        english: "Emotional pop ballad, piano-led, sincere vocal, 74 BPM",
        arabic: "Arabic apology ballad, piano and oud, sincere Levantine vocal, 76 BPM",
        french: "Ballade pop sincère, piano dominant, voix vulnérable, 72 BPM",
      },
      artworkTags: ["Soft rain", "Minimal", "Honest"],
    },
    {
      id: "sorry-02",
      title: { english: "Forgive me", arabic: "سامحني", french: "Pardonne-moi" },
      prompt: {
        english: "A heartfelt song about pride, regret, and wanting a second chance",
        arabic: "أغنية عن الندم والكبرياء وطلب فرصة تانية",
        french: "Une chanson sur le regret, l'orgueil et le désir d'une seconde chance",
      },
      style: {
        english: "Sparse ballad, warm strings, vulnerable tone, 72 BPM",
        arabic: "Arabic emotional ballad, warm strings, vulnerable vocal, 74 BPM",
        french: "Ballade épurée, cordes chaudes, 70 BPM",
      },
      artworkTags: ["Muted", "Grey blue", "Quiet room"],
    },
    {
      id: "sorry-03",
      title: { english: "Take me back", arabic: "ارجعني", french: "Ramène-moi" },
      prompt: {
        english: "A pleading apology pop song about making things right again",
        arabic: "أغنية pop اعتذار ملتسمة عن إصلاح الخطأ والرجوع",
        french: "Une pop suppliante pour réparer les erreurs et revenir",
      },
      style: {
        english: "Pop apology, soft beats, pleading chorus, 86 BPM",
        arabic: "Arabic pop apology, soft tabla, pleading Levantine chorus, 84 BPM",
        french: "Pop d'excuses, rythme doux, refrain suppliant, 82 BPM",
      },
      artworkTags: ["Night drive", "Regret", "Neon dim"],
    },
    {
      id: "sorry-04",
      title: { english: "Empty chair", arabic: "كرسي فاضي", french: "Chaise vide" },
      prompt: {
        english: "A raw acoustic apology about loneliness after pushing someone away",
        arabic: "أغنية اعتذار acoustic عن الوحدة بعد ما بعادت حدا عنك",
        french: "Une excuse acoustique sur la solitude après avoir repoussé l'autre",
      },
      style: {
        english: "Acoustic pop ballad, fingerpicked guitar, raw vocal, 70 BPM",
        arabic: "Arabic acoustic ballad, oud and guitar, raw vocal, 72 BPM",
        french: "Ballade acoustique, guitare fingerpick, voix brute, 68 BPM",
      },
      artworkTags: ["Acoustic", "Black and white", "Empty room"],
    },
    {
      id: "sorry-05",
      title: { english: "Wrong words", arabic: "كلام غلط", french: "Mauvais mots" },
      prompt: {
        english: "A song apologizing for harsh words said in anger and meaning it now",
        arabic: "أغنية اعتذار عن كلام قاسي قيل بالغضب وندم حقيقي",
        french: "Une chanson pour s'excuser de mots durs dits sous la colère",
      },
      style: {
        english: "Melancholy pop, reverb piano, breathy vocal, 76 BPM",
        arabic: "Arabic melancholy pop, reverb piano, breathy Levantine vocal, 78 BPM",
        french: "Pop mélancolique, piano reverbe, voix soufflée, 74 BPM",
      },
      artworkTags: ["Melancholy", "Fog", "Streetlight"],
    },
    {
      id: "sorry-06",
      title: { english: "Start again", arabic: "من جديد", french: "Recommencer" },
      prompt: {
        english: "A hopeful apology song about rebuilding trust step by step",
        arabic: "أغنية اعتذار متفائلة عن بناء الثقة خطوة خطوة",
        french: "Une chanson d'espoir pour reconstruire la confiance pas à pas",
      },
      style: {
        english: "Hopeful apology pop, rising bridge, warm production, 88 BPM",
        arabic: "Arabic hopeful pop, rising bridge, warm Levantine production, 86 BPM",
        french: "Pop pleine d'espoir, montée au pont, production chaleureuse, 84 BPM",
      },
      artworkTags: ["Sunrise", "Hope", "Fresh start"],
    },
    {
      id: "sorry-07",
      title: { english: "On my knees", arabic: "من قلبي", french: "Les genoux" },
      prompt: {
        english: "A dramatic ballad apology with no excuses, only honesty and love",
        arabic: "بالاد اعتذار درامية بلا أعذار، بس صدق وحب",
        french: "Une ballade dramatique sans excuses, seulement l'honnêteté et l'amour",
      },
      style: {
        english: "Power ballad lite, piano and drums, confessional vocal, 84 BPM",
        arabic: "Arabic power ballad, piano and riq, confessional vocal, 82 BPM",
        french: "Ballade puissante, piano et batterie, confession, 80 BPM",
      },
      artworkTags: ["Dramatic soft", "Spotlight", "Confession"],
    },
    {
      id: "sorry-08",
      title: { english: "Too late?", arabic: "متأخر؟", french: "Trop tard?" },
      prompt: {
        english: "A song asking if it's too late to apologize but trying anyway",
        arabic: "أغنية بتسأل إذا فات الأوان للاعتذار بس عم تحاول",
        french: "Une chanson qui demande s'il est trop tard pour s'excuser mais essaie quand même",
      },
      style: {
        english: "Emotional mid-tempo pop, tense verses, open chorus, 80 BPM",
        arabic: "Arabic emotional pop, tense verses, open Levantine chorus, 82 BPM",
        french: "Pop émotionnelle mid-tempo, couplets tendus, 78 BPM",
      },
      artworkTags: ["Tension", "Rain window", "Blue hour"],
    },
    {
      id: "sorry-09",
      title: { english: "Letters unsent", arabic: "رسايل ما انبعتت", french: "Lettres jamais envoyées" },
      prompt: {
        english: "An indie apology about words you never said and finally saying them in a song",
        arabic: "اعتذار indie عن كلام ما قلتو واخيراً عم تقولو بالأغنية",
        french: "Des excuses indie sur des mots jamais dits, enfin chuchotés en chanson",
      },
      style: {
        english: "Indie ballad, lo-fi texture, honest lyrics, 68 BPM",
        arabic: "Arabic indie ballad, lo-fi texture, honest Levantine tone, 70 BPM",
        french: "Ballade indie lo-fi, texture honnête, 66 BPM",
      },
      artworkTags: ["Lo-fi", "Paper texture", "Ink"],
    },
    {
      id: "sorry-10",
      title: { english: "I was wrong", arabic: "أنا الغلط", french: "J'avais tort" },
      prompt: {
        english: "A direct apology song owning the mistake and asking to be heard",
        arabic: "أغنية اعتذار مباشرة بتعترف بالغلط وبتطلب تسمع",
        french: "Une excuse directe qui assume l'erreur et demande qu'on l'écoute",
      },
      style: {
        english: "Direct pop ballad, clear piano, honest vocal, 78 BPM",
        arabic: "Arabic direct ballad, clear piano, honest Levantine vocal, 80 BPM",
        french: "Ballade directe, piano clair, voix honnête, 76 BPM",
      },
      artworkTags: ["Honest", "Studio light", "Close portrait"],
    },
    {
      id: "sorry-11",
      title: { english: "Come home", arabic: "تعال البيت", french: "Rentre" },
      prompt: {
        english: "A warm apology inviting someone back home after a fight",
        arabic: "اعتذار دافئ بعزم حدا يرجع للبيت بعد الخلاف",
        french: "Des excuses chaleureuses pour inviter l'autre à revenir à la maison",
      },
      style: {
        english: "Warm pop ballad, acoustic and strings, 82 BPM",
        arabic: "Arabic warm ballad, oud and strings, homely Levantine feel, 84 BPM",
        french: "Ballade chaleureuse, acoustique et cordes, 80 BPM",
      },
      artworkTags: ["Warm", "Home light", "Evening"],
    },
  ],
  dabke: [
    {
      id: "dabke-01",
      title: { english: "Dabke night", arabic: "ليلة دبكة", french: "Nuit dabke" },
      prompt: {
        english: "A festive Lebanese dabke song for a wedding party with claps and a catchy chorus",
        arabic: "أغنية dabke لبنانية للعرس، فرحة وتصفيق وكراس يلعبها كل الحضور",
        french: "Une chanson dabke festive pour une fête de mariage libanaise",
      },
      style: {
        english: "Lebanese dabke fusion, mijwiz accents, claps on 2 and 4, 104 BPM",
        arabic: "Lebanese dabke, mijwiz lead, claps on 2 and 4, festive 106 BPM",
        french: "Fusion dabke libanaise, rythmes festifs, 102 BPM",
      },
      artworkTags: ["Festive", "Lebanese", "Dance floor"],
    },
    {
      id: "dabke-02",
      title: { english: "Wedding line", arabic: "صفّ العرس", french: "Ligne de noces" },
      prompt: {
        english: "A wedding dabke anthem calling everyone to join the dance line",
        arabic: "نشيد dabke للعرس بينادي الكل ينضمّ للصفّ",
        french: "Un hymne dabke de mariage qui appelle tout le monde à danser en ligne",
      },
      style: {
        english: "Wedding dabke pop, live drum feel, call-and-response, 108 BPM",
        arabic: "Wedding dabke, live tabla feel, call-and-response, 110 BPM",
        french: "Dabke de mariage, batterie live, 106 BPM",
      },
      artworkTags: ["Wedding", "Gold confetti", "Celebration"],
    },
    {
      id: "dabke-03",
      title: { english: "Line up", arabic: "يلّا صفّ", french: "En ligne" },
      prompt: {
        english: "An energetic dabke song with stomps, claps, and party energy",
        arabic: "أغنية dabke نارية فيها دوسات وتصفيق وطاقة حفلة",
        french: "Une chanson dabke énergique avec claps et esprit de fête",
      },
      style: {
        english: "Modern dabke, synth brass stabs, punchy kick, 110 BPM",
        arabic: "Modern dabke, synth brass, punchy kick, 112 BPM",
        french: "Dabke moderne, cuivres synth, kick punchy, 108 BPM",
      },
      artworkTags: ["Neon party", "Bold", "Night club"],
    },
    {
      id: "dabke-04",
      title: { english: "Ya zalameh", arabic: "يا زلمة", french: "Allez les gars" },
      prompt: {
        english: "A traditional dabke groove song for friends dancing together at a hafla",
        arabic: "أغنية dabke تقليدية للشباب يلعبون دبكة سوا بالحفلة",
        french: "Une dabke traditionnelle pour danser entre amis lors d'une hafla",
      },
      style: {
        english: "Traditional dabke groove, mizmar hook, village wedding energy, 106 BPM",
        arabic: "Traditional dabke, mizmar hook, village wedding, 108 BPM",
        french: "Dabke traditionnelle, mizmar, énergie de village, 104 BPM",
      },
      artworkTags: ["Traditional", "Community", "Warm lights"],
    },
    {
      id: "dabke-05",
      title: { english: "Summer dabke", arabic: "دبكة الصيف", french: "Dabke d'été" },
      prompt: {
        english: "A summer outdoor dabke song with sunset party vibes",
        arabic: "أغنية dabke صيفية للساحة والغروب والفرحة",
        french: "Une dabke d'été en plein air avec ambiance coucher de soleil",
      },
      style: {
        english: "Upbeat summer dabke, bright percussion, outdoor party, 112 BPM",
        arabic: "Summer dabke upbeat, bright percussion, outdoor party, 114 BPM",
        french: "Dabke estivale, percussions lumineuses, 110 BPM",
      },
      artworkTags: ["Summer", "Outdoor", "Sunset party"],
    },
    {
      id: "dabke-06",
      title: { english: "Clap back", arabic: "تصفيق", french: "Clap back" },
      prompt: {
        english: "A dabke pop fusion banger made for TikTok hooks and fast footwork",
        arabic: "أغنية dabke fusion سريعة للتيك توك وخطوات رجلين سريعة",
        french: "Un banger dabke fusion pour hooks TikTok et pas rapides",
      },
      style: {
        english: "Dabke pop fusion, electronic drops, clap-heavy chorus, 114 BPM",
        arabic: "Dabke pop fusion, electronic drops, clap-heavy, 116 BPM",
        french: "Fusion dabke pop, drops électro, claps, 112 BPM",
      },
      artworkTags: ["Fusion", "Electric", "Strobe"],
    },
    {
      id: "dabke-07",
      title: { english: "Hafla", arabic: "حفلة", french: "Hafla" },
      prompt: {
        english: "A hafla party dabke song with group chant chorus and big energy",
        arabic: "أغنية حفلة dabke بكراس جماعي وطاقة كبيرة",
        french: "Une chanson de hafla avec refrain chanté en groupe",
      },
      style: {
        english: "Hafla dabke pop, brass and drums, party anthem, 109 BPM",
        arabic: "Hafla dabke, brass and drums, party anthem, 111 BPM",
        french: "Hafla dabke, cuivres et drums, hymne de fête, 107 BPM",
      },
      artworkTags: ["Hafla", "Party", "Gold"],
    },
    {
      id: "dabke-08",
      title: { english: "Village lights", arabic: "ضوّ القرية", french: "Lumières du village" },
      prompt: {
        english: "A folk dabke song about family and dancing in a village celebration",
        arabic: "أغنية dabke فolk عن العيلة والرقص بفرحة القرية",
        french: "Une dabke folk sur la famille et la fête du village",
      },
      style: {
        english: "Folk dabke, acoustic lead, hand drums, authentic feel, 100 BPM",
        arabic: "Folk dabke, acoustic lead, hand drums, authentic, 102 BPM",
        french: "Dabke folk, lead acoustique, tambours, 98 BPM",
      },
      artworkTags: ["Folk", "Village", "Lanterns"],
    },
    {
      id: "dabke-09",
      title: { english: "Mijwiz fire", arabic: "مزمار نار", french: "Feu de mijwiz" },
      prompt: {
        english: "A fast mijwiz-led dabke track that feels like a live wedding band",
        arabic: "دبكة سريعة بمزمار حيّ كأنّها فرقة عرس",
        french: "Une dabke rapide au mijwiz, ambiance groupe live de mariage",
      },
      style: {
        english: "Mijwiz-led dabke, fast tempo, fiery hook, 115 BPM",
        arabic: "Mijwiz-led dabke, fast tempo, fiery hook, 118 BPM",
        french: "Dabke au mijwiz, tempo rapide, 113 BPM",
      },
      artworkTags: ["Fire glow", "Live band", "Fast energy"],
    },
    {
      id: "dabke-10",
      title: { english: "Step together", arabic: "خطوة سوا", french: "Pas ensemble" },
      prompt: {
        english: "A unity dabke song about dancing together left and right in one line",
        arabic: "أغنية dabke عن الوحدة والرقص سوا يمين وشمال",
        french: "Une dabke sur l'unité, danser ensemble dans la même ligne",
      },
      style: {
        english: "Unity dabke, stomp groove, group chant chorus, 107 BPM",
        arabic: "Unity dabke, stomp groove, group chant, 109 BPM",
        french: "Dabke unité, groove stomp, refrain groupé, 105 BPM",
      },
      artworkTags: ["Unity", "Bold red", "Movement"],
    },
    {
      id: "dabke-11",
      title: { english: "Dabke till dawn", arabic: "ل الصبح", french: "Jusqu'à l'aube" },
      prompt: {
        english: "A late-night dabke party song that keeps the floor moving until morning",
        arabic: "أغنية dabke لليلة ما بتوقف لحد الصبح",
        french: "Une dabke de fin de nuit qui garde la piste jusqu'au matin",
      },
      style: {
        english: "Late-night dabke, driving drums, relentless hook, 111 BPM",
        arabic: "Late-night dabke, driving drums, relentless hook, 113 BPM",
        french: "Dabke nocturne, batterie entraînante, 109 BPM",
      },
      artworkTags: ["Night", "Dance floor", "Energy"],
    },
  ],
};

export function resolveFirstSongLangKey(language) {
  const l = String(language || "auto").trim().toLowerCase();
  if (l === "arabic" || l === "english" || l === "french") return l;
  return "english";
}

/** @param {FirstSongSeed} raw @param {string} language */
export function materializeFirstSongSeed(raw, language) {
  if (!raw || typeof raw !== "object") return null;
  const key = resolveFirstSongLangKey(language);
  const fallback = raw.prompt?.english ? "english" : key;
  const pick = (map) => String(map?.[key] || map?.[fallback] || map?.english || "").trim();
  return {
    id: String(raw.id || "").trim(),
    title: pick(raw.title) || "My first song",
    prompt: pick(raw.prompt),
    style: pick(raw.style) || "Modern pop, catchy melody, 100 BPM",
    artworkTags: Array.isArray(raw.artworkTags) ? raw.artworkTags.filter(Boolean) : [],
  };
}

export function pickFirstSongSeed(topicId, language) {
  const pool = FIRST_SONG_THEME_SEEDS[String(topicId || "").trim()];
  if (!pool?.length) return null;
  let lastId = "";
  try {
    lastId = String(localStorage.getItem(`${LAST_SEED_KEY}:${topicId}`) || "").trim();
  } catch {}
  let candidates = pool;
  if (pool.length > 1 && lastId) {
    const filtered = pool.filter((s) => s.id !== lastId);
    if (filtered.length) candidates = filtered;
  }
  const raw = candidates[Math.floor(Math.random() * candidates.length)];
  try {
    localStorage.setItem(`${LAST_SEED_KEY}:${topicId}`, raw.id);
  } catch {}
  return materializeFirstSongSeed(raw, language);
}
