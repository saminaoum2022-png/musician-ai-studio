# Musician AI Studio (MVP)

A **web-based app for musicians** that generates compositions/arrangements and exports **real audio (WAV)** — **no MIDI output**.

This MVP is **zero-dependency static** (no build step), so it deploys cleanly to **Vercel** and works well in **GitHub**.

## What you get (today)

- **Arrangement generation** (local “AI-like” generator): sections, chords, melody, counter-melody, tabla pattern
- **Real audio render**: offline WebAudio → **downloadable WAV**
- **Instruments (synth models)**: Oud (plucked), Violin (bowed-ish), Piano (soft), Tabla/Rablah (dum/tek)

## Run locally

From this folder:

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

## Deploy to Vercel

- Push this folder to a GitHub repo
- Import the repo in Vercel
- Framework preset: **Other**
- No build command needed

`vercel.json` is already included so Vercel serves `index.html`.

## Next steps (when you’re ready)

- Add serverless endpoints:
  - `/api/compose` for **AI composition/arrangement** (OpenAI / other)
  - `/api/voice` for **Voice AI** (ElevenLabs / other)
- Add **real instrument sample packs** (oud/violin/etc.) with user upload or curated libraries
- Export **MP3** (client-side) in addition to WAV

