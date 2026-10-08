/**
 * Oriental Studio Styles — slotted AB catalog.
 * Do not merge into Arabic LYRIA_STUDIO_STYLES.
 * `notes` is developer-only: never show it and never send it to Lyria.
 */

import {
  fillInternationalStylePrompt,
  defaultInternationalSlots,
} from "./lyria-international-styles.mjs";

/** @typedef {import("./lyria-international-styles.mjs").InternationalStudioStyle} OrientalStudioStyle */

/** @type {OrientalStudioStyle[]} */
export const LYRIA_ORIENTAL_STYLES = [
  {
    "id": "levantine-pop-fusion",
    "name": "Levantine pop fusion",
    "style_prompt": "Arabic pop, Levantine acoustic folk, retro synth-pop fusion, {VOCAL}, {LEAD}, {RHYTHM}, dynamic bassline, balanced acoustic and electronic production, {MOOD} mood, {BPM} BPM, {KEY}",
    "vocal_male": "emotional raspy male baritone lead vocal upfront, close to the mic, with Levantine turns and a warm restrained chest voice",
    "vocal_female": "emotional smoky female alto lead vocal upfront, close to the mic, with Levantine turns and a warm flexible midrange",
    "default_vocal": "male",
    "bpm": 110,
    "key": "D minor",
    "slots": {
      "LEAD": {
        "default": "warm acoustic oud solo with resonant nay flute",
        "options": [
          "warm acoustic oud solo with resonant nay flute",
          "bright retro synth lead with a soft oud answer",
          "solo nay over muted acoustic guitar",
          "qanun melody with warm synth pads"
        ]
      },
      "RHYTHM": {
        "default": "punchy electronic kick with crisp riq",
        "options": [
          "punchy electronic kick with crisp riq",
          "driving darbuka locked to an electronic kick",
          "soft maqsum on frame drum with a light kick",
          "four-on-the-floor kick and light riq"
        ]
      },
      "MOOD": {
        "default": "atmospheric dusk",
        "options": [
          "atmospheric dusk",
          "intimate night",
          "warm celebratory",
          "melancholic"
        ]
      },
      "BPM": {
        "default": "110",
        "options": [
          "110",
          "100",
          "118",
          "124"
        ]
      },
      "KEY": {
        "default": "D minor",
        "options": [
          "D minor",
          "A minor",
          "E Bayati",
          "C minor"
        ]
      }
    },
    "notes": "Source said only a minor key; D minor is the default. Keep it dusk-pop, not a religious-festival framing."
  },
  {
    "id": "levantine-folk",
    "name": "Levantine Folk",
    "style_prompt": "Levantine folk, dabke revival, energetic acoustic folk, {VOCAL}, {LEAD}, {RHYTHM}, buoyant acoustic bass, live folk stage feel, {MOOD} mood, {BPM} BPM, {KEY}",
    "vocal_male": "bright ringing male lead vocal upfront with a proud open tone and group backing that answers only on the hook, quieter than the lead",
    "vocal_female": "bright ringing female lead vocal upfront with a proud open tone and group backing that answers only on the hook, quieter than the lead",
    "default_vocal": "male",
    "bpm": 122,
    "key": "Bayati",
    "slots": {
      "LEAD": {
        "default": "piercing mijwiz over acoustic oud",
        "options": [
          "piercing mijwiz over acoustic oud",
          "oud-led folk melody",
          "zurna hooks with oud accents",
          "buzuq folk lead"
        ]
      },
      "RHYTHM": {
        "default": "driving darbuka with rhythmic riq and syncopated handclaps",
        "options": [
          "driving darbuka with rhythmic riq and syncopated handclaps",
          "heavy tabl and handclaps",
          "maqsum darbuka groove",
          "fast derbake and riq"
        ]
      },
      "MOOD": {
        "default": "proud celebratory",
        "options": [
          "proud celebratory",
          "triumphant village dance",
          "warm festive",
          "playful proud"
        ]
      },
      "BPM": {
        "default": "122",
        "options": [
          "122",
          "110",
          "128",
          "132"
        ]
      },
      "KEY": {
        "default": "Bayati",
        "options": [
          "Bayati",
          "A minor Bayati",
          "Hijaz",
          "D minor"
        ]
      }
    }
  },
  {
    "id": "dance-indie-pop",
    "name": "Dance-Indie pop",
    "style_prompt": "Dance-pop, triumphant indie pop, energetic synth-pop, {VOCAL}, {LEAD}, {RHYTHM}, pulsing synth bass, crisp modern mix, {MOOD} mood, {BPM} BPM, {KEY}",
    "vocal_male": "confident male baritone lead vocal upfront with a bright open tone, crisp diction, and a relaxed chest-voice hook",
    "vocal_female": "confident female lead vocal upfront with a bright open tone, crisp diction, and controlled high notes only on the hook",
    "default_vocal": "female",
    "bpm": 122,
    "key": "G major",
    "slots": {
      "LEAD": {
        "default": "bright euphoric synth hook",
        "options": [
          "bright euphoric synth hook",
          "indie electric guitar hook",
          "piano and synth hook",
          "plucked synth melody"
        ]
      },
      "RHYTHM": {
        "default": "driving four-on-the-floor beat",
        "options": [
          "driving four-on-the-floor beat",
          "indie disco groove",
          "half-time drop into a four-on-the-floor beat",
          "handclap dance beat"
        ]
      },
      "MOOD": {
        "default": "infectious summer dance",
        "options": [
          "infectious summer dance",
          "euphoric night",
          "playful confident",
          "bittersweet dance"
        ]
      },
      "BPM": {
        "default": "122",
        "options": [
          "122",
          "110",
          "118",
          "128"
        ]
      },
      "KEY": {
        "default": "G major",
        "options": [
          "G major",
          "C major",
          "D major",
          "A major"
        ]
      }
    },
    "notes": "Source said only a major key; G major is the default."
  },
  {
    "id": "cyber-dabkeh",
    "name": "Cyber dabkeh",
    "style_prompt": "Electronic, cyber-dabke, melodic bass, synthwave, {VOCAL}, {LEAD}, {RHYTHM}, punchy synth-bass drops, Levantine anthem production, {MOOD} mood, {BPM} BPM, {KEY}",
    "vocal_male": "passionate energetic male baritone lead vocal upfront with high-register belts, short vocal chops, and a driving Levantine delivery",
    "vocal_female": "passionate energetic female lead vocal upfront with high-register belts, short vocal chops, and a driving Levantine delivery",
    "default_vocal": "male",
    "bpm": 130,
    "key": "A minor",
    "slots": {
      "LEAD": {
        "default": "aggressive synthesized mijwiz lead",
        "options": [
          "aggressive synthesized mijwiz lead",
          "synth zurna lead",
          "bright synthwave lead with oud stabs",
          "distorted reed-synth hook"
        ]
      },
      "RHYTHM": {
        "default": "pounding electronic darbuka and riq",
        "options": [
          "pounding electronic darbuka and riq",
          "four-on-the-floor kick with darbuka",
          "breakbeat and electronic riq",
          "heavy kick and handclaps"
        ]
      },
      "MOOD": {
        "default": "triumphant Levantine anthem",
        "options": [
          "triumphant Levantine anthem",
          "dark club night",
          "proud festive",
          "euphoric night drive"
        ]
      },
      "BPM": {
        "default": "130",
        "options": [
          "130",
          "122",
          "128",
          "136"
        ]
      },
      "KEY": {
        "default": "A minor",
        "options": [
          "A minor",
          "D minor",
          "E Phrygian",
          "G minor"
        ]
      }
    },
    "notes": "Source said only a minor key; A minor is the default."
  },
  {
    "id": "arabic-pop",
    "name": "Arabic pop",
    "style_prompt": "Arabic pop, commercial Middle Eastern dance-pop, {VOCAL}, {LEAD}, {RHYTHM}, modern synth bass, polished radio-ready production, {MOOD} mood, {BPM} BPM, {KEY}",
    "vocal_male": "expressive energetic male baritone lead vocal upfront with a bright polished tone and easy Levantine pop phrasing",
    "vocal_female": "expressive energetic female lead vocal upfront with a bright polished tone and easy Levantine pop phrasing",
    "default_vocal": "male",
    "bpm": 120,
    "key": "C major",
    "slots": {
      "LEAD": {
        "default": "bright oud hooks",
        "options": [
          "bright oud hooks",
          "energetic acoustic guitar hooks",
          "bright synth and oud together",
          "accordion riffs"
        ]
      },
      "RHYTHM": {
        "default": "driving darbuka and riq",
        "options": [
          "driving darbuka and riq",
          "maqsum with darbuka fills",
          "four-on-the-floor and riq",
          "derbake and handclaps"
        ]
      },
      "MOOD": {
        "default": "joyful celebratory",
        "options": [
          "joyful celebratory",
          "upbeat summer",
          "flirty playful",
          "proud night-out"
        ]
      },
      "BPM": {
        "default": "120",
        "options": [
          "120",
          "108",
          "116",
          "126"
        ]
      },
      "KEY": {
        "default": "C major",
        "options": [
          "C major",
          "D major",
          "G major",
          "A major"
        ]
      }
    },
    "notes": "Source said an expressive energetic singer and only a major key. Default singer is male; default key is C major."
  },
  {
    "id": "arabic-pop-acoustic-ballad",
    "name": "Arabic pop acoustic ballad",
    "style_prompt": "Acoustic Arabic pop ballad, romantic slow jam, {VOCAL}, {LEAD}, {RHYTHM}, subtle bass, warm organic timbre, intimate close production, {MOOD} mood, {BPM} BPM, {KEY}",
    "vocal_male": "warm male baritone lead vocal upfront with smooth close harmonies, soft diction, and a relaxed romantic delivery",
    "vocal_female": "warm female alto lead vocal upfront with smooth close harmonies, soft diction, and a relaxed romantic delivery",
    "default_vocal": "male",
    "bpm": 75,
    "key": "A minor",
    "slots": {
      "LEAD": {
        "default": "soft acoustic guitar picking",
        "options": [
          "soft acoustic guitar picking",
          "gentle piano and guitar",
          "oud and soft guitar",
          "nylon guitar only"
        ]
      },
      "RHYTHM": {
        "default": "gentle frame drum",
        "options": [
          "gentle frame drum",
          "soft kick and brushed snare",
          "light riq pulse",
          "sparse hand percussion"
        ]
      },
      "MOOD": {
        "default": "intimate cozy",
        "options": [
          "intimate cozy",
          "romantic night",
          "nostalgic",
          "tender"
        ]
      },
      "BPM": {
        "default": "75",
        "options": [
          "75",
          "68",
          "82",
          "90"
        ]
      },
      "KEY": {
        "default": "A minor",
        "options": [
          "A minor",
          "D minor",
          "E minor",
          "C major"
        ]
      }
    },
    "notes": "Romantic slow jam. Do not lean on a religious-festival vibe."
  },
  {
    "id": "arabic-trap",
    "name": "Arabic trap",
    "style_prompt": "Arabic trap, melodic hip-hop, Middle Eastern trap, {VOCAL}, {LEAD}, {RHYTHM}, heavy 808 sub-bass, short lead hook under the 808, {MOOD} mood, {BPM} BPM, {KEY}",
    "vocal_male": "deep raspy male baritone vocal upfront with a tuned melodic flow, clear consonants, and a confident measured cadence",
    "vocal_female": "deep raspy female alto vocal upfront with a tuned melodic flow, clear consonants, and a confident measured cadence",
    "default_vocal": "male",
    "bpm": 140,
    "key": "C minor",
    "slots": {
      "LEAD": {
        "default": "sharp dark synth-pluck hook",
        "options": [
          "sharp dark synth-pluck hook",
          "sharp brassy synth hook",
          "dark atmospheric ney hook",
          "subtle dark acoustic oud hook"
        ]
      },
      "RHYTHM": {
        "default": "fast sliding hi-hats with a tight snare",
        "options": [
          "fast sliding hi-hats with a tight snare",
          "half-time trap drums",
          "punchy trap hats and claps",
          "sparse dark trap groove"
        ]
      },
      "MOOD": {
        "default": "stoic dark",
        "options": [
          "stoic dark",
          "confident aggressive",
          "melancholic night",
          "cold street"
        ]
      },
      "BPM": {
        "default": "140",
        "options": [
          "140",
          "130",
          "146",
          "150"
        ]
      },
      "KEY": {
        "default": "C minor",
        "options": [
          "C minor",
          "D minor",
          "F minor",
          "A minor"
        ]
      }
    }
  },
  {
    "id": "modern-rai",
    "name": "Modern rai",
    "style_prompt": "Algerian rai, electro dance-pop, {VOCAL}, {LEAD}, {RHYTHM}, pulsed synth bass, euphoric pads, night-life production, {MOOD} mood, {BPM} BPM, {KEY}",
    "vocal_male": "energetic passionate male lead vocal upfront with a raspy tenor color, urgent diction, and a desperate emotional delivery",
    "vocal_female": "energetic passionate female lead vocal upfront with a raspy edge, urgent diction, and a desperate emotional delivery",
    "default_vocal": "male",
    "bpm": 124,
    "key": "A minor",
    "slots": {
      "LEAD": {
        "default": "raspy traditional gasba flute",
        "options": [
          "raspy traditional gasba flute",
          "synth gasba lead",
          "accordion rai riff",
          "oud and gasba together"
        ]
      },
      "RHYTHM": {
        "default": "fast driving four-on-the-floor with acoustic darbuka",
        "options": [
          "fast driving four-on-the-floor with acoustic darbuka",
          "club kick and riq",
          "rai percussion and claps",
          "straight club beat with light darbuka"
        ]
      },
      "MOOD": {
        "default": "ecstatic night-life",
        "options": [
          "ecstatic night-life",
          "desperate romantic",
          "euphoric club",
          "raw street night"
        ]
      },
      "BPM": {
        "default": "124",
        "options": [
          "124",
          "118",
          "128",
          "132"
        ]
      },
      "KEY": {
        "default": "A minor",
        "options": [
          "A minor",
          "D minor",
          "C minor",
          "E Phrygian"
        ]
      }
    },
    "notes": "Source said only a minor key; A minor is the default."
  },
  {
    "id": "levantine-ballad",
    "name": "Levantine ballad",
    "style_prompt": "Orchestral pop, Levantine folk ballad, {VOCAL}, {LEAD}, {RHYTHM}, sweeping string orchestra, acoustic bass, warm organic production with an emotional swell, {MOOD} mood, {BPM} BPM, {KEY}",
    "vocal_male": "serene male baritone lead vocal upfront with a soft high-mix on phrase peaks, smooth dynamic vibrato, and gentle Levantine ornaments",
    "vocal_female": "serene female lead vocal upfront with an angelic head-voice shimmer, smooth dynamic vibrato, and gentle Levantine ornaments",
    "default_vocal": "female",
    "bpm": 75,
    "key": "D minor",
    "slots": {
      "LEAD": {
        "default": "grand acoustic piano with gentle nay flute",
        "options": [
          "grand acoustic piano with gentle nay flute",
          "oud and piano",
          "solo nay over strings",
          "cello and piano"
        ]
      },
      "RHYTHM": {
        "default": "soft frame drum",
        "options": [
          "soft frame drum",
          "very light brushed percussion",
          "soft orchestral pulse",
          "sparse riq"
        ]
      },
      "MOOD": {
        "default": "romantic nostalgic",
        "options": [
          "romantic nostalgic",
          "serene",
          "deeply wistful",
          "warm intimate"
        ]
      },
      "BPM": {
        "default": "75",
        "options": [
          "75",
          "68",
          "82",
          "90"
        ]
      },
      "KEY": {
        "default": "D minor",
        "options": [
          "D minor",
          "A minor",
          "G minor",
          "F major"
        ]
      }
    }
  },
  {
    "id": "lebanese-mountain-dabke-electronic",
    "name": "Lebanese Mountain Dabke - Electronic",
    "style_prompt": "Electronic dance, eclectic funky house, Lebanese mountain dabke, modern baladi pop, {VOCAL}, {LEAD}, {RHYTHM}, festive high-energy dance production, {MOOD} mood, {BPM} BPM, {KEY}",
    "vocal_male": "passionate male mountain vocal upfront with a strong chest belt, ringing high notes, and rhythmic dance phrasing",
    "vocal_female": "passionate female mountain vocal upfront with a strong chest belt, piercing high notes, and rhythmic dance phrasing",
    "default_vocal": "female",
    "bpm": 128,
    "key": "G minor",
    "slots": {
      "LEAD": {
        "default": "energetic piercing zurna and dual-pipe mijwiz",
        "options": [
          "energetic piercing zurna and dual-pipe mijwiz",
          "synth zurna hook",
          "mijwiz only",
          "oud stabs over a house lead"
        ]
      },
      "RHYTHM": {
        "default": "driving house breakbeats with heavy tabl, katem, and crowd chants",
        "options": [
          "driving house breakbeats with heavy tabl, katem, and crowd chants",
          "four-on-the-floor with tabl",
          "funky house and riq",
          "breakbeat and handclaps"
        ]
      },
      "MOOD": {
        "default": "festive high energy",
        "options": [
          "festive high energy",
          "vibrant wedding dance",
          "upbeat night",
          "proud mountain party"
        ]
      },
      "BPM": {
        "default": "128",
        "options": [
          "128",
          "120",
          "124",
          "132"
        ]
      },
      "KEY": {
        "default": "G minor",
        "options": [
          "G minor",
          "A minor",
          "D minor",
          "Bayati"
        ]
      }
    }
  },
  {
    "id": "lebanese-mountain-dabke",
    "name": "Lebanese Mountain Dabke",
    "style_prompt": "Middle Eastern folk, Lebanese mountain dabke, Levantine folklore, high-energy traditional dance, {VOCAL}, {LEAD}, {RHYTHM}, raw resonant acoustic folk production, {MOOD} mood, {BPM} BPM, {KEY}",
    "vocal_male": "energetic male vocal upfront with powerful mountain belts, short mawwal phrases, and a raw resonant chest tone",
    "vocal_female": "energetic female vocal upfront with powerful mountain belts, short mawwal phrases, and a raw resonant chest tone",
    "default_vocal": "male",
    "bpm": 128,
    "key": "Bayati",
    "slots": {
      "LEAD": {
        "default": "double-pipe mijwiz with acoustic oud",
        "options": [
          "double-pipe mijwiz with acoustic oud",
          "zurna and oud",
          "mijwiz only",
          "buzuq folk lead"
        ]
      },
      "RHYTHM": {
        "default": "driving heavy tabla and katem",
        "options": [
          "driving heavy tabla and katem",
          "fast darbuka and riq",
          "tabl with handclaps",
          "derbake and katem"
        ]
      },
      "MOOD": {
        "default": "dramatic triumphant",
        "options": [
          "dramatic triumphant",
          "proud village dance",
          "festive",
          "earthy celebratory"
        ]
      },
      "BPM": {
        "default": "128",
        "options": [
          "128",
          "118",
          "124",
          "136"
        ]
      },
      "KEY": {
        "default": "Bayati",
        "options": [
          "Bayati",
          "A minor",
          "Hijaz",
          "G minor"
        ]
      }
    },
    "notes": "Source gave no key; Bayati is the default."
  },
  {
    "id": "egyptian-baladi-electro",
    "name": "Egyptian baladi electro",
    "style_prompt": "Egyptian pop, baladi electro-pop, {VOCAL}, {LEAD}, {RHYTHM}, energetic brass hits, polished commercial radio sound, {MOOD} mood, {BPM} BPM, {KEY}",
    "vocal_male": "flirty upbeat male baritone lead vocal upfront with bouncy Egyptian phrasing and call-and-response answers quieter than the lead",
    "vocal_female": "flirty upbeat female lead vocal upfront with bouncy Egyptian phrasing and call-and-response answers quieter than the lead",
    "default_vocal": "female",
    "bpm": 120,
    "key": "C major",
    "slots": {
      "LEAD": {
        "default": "lively accordion riffs",
        "options": [
          "lively accordion riffs",
          "bright synth accordion",
          "mizmar lead",
          "oud and accordion"
        ]
      },
      "RHYTHM": {
        "default": "fast maqsum with bright darbuka and duff",
        "options": [
          "fast maqsum with bright darbuka and duff",
          "electronic darbuka groove",
          "maqsum and claps",
          "four-on-the-floor with duff"
        ]
      },
      "MOOD": {
        "default": "playful high-energy",
        "options": [
          "playful high-energy",
          "flirty dance",
          "joyful street party",
          "cheeky upbeat"
        ]
      },
      "BPM": {
        "default": "120",
        "options": [
          "120",
          "110",
          "116",
          "126"
        ]
      },
      "KEY": {
        "default": "C major",
        "options": [
          "C major",
          "D major",
          "G major",
          "A major"
        ]
      }
    },
    "notes": "Source said only a major key; C major is the default."
  },
  {
    "id": "greek-arabic-pop-fusion",
    "name": "Greek Arabic pop fusion",
    "style_prompt": "Greek Arabic pop fusion, romantic R&B ballad, {VOCAL}, {LEAD}, {RHYTHM}, warm bass, deep nostalgic production, {MOOD} mood, {BPM} BPM, {KEY}",
    "vocal_male": "smooth warm male baritone lead vocal upfront with melismatic ornaments, relaxed runs, and a deep passionate delivery",
    "vocal_female": "smooth warm female alto lead vocal upfront with melismatic ornaments, relaxed runs, and a deep passionate delivery",
    "default_vocal": "male",
    "bpm": 90,
    "key": "D minor",
    "slots": {
      "LEAD": {
        "default": "melodic bouzouki lines with gentle nylon guitar",
        "options": [
          "melodic bouzouki lines with gentle nylon guitar",
          "oud and bouzouki",
          "nylon guitar only",
          "soft piano and bouzouki"
        ]
      },
      "RHYTHM": {
        "default": "relaxed rumba rhythm with organic percussion",
        "options": [
          "relaxed rumba rhythm with organic percussion",
          "soft R&B groove",
          "light darbuka rumba",
          "brushed drums and shaker"
        ]
      },
      "MOOD": {
        "default": "passionate nostalgic",
        "options": [
          "passionate nostalgic",
          "romantic",
          "wistful seaside",
          "intimate"
        ]
      },
      "BPM": {
        "default": "90",
        "options": [
          "90",
          "80",
          "98",
          "104"
        ]
      },
      "KEY": {
        "default": "D minor",
        "options": [
          "D minor",
          "A minor",
          "G minor",
          "C minor"
        ]
      }
    }
  },
  {
    "id": "lebanese-mawwal",
    "name": "Lebanese Mawwal",
    "style_prompt": "Lebanese folk, classic tarab, mountain mawwal, {VOCAL}, {LEAD}, {RHYTHM}, orchestral Arabic violins, rich organic acoustics, rubato opening into the groove, {MOOD} mood, {BPM} BPM, {KEY}",
    "vocal_male": "resonant male baritone lead vocal upfront with passionate vibrato, wide melodic leaps, and authentic mountain mawwal phrasing",
    "vocal_female": "resonant female lead vocal upfront with passionate vibrato, wide melodic leaps, and authentic mountain mawwal phrasing",
    "default_vocal": "male",
    "bpm": 85,
    "key": "Bayati",
    "slots": {
      "LEAD": {
        "default": "acoustic resonant oud solo with traditional nay",
        "options": [
          "acoustic resonant oud solo with traditional nay",
          "oud only",
          "nay and Arabic violins",
          "qanun and oud"
        ]
      },
      "RHYTHM": {
        "default": "riq and darbuka in a steady mid-tempo folk groove",
        "options": [
          "riq and darbuka in a steady mid-tempo folk groove",
          "soft riq pulse",
          "light darbuka folk beat",
          "sparse tarab percussion"
        ]
      },
      "MOOD": {
        "default": "earnest triumphant",
        "options": [
          "earnest triumphant",
          "proud mountain",
          "nostalgic tarab",
          "warm solemn"
        ]
      },
      "BPM": {
        "default": "85",
        "options": [
          "85",
          "75",
          "92",
          "100"
        ]
      },
      "KEY": {
        "default": "Bayati",
        "options": [
          "Bayati",
          "Hijaz",
          "A minor Bayati",
          "D minor"
        ]
      }
    }
  },
  {
    "id": "modern-khaleeji-pop",
    "name": "Modern Khaleeji pop",
    "style_prompt": "Modern Khaleeji pop, R&B melismatic vocal anthem, {VOCAL}, {LEAD}, {RHYTHM}, subtle modern sub bass, rich backing harmonies, polished spatial mix, {MOOD} mood, {BPM} BPM, {KEY}",
    "vocal_male": "expressive passionate male baritone lead vocal upfront with long dynamic melodic runs and a polished, spacious delivery",
    "vocal_female": "expressive passionate female lead vocal upfront with long dynamic melodic runs and a polished, spacious delivery",
    "default_vocal": "male",
    "bpm": 95,
    "key": "D minor",
    "slots": {
      "LEAD": {
        "default": "warm acoustic oud leads",
        "options": [
          "warm acoustic oud leads",
          "soft synth and oud",
          "qanun hooks",
          "muted guitar and oud"
        ]
      },
      "RHYTHM": {
        "default": "samri and khaleeji handclaps with polyrhythmic percussion",
        "options": [
          "samri and khaleeji handclaps with polyrhythmic percussion",
          "khabeeti groove and claps",
          "lighter samri frame drum",
          "modern R&B hats with khaleeji claps"
        ]
      },
      "MOOD": {
        "default": "passionate anthem",
        "options": [
          "passionate anthem",
          "romantic night",
          "proud",
          "intimate and expansive"
        ]
      },
      "BPM": {
        "default": "95",
        "options": [
          "95",
          "88",
          "102",
          "110"
        ]
      },
      "KEY": {
        "default": "D minor",
        "options": [
          "D minor",
          "A minor",
          "Bayati",
          "C minor"
        ]
      }
    }
  },
  {
    "id": "modern-iraqi-pop",
    "name": "Modern Iraqi pop",
    "style_prompt": "Modern Iraqi pop, Middle Eastern dance-pop, {VOCAL}, {LEAD}, {RHYTHM}, dramatic orchestral strings, crisp punchy production, high-energy dance drop, {MOOD} mood, {BPM} BPM, {KEY}",
    "vocal_male": "emotional passionate male baritone lead vocal upfront with a bright urgent tone and Iraqi pop ornaments",
    "vocal_female": "emotional passionate female lead vocal upfront with a bright urgent tone and Iraqi pop ornaments",
    "default_vocal": "male",
    "bpm": 128,
    "key": "A minor",
    "slots": {
      "LEAD": {
        "default": "expressive accordion lead",
        "options": [
          "expressive accordion lead",
          "orchestral string hook",
          "oud and accordion",
          "synth lead with accordion"
        ]
      },
      "RHYTHM": {
        "default": "driving khashaba percussion",
        "options": [
          "driving khashaba percussion",
          "khashaba with darbuka",
          "four-on-the-floor and khashaba",
          "maqsum and claps"
        ]
      },
      "MOOD": {
        "default": "intense romantic",
        "options": [
          "intense romantic",
          "proud dance",
          "emotional night",
          "celebratory"
        ]
      },
      "BPM": {
        "default": "128",
        "options": [
          "128",
          "118",
          "124",
          "134"
        ]
      },
      "KEY": {
        "default": "A minor",
        "options": [
          "A minor",
          "D minor",
          "C minor",
          "Bayati"
        ]
      }
    },
    "notes": "Source said only a minor key; A minor is the default."
  },
  {
    "id": "lebanese-folk-tarab",
    "name": "Lebanese Folk Tarab",
    "style_prompt": "Lebanese folk tarab, mountain dabke, Levantine urban folk, {VOCAL}, {LEAD}, {RHYTHM}, traditional mawwal opening, proud celebratory production, {MOOD} mood, {BPM} BPM, {KEY}",
    "vocal_male": "passionate male baritone lead vocal upfront with a resonant chest voice, a short mawwal opening, and a proud romantic delivery",
    "vocal_female": "passionate female lead vocal upfront with a resonant chest voice, a short mawwal opening, and a proud romantic delivery",
    "default_vocal": "male",
    "bpm": 115,
    "key": "A minor Bayati",
    "slots": {
      "LEAD": {
        "default": "high mijwiz with lush oriental violins",
        "options": [
          "high mijwiz with lush oriental violins",
          "zurna and violins",
          "oud and mijwiz",
          "violin-led tarab melody"
        ]
      },
      "RHYTHM": {
        "default": "heavy tabla with energetic derbake",
        "options": [
          "heavy tabla with energetic derbake",
          "derbake and riq",
          "tabl and handclaps",
          "maqsum tabla groove"
        ]
      },
      "MOOD": {
        "default": "proud celebratory",
        "options": [
          "proud celebratory",
          "romantic energetic",
          "festive mountain",
          "dramatic tarab"
        ]
      },
      "BPM": {
        "default": "115",
        "options": [
          "115",
          "105",
          "122",
          "128"
        ]
      },
      "KEY": {
        "default": "A minor Bayati",
        "options": [
          "A minor Bayati",
          "Bayati",
          "Hijaz",
          "D minor"
        ]
      }
    }
  },
  {
    "id": "lebanese-dramatic-ballad",
    "name": "Lebanese dramatic ballad",
    "style_prompt": "Arabic pop ballad, Lebanese dramatic ballad, {VOCAL}, {LEAD}, {RHYTHM}, lush orchestral strings, slow-burn arrangement, raw live-room acoustic, {MOOD} mood, {BPM} BPM, {KEY}",
    "vocal_male": "deep raspy male baritone lead vocal upfront with a strained crying edge that opens into a full chest voice at the climax",
    "vocal_female": "deep raspy female lead vocal upfront with a strained crying edge that opens into a full chest voice at the climax",
    "default_vocal": "male",
    "bpm": 62,
    "key": "D minor",
    "slots": {
      "LEAD": {
        "default": "weeping grand piano with a soulful cello solo",
        "options": [
          "weeping grand piano with a soulful cello solo",
          "piano and strings",
          "oud and cello",
          "solo piano"
        ]
      },
      "RHYTHM": {
        "default": "subtle percussion",
        "options": [
          "subtle percussion",
          "soft heartbeat kick",
          "very light riq",
          "brushed snare ballad pulse"
        ]
      },
      "MOOD": {
        "default": "tragic heartbreak",
        "options": [
          "tragic heartbreak",
          "raw grief",
          "intimate sorrow",
          "dramatic climax"
        ]
      },
      "BPM": {
        "default": "62",
        "options": [
          "62",
          "58",
          "68",
          "75"
        ]
      },
      "KEY": {
        "default": "D minor",
        "options": [
          "D minor",
          "C minor",
          "A minor",
          "F minor"
        ]
      }
    }
  },
  {
    "id": "egyptian-shaabi-mahraganat",
    "name": "Egyptian Shaabi",
    "style_prompt": "Egyptian shaabi, mahraganat, electro-shaabi, street-wedding chant energy, {VOCAL}, {LEAD}, {RHYTHM}, festive party brass, {MOOD} mood, {BPM} BPM, {KEY}",
    "vocal_male": "heavy auto-tuned male vocal upfront with a rapid percussive street-chant delivery and a short gang answer on the hook",
    "vocal_female": "heavy auto-tuned female vocal upfront with a rapid percussive street-chant delivery and a short gang answer on the hook",
    "default_vocal": "male",
    "bpm": 132,
    "key": "C minor",
    "slots": {
      "LEAD": {
        "default": "high-energy synthesized zurna",
        "options": [
          "high-energy synthesized zurna",
          "festival brass hook",
          "synth mizmar",
          "accordion and zurna"
        ]
      },
      "RHYTHM": {
        "default": "driving electronic darbuka",
        "options": [
          "driving electronic darbuka",
          "mahraganat drum machine and darbuka",
          "fast maqsum electro beat",
          "claps and electronic tabla"
        ]
      },
      "MOOD": {
        "default": "high-energy upbeat",
        "options": [
          "high-energy upbeat",
          "chaotic street party",
          "playful boastful",
          "festive night"
        ]
      },
      "BPM": {
        "default": "132",
        "options": [
          "132",
          "120",
          "126",
          "140"
        ]
      },
      "KEY": {
        "default": "C minor",
        "options": [
          "C minor",
          "D minor",
          "A minor",
          "G minor"
        ]
      }
    }
  },
  {
    "id": "middle-eastern-rnb",
    "name": "Middle Eastern R&B",
    "style_prompt": "Middle Eastern R&B, acoustic Levantine lounge soul, quiet storm, {VOCAL}, {LEAD}, {RHYTHM}, smooth lounge synthesizer, warm dark acoustic timbre, short mawwal phrases in the opening, {MOOD} mood, {BPM} BPM, {KEY}",
    "vocal_male": "passionate male baritone lead vocal upfront with microtonal ornamentation, a crying tarab edge, and dramatic mawwal phrases",
    "vocal_female": "passionate female lead vocal upfront with microtonal ornamentation, a crying tarab edge, and dramatic mawwal phrases",
    "default_vocal": "male",
    "bpm": 68,
    "key": "D minor",
    "slots": {
      "LEAD": {
        "default": "melancholic acoustic oud with organic piano",
        "options": [
          "melancholic acoustic oud with organic piano",
          "oud only",
          "piano and a soft lounge synth",
          "nay and oud"
        ]
      },
      "RHYTHM": {
        "default": "slow soft R&B groove",
        "options": [
          "slow soft R&B groove",
          "sparse kick and finger snaps",
          "brushed lounge drums",
          "half-time R&B hats"
        ]
      },
      "MOOD": {
        "default": "emotional heartbreak",
        "options": [
          "emotional heartbreak",
          "late-night intimate",
          "melancholic",
          "warm and wounded"
        ]
      },
      "BPM": {
        "default": "68",
        "options": [
          "68",
          "64",
          "75",
          "82"
        ]
      },
      "KEY": {
        "default": "D minor",
        "options": [
          "D minor",
          "A minor",
          "C minor",
          "Bayati"
        ]
      }
    },
    "notes": "Source gave no key; D minor is the default."
  },
  {
    "id": "middle-eastern-shaabi-lounge",
    "name": "Middle Eastern Shaabi lounge",
    "style_prompt": "Middle Eastern shaabi, Levantine lounge, {VOCAL}, {LEAD}, {RHYTHM}, slow heavy synth bass, atmospheric pads, {MOOD} mood, {BPM} BPM, {KEY}",
    "vocal_male": "deep raspy male baritone lead vocal upfront with a raw weary delivery and subtle quarter-tone bends",
    "vocal_female": "deep raspy female alto lead vocal upfront with a raw weary delivery and subtle quarter-tone bends",
    "default_vocal": "male",
    "bpm": 82,
    "key": "G minor",
    "slots": {
      "LEAD": {
        "default": "dark moody accordion melodies",
        "options": [
          "dark moody accordion melodies",
          "oud in place of the accordion",
          "ney and accordion",
          "muted synth and accordion"
        ]
      },
      "RHYTHM": {
        "default": "punchy darbuka beat",
        "options": [
          "punchy darbuka beat",
          "slow maqsum",
          "heavy kick and darbuka",
          "sparse lounge darbuka"
        ]
      },
      "MOOD": {
        "default": "melancholic street-soul",
        "options": [
          "melancholic street-soul",
          "tense night",
          "moody lounge",
          "raw and weary"
        ]
      },
      "BPM": {
        "default": "82",
        "options": [
          "82",
          "75",
          "90",
          "96"
        ]
      },
      "KEY": {
        "default": "G minor",
        "options": [
          "G minor",
          "D minor",
          "C minor",
          "Bayati"
        ]
      }
    }
  },
  {
    "id": "modern-levantine-dabke",
    "name": "Modern Levantine Dabke",
    "style_prompt": "Modern Levantine dabke, Middle Eastern folk pop, {VOCAL}, {LEAD}, {RHYTHM}, punchy synth bass, loud festive production, {MOOD} mood, {BPM} BPM, {KEY}",
    "vocal_male": "crisp male vocal upfront with a charismatic rustic Lebanese color, clear diction, and a bright rhythmic delivery",
    "vocal_female": "crisp female vocal upfront with a charismatic rustic Levantine color, clear diction, and a bright rhythmic delivery",
    "default_vocal": "male",
    "bpm": 125,
    "key": "Bayati",
    "slots": {
      "LEAD": {
        "default": "blaring energetic zurna",
        "options": [
          "blaring energetic zurna",
          "mijwiz hooks",
          "oud and zurna",
          "synth reed lead"
        ]
      },
      "RHYTHM": {
        "default": "thunderous heavy tablah with vibrant riq and handclaps",
        "options": [
          "thunderous heavy tablah with vibrant riq and handclaps",
          "fast derbake and riq",
          "tabl and katem",
          "electronic kick with tablah"
        ]
      },
      "MOOD": {
        "default": "euphoric village festival",
        "options": [
          "euphoric village festival",
          "proud dance",
          "playful wedding",
          "high-energy street"
        ]
      },
      "BPM": {
        "default": "125",
        "options": [
          "125",
          "118",
          "122",
          "132"
        ]
      },
      "KEY": {
        "default": "Bayati",
        "options": [
          "Bayati",
          "A minor",
          "G minor",
          "Hijaz"
        ]
      }
    },
    "notes": "Source gave no key; Bayati is the default."
  },
  {
    "id": "levantine-indie-folk",
    "name": "Levantine indie folk",
    "style_prompt": "Middle Eastern indie folk, Lebanese folk pop, intimate chamber pop, {VOCAL}, {LEAD}, {RHYTHM}, warm room ambience, soft dreamy acoustic production, {MOOD} mood, {BPM} BPM, {KEY}",
    "vocal_male": "warm emotive male baritone vocal upfront, very close, with a quiet conversational tone and soft breath on phrase endings",
    "vocal_female": "warm emotive female vocal upfront, very close, with a quiet conversational tone and a gentle airy top",
    "default_vocal": "female",
    "bpm": 72,
    "key": "A minor",
    "slots": {
      "LEAD": {
        "default": "acoustic guitar fingerpicking with delicate piano",
        "options": [
          "acoustic guitar fingerpicking with delicate piano",
          "guitar only",
          "piano and soft strings",
          "oud and guitar"
        ]
      },
      "RHYTHM": {
        "default": "subtle rain-like shaker pulse",
        "options": [
          "subtle rain-like shaker pulse",
          "soft brushed percussion",
          "light shaker",
          "very sparse kick"
        ]
      },
      "MOOD": {
        "default": "soft dreamy",
        "options": [
          "soft dreamy",
          "tender nostalgic",
          "intimate",
          "hopeful quiet"
        ]
      },
      "BPM": {
        "default": "72",
        "options": [
          "72",
          "66",
          "80",
          "88"
        ]
      },
      "KEY": {
        "default": "A minor",
        "options": [
          "A minor",
          "D minor",
          "C major",
          "E minor"
        ]
      }
    }
  },
  {
    "id": "egyptian-pop-2000s",
    "name": "Egyptian pop 2000s",
    "style_prompt": "Egyptian pop, 2000s commercial Arabic pop, {VOCAL}, {LEAD}, {RHYTHM}, lush string section, polished production, {MOOD} mood, {BPM} BPM, {KEY}",
    "vocal_male": "emotional male baritone lead vocal upfront with strong chest resonance, dramatic ornaments, and a proud Egyptian pop delivery",
    "vocal_female": "emotional female lead vocal upfront with strong chest resonance, dramatic ornaments, and a proud Egyptian pop delivery",
    "default_vocal": "female",
    "bpm": 122,
    "key": "A minor",
    "slots": {
      "LEAD": {
        "default": "bright Egyptian accordion",
        "options": [
          "bright Egyptian accordion",
          "oud hooks",
          "string-section melody",
          "synth accordion"
        ]
      },
      "RHYTHM": {
        "default": "driving maqsum with energetic darbuka solos",
        "options": [
          "driving maqsum with energetic darbuka solos",
          "maqsum and riq",
          "dance darbuka groove",
          "lighter pop percussion with darbuka fills"
        ]
      },
      "MOOD": {
        "default": "proud passionate",
        "options": [
          "proud passionate",
          "upbeat romantic",
          "dramatic",
          "joyful"
        ]
      },
      "BPM": {
        "default": "122",
        "options": [
          "122",
          "110",
          "118",
          "128"
        ]
      },
      "KEY": {
        "default": "A minor",
        "options": [
          "A minor",
          "D minor",
          "C minor",
          "Bayati"
        ]
      }
    },
    "notes": "Source said only a minor key; A minor is the default."
  },
  {
    "id": "summer-levantine-dabke-pop",
    "name": "Summer Levantine dabke pop",
    "style_prompt": "Lebanese pop, Levantine dabke pop, upbeat summer dance-pop, {VOCAL}, {LEAD}, {RHYTHM}, driving modern synth bass, bright clean modern mix, {MOOD} mood, {BPM} BPM, {KEY}",
    "vocal_male": "energetic charismatic male baritone lead vocal upfront with a cheerful playful bounce and short chantable scat hooks",
    "vocal_female": "energetic charismatic female lead vocal upfront with a cheerful playful bounce and short chantable scat hooks",
    "default_vocal": "male",
    "bpm": 120,
    "key": "D major",
    "slots": {
      "LEAD": {
        "default": "acoustic guitar strumming riffs with brass stabs",
        "options": [
          "acoustic guitar strumming riffs with brass stabs",
          "mijwiz hooks and guitar",
          "oud riffs",
          "brass hook over synth bass"
        ]
      },
      "RHYTHM": {
        "default": "rhythmic derbake and riq",
        "options": [
          "rhythmic derbake and riq",
          "dabke tabl and claps",
          "maqsum derbake",
          "four-on-the-floor with riq"
        ]
      },
      "MOOD": {
        "default": "cheerful playful",
        "options": [
          "cheerful playful",
          "flirty summer",
          "festive",
          "breezy romantic"
        ]
      },
      "BPM": {
        "default": "120",
        "options": [
          "120",
          "110",
          "116",
          "126"
        ]
      },
      "KEY": {
        "default": "D major",
        "options": [
          "D major",
          "G major",
          "C major",
          "A major"
        ]
      }
    }
  },
  {
    "id": "levantine-pop-syrian-folk",
    "name": "Levantine pop Syrian folk-pop",
    "style_prompt": "Levantine pop, Syrian folk-pop, fast dabke feel, {VOCAL}, {LEAD}, {RHYTHM}, buoyant acoustic guitar, infectious synth bass, bright summer production, {MOOD} mood, {BPM} BPM, {KEY}",
    "vocal_male": "energetic male baritone lead vocal upfront with a bright flirtatious tone and playful Syrian folk-pop phrasing",
    "vocal_female": "energetic female lead vocal upfront with a bright flirtatious tone and playful Syrian folk-pop phrasing",
    "default_vocal": "male",
    "bpm": 118,
    "key": "D major",
    "slots": {
      "LEAD": {
        "default": "bright acoustic oud with lively mijwiz",
        "options": [
          "bright acoustic oud with lively mijwiz",
          "mijwiz-led dabke hook",
          "oud and guitar",
          "synth bass and mijwiz"
        ]
      },
      "RHYTHM": {
        "default": "maqsum on driven derbake",
        "options": [
          "maqsum on driven derbake",
          "fast dabke tabl",
          "derbake and riq",
          "handclaps and derbake"
        ]
      },
      "MOOD": {
        "default": "cheerful flirtatious",
        "options": [
          "cheerful flirtatious",
          "playful romantic",
          "festive",
          "uplifting summer"
        ]
      },
      "BPM": {
        "default": "118",
        "options": [
          "118",
          "108",
          "114",
          "126"
        ]
      },
      "KEY": {
        "default": "D major",
        "options": [
          "D major",
          "C major",
          "G major",
          "A major"
        ]
      }
    },
    "notes": "Source said only a major key; D major is the default."
  },
  {
    "id": "dark-levantine-trap",
    "name": "Dark Levantine trap",
    "style_prompt": "Levant pop, Arabic trap, dark atmospheric pop, {VOCAL}, {LEAD}, {RHYTHM}, sub-bass 808, deep vocal space, intimate confessional chorus, {MOOD} mood, {BPM} BPM, {KEY}",
    "vocal_male": "deep moody male baritone vocal upfront with a raw intimate Levantine delivery, almost spoken on the verse, and light reverb",
    "vocal_female": "deep moody female alto vocal upfront with a raw intimate Levantine delivery, almost spoken on the verse, and light reverb",
    "default_vocal": "male",
    "bpm": 88,
    "key": "C minor",
    "slots": {
      "LEAD": {
        "default": "atmospheric oriental synth riffs with haunting ney",
        "options": [
          "atmospheric oriental synth riffs with haunting ney",
          "oud trap hook",
          "dark piano and ney",
          "dark synth plucks"
        ]
      },
      "RHYTHM": {
        "default": "punchy trap drums",
        "options": [
          "punchy trap drums",
          "half-time trap beat",
          "sparse bedroom drums",
          "trap hats and claps"
        ]
      },
      "MOOD": {
        "default": "melancholic wet-stone night",
        "options": [
          "melancholic wet-stone night",
          "raw urban",
          "intimate bedroom",
          "cold and weary"
        ]
      },
      "BPM": {
        "default": "88",
        "options": [
          "88",
          "80",
          "96",
          "104"
        ]
      },
      "KEY": {
        "default": "C minor",
        "options": [
          "C minor",
          "D minor",
          "A minor",
          "F minor"
        ]
      }
    },
    "notes": "Urban confessional, not a religious-night mood. Source said only a minor key; C minor is the default."
  },
  {
    "id": "mountain-dabke-pop",
    "name": "Mountain dabke pop",
    "style_prompt": "Lebanese folk pop, traditional Levantine dabke, energetic mountain style, {VOCAL}, {LEAD}, {RHYTHM}, authentic mountain atmosphere, clear acoustic production, short mawwal opening, {MOOD} mood, {BPM} BPM, {KEY}",
    "vocal_male": "powerful male mountain vocal upfront with long mawwal phrases, a ringing chest voice, and controlled high notes on phrase endings",
    "vocal_female": "powerful female mountain vocal upfront with long mawwal phrases, a soaring open tone, and controlled high notes on phrase endings",
    "default_vocal": "female",
    "bpm": 128,
    "key": "Bayati",
    "slots": {
      "LEAD": {
        "default": "bright piercing zurna hooks with acoustic oud accents",
        "options": [
          "bright piercing zurna hooks with acoustic oud accents",
          "mijwiz instead of zurna",
          "oud-led mountain melody",
          "zurna and violin"
        ]
      },
      "RHYTHM": {
        "default": "fast driving tablah with katem and riq",
        "options": [
          "fast driving tablah with katem and riq",
          "derbake and riq",
          "tabl and handclaps",
          "heavier katem groove"
        ]
      },
      "MOOD": {
        "default": "dramatic triumphant",
        "options": [
          "dramatic triumphant",
          "proud festive",
          "village celebration",
          "energetic mountain"
        ]
      },
      "BPM": {
        "default": "128",
        "options": [
          "128",
          "120",
          "124",
          "132"
        ]
      },
      "KEY": {
        "default": "Bayati",
        "options": [
          "Bayati",
          "A minor Bayati",
          "Hijaz",
          "G minor"
        ]
      }
    },
    "notes": "Source gave no key; Bayati is the default."
  }
];

export const ORIENTAL_STYLE_SECTIONS = [
  {
    "id": "levantine-pop",
    "name": "Levantine pop",
    "ids": [
      "levantine-pop-fusion",
      "arabic-pop",
      "dance-indie-pop",
      "summer-levantine-dabke-pop",
      "levantine-pop-syrian-folk"
    ]
  },
  {
    "id": "dabke",
    "name": "Dabke",
    "ids": [
      "cyber-dabkeh",
      "levantine-folk",
      "modern-levantine-dabke",
      "lebanese-mountain-dabke",
      "mountain-dabke-pop"
    ]
  },
  {
    "id": "electro",
    "name": "Electro & dance",
    "ids": [
      "lebanese-mountain-dabke-electronic",
      "egyptian-baladi-electro",
      "egyptian-shaabi-mahraganat",
      "egyptian-pop-2000s",
      "modern-rai"
    ]
  },
  {
    "id": "ballads",
    "name": "Ballads",
    "ids": [
      "arabic-pop-acoustic-ballad",
      "levantine-ballad",
      "levantine-indie-folk",
      "lebanese-dramatic-ballad",
      "middle-eastern-rnb"
    ]
  },
  {
    "id": "tarab",
    "name": "Tarab & folk",
    "ids": [
      "lebanese-mawwal",
      "lebanese-folk-tarab",
      "greek-arabic-pop-fusion",
      "middle-eastern-shaabi-lounge"
    ]
  },
  {
    "id": "regional",
    "name": "Regional & trap",
    "ids": [
      "modern-khaleeji-pop",
      "modern-iraqi-pop",
      "arabic-trap",
      "dark-levantine-trap"
    ]
  }
];

const BY_ID = Object.freeze(Object.fromEntries(LYRIA_ORIENTAL_STYLES.map((s) => [s.id, s])));

export function getOrientalStyle(id) {
  return BY_ID[String(id || "").trim()] || null;
}

export function listOrientalStyles() {
  return LYRIA_ORIENTAL_STYLES;
}

export function orientalStyleUi(style) {
  if (!style) return null;
  return {
    id: style.id,
    label: style.name,
    defaultSinger: style.default_vocal === "female" ? "f" : "m",
    group: "oriental",
  };
}

export function defaultOrientalSlots(style) {
  return defaultInternationalSlots(style);
}

export function fillOrientalStylePrompt(opts) {
  return fillInternationalStylePrompt(opts);
}
