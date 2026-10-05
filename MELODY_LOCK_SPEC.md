# Melody Lock (internal: `melody_conditioning`)

**Status:** Phase 0–1 done · **Phase 2 implemented** (Lyria generate + score + retry + admin ear-check API)  
**Scope:** Lyria full song (+ **~30s Lyria clip first** for iteration, then full song). **Do not change Suno / Eleven / Mureka default paths.**  
**Product goal:** User hums/sings/whistles ~10–20s melody → generated Lyria song keeps a **recognizable contour** (not note-perfect cloning).

**Basic Pitch:** [Spotify Basic Pitch](https://github.com/spotify/basic-pitch) is an **open-source MIT library** we **self-host** in a small Python worker (~$5–20/mo). **No Spotify API, no Spotify billing.**

---

## 1. Current Lyria prompt pipeline (codebase)

### 1.1 Entry: `POST /api/music/generate`

Lyria flows are handled in `api/music/generate.js`:

| Flow | Handler | Notes |
|------|---------|--------|
| Full song | `handleLyriaFullSongGenerate` → `runLyriaGenerationJob` | Primary target for Melody Lock (after clip iteration) |
| Clip | `handleLyriaClipGenerate` | **Start here:** ~30s clip for faster Melody Lock iteration |
| Mureka | `runMurekaGenerationJob` | Out of scope v1 |

**Melody Lock targets Lyria Prompt v2 shape only** (no Gemini Producer path on staging).

**Prompt builder router** (`buildLyriaPromptFromBody`):

- When `LYRIA_PROMPT_V2` / staging default: `buildLyriaPromptV2` in `api/_lib/lyria-prompt-v2.js`.
- Melody block inserts **after** style/maqam/vocal, **before** `Arrangement:` (Phase 1 preview: `api/_lib/melody-lock-prompt.js`).

### 1.2 Positive wording

Melody instructions and melody-lock-specific lines pass through **`rewriteMelodyLockPositive`** (`api/_lib/melody-lock-positive.js`) before prompt assembly — **mandatory** in v1.

---

## 2. Existing audio / pitch / melody code

| Asset | Location | Relevance |
|-------|----------|-----------|
| **Browser hum → melody** | `src/melody/extract.js` | **Client preview OK** via `recordHumToMelody`; **authoritative MIDI = server** (Basic Pitch or fixture) |
| **Quantization** | `src/melody/postprocess.js` | `{ tempoBpm, meter, notes[] }` |
| **Hum Track** | `src/hum-track.js` | Different feature — not Melody Lock |

---

## 3. Pitch → MIDI stack (backend)

**v1:** Self-hosted **Basic Pitch** worker (`MELODY_LOCK_BASIC_PITCH_URL`). Phase 1 falls back to **fixture stub** when URL unset or `MELODY_LOCK_USE_FIXTURE=1`.

---

## 4. Melody similarity score (output QA — Phase 2)

1. Reference: user-approved MIDI JSON.
2. Generate: Lyria output audio.
3. Re-extract with same pipeline.
4. **Numeric composite score (0–1)** — pass threshold ~0.70 (tunable).

**Phase 2 requirement:** Keep the **numeric score** AND require a **human ear check in admin** before treating a run as “passed.” Score alone can mislead on full mixes (drums, chords, vocal bleed).

---

## 5. Melody → Lyria text encoding

**Placement:** After style/tempo/key, before `Arrangement:` and before singable `Lyrics:`.

### 5.1 Content (positive wording)

1. Tempo + key from analysis.
2. Quantized note timeline (16ths).
3. Contour sentence.
4. Positive lock line (follow contour / repeat hook intervals).
5. **Vocal (Melody Lock line):** mid register, **conversational, sits inside the mix** — not “close mic.”
6. ≤4 instruments (align with v2 discipline).

### 5.2 Retry (Phase 2)

Max **2** Lyria attempts; internal retry cost is **on us** in v1.

---

## 6. Architecture

```
[Client] record/upload (≤20s) — optional client preview (recordHumToMelody)
       │
       ▼
POST /api/music/melody-lock/analyze  (Phase 1 — admin when flagged)
       ├─► Basic Pitch worker OR fixture
       ├─► Melody JSON + BPM/key
       └─► lyriaPromptPreview (v2 + Melody block; no Lyria API)

GET /api/music/melody-lock/:melodyId

POST /api/music/generate  melodyLock: { melodyId }  (Phase 2 — Lyria only)
       ├─► generate → score + human ear check (admin)
       └─► optional retry
```

---

## 7. APIs

| Method | Path | Phase | Auth | Purpose |
|--------|------|-------|------|---------|
| POST | `/api/music/melody-lock/analyze` | **1** | User + flags | Upload → Melody JSON + `lyriaPromptPreview` |
| GET | `/api/music/melody-lock/:melodyId` | **1** | Owner | Fetch analyzed melody |
| PATCH | `/api/music/melody-lock/:melodyId` | 3 | Owner | User note edits |
| POST | `/api/music/generate` | 2 | Existing | `melodyLock: { melodyId }` — Lyria only |

---

## 8. Data model

### 8.1 Table: `melody_lock_sources` (`supabase/melody_lock_sources.sql`)

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | `melodyId` |
| `user_id` | uuid FK | owner |
| **`source_kind`** | text | **`hum` \| `whistle` \| `sing`** |
| `source_audio_url` | text | optional R2/storage |
| `source_duration_sec` | numeric | |
| `melody_json` | jsonb | `{ tempoBpm, meter, notes[], inferredKey?, contourSummary? }` |
| `quantized_notes` | jsonb | 16th grid |
| `inferred_bpm` | int | |
| `inferred_key` | text | |
| `contour_summary` | text | |
| `lyria_melody_block` | text | positive-only block |
| `lyria_prompt_preview` | text | full v2-shaped preview |
| `analyze_provider` | text | `basic_pitch` \| `fixture` |
| `created_at` | timestamptz | |

### 8.2 Generation logs (Phase 2)

| Field | Example |
|-------|---------|
| `melody_lock_id` | uuid |
| `melody_similarity` | `0.82` |
| `melody_similarity_components` | json |
| `melody_lock_attempt` | `1` or `2` |
| `melody_lock_pass` | boolean (score + admin ear) |

---

## 9. Feature flags & safety

| Flag | Default | Behavior |
|------|---------|----------|
| `MELODY_LOCK_ENABLED` | **0** | Gates analyze (+ generate in Phase 2) |
| `MELODY_LOCK_ADMIN_ONLY` | **1** | Only admin emails until quality proven |
| `MELODY_LOCK_BASIC_PITCH_URL` | unset | Worker URL; unset → fixture in Phase 1 |
| `MELODY_LOCK_USE_FIXTURE` | unset | Force fixture when `1` |

**Credits v1:** Same as a normal song; no premium for double attempt yet.

---

## 10. Phased implementation

### Phase 0 — Spec ✅ (approved with advisor edits)

### Phase 1 — Analyze + prompt preview ✅ (admin-only)

- `POST /api/music/melody-lock/analyze`, `GET /api/music/melody-lock/:melodyId`
- `api/_lib/melody-lock-*.js`, unit test `scripts/test-melody-lock-prompt.mjs`
- **No Lyria calls**

### Phase 2 — Generate + score + admin ear check ✅

- `POST /api/music/generate?provider=lyria` with `melodyLock: { melodyId, preferClip?: true }`.
- Up to **2** Lyria attempts if numeric score &lt; threshold (`MELODY_LOCK_SCORE_THRESHOLD`, default **0.70**).
- `GET /api/music/melody-lock/run?taskId=lyr_…` — scores + ear status.
- `POST /api/music/melody-lock/ear-check` — admin `{ taskId, verdict: "pass"|"fail", notes? }`.
- SQL: `supabase/melody_lock_runs.sql` (after `melody_lock_sources.sql`).

### Phase 3 — User UI

- Record/upload → note editor → generate → “لحنك محفوظ” when passed.

---

## 11. Open questions — resolved

| # | Decision |
|---|----------|
| 1 | **Host Basic Pitch worker now** (~$5–20/mo); do not wait. |
| 2 | **Lyria Prompt v2 only** for Melody Lock. |
| 3 | **~30s Lyria clip first**, then full song. |
| 4 | **Client preview** via `recordHumToMelody` OK; **authoritative MIDI = server**. |
| 5 | **Credits:** same as normal song in v1; internal retry on us. |
| 6 | **Positive rewriter mandatory** before melody prompt assembly. |

---

## 12. Phase 1 files

| File | Role |
|------|------|
| `api/music/melody-lock/analyze.js` | POST analyze |
| `api/music/melody-lock/[melodyId].js` | GET by id |
| `api/_lib/melody-lock-config.js` | Feature gates |
| `api/_lib/melody-lock-analyze.js` | Worker / fixture |
| `api/_lib/melody-lock-prompt.js` | Melody block + v2 preview |
| `api/_lib/melody-lock-positive.js` | Positive rewriter |
| `api/_lib/melody-lock-store.js` | Supabase persistence |
| `supabase/melody_lock_sources.sql` | Table + RLS |
| `scripts/test-melody-lock-prompt.mjs` | Unit checks |
| `api/_lib/melody-lock-similarity.js` | Numeric score |
| `api/_lib/melody-lock-lyria.js` | Generate + retry loop |
| `api/_lib/melody-lock-runs.js` | Run rows + ear check |
| `api/music/melody-lock/run.js` | GET run by task |
| `api/music/melody-lock/ear-check.js` | Admin ear verdict |
| `scripts/test-melody-lock-similarity.mjs` | Score unit checks |

**Touched for Phase 2 only:** `api/music/generate.js` (Lyria full + clip). Suno/Eleven/Mureka unchanged.

---

*Stop after Phase 1 for review before Phase 2.*
