-- =============================================================================
-- STEP 1 — AUDIT ONLY (read-only). Run this first. Do not change any data.
-- Accounts:
--   NEW (keep): c82c6e9b-b4e7-47a0-85a5-5f3e4591ef2b  @samynaoum  Gmail
--   OLD (merge from): 683f9328-a98d-4ab5-9701-bf1d8ea6476c  user_683f93
-- =============================================================================

-- A) Songs per account (alive = no meta.deletedAt)
WITH alive AS (
  SELECT *,
    coalesce(meta->>'deletedAt', '') AS deleted_at
  FROM user_songs
  WHERE user_id IN (
    'c82c6e9b-b4e7-47a0-85a5-5f3e4591ef2b',
    '683f9328-a98d-4ab5-9701-bf1d8ea6476c'
  )
)
SELECT user_id,
  count(*) AS total_rows,
  count(*) FILTER (WHERE deleted_at <> '') AS soft_deleted,
  count(*) FILTER (WHERE deleted_at = '') AS alive_rows
FROM alive
GROUP BY user_id
ORDER BY user_id;

-- B) Overlap: same audio_id + kind on BOTH accounts (duplicates — we keep c82 copy)
WITH alive AS (
  SELECT user_id, id, audio_id, kind, title, song_url, created_at,
    coalesce(meta->>'deletedAt', '') AS deleted_at
  FROM user_songs
  WHERE user_id IN (
    'c82c6e9b-b4e7-47a0-85a5-5f3e4591ef2b',
    '683f9328-a98d-4ab5-9701-bf1d8ea6476c'
  )
),
c82 AS (
  SELECT * FROM alive
  WHERE user_id = 'c82c6e9b-b4e7-47a0-85a5-5f3e4591ef2b' AND deleted_at = ''
),
old AS (
  SELECT * FROM alive
  WHERE user_id = '683f9328-a98d-4ab5-9701-bf1d8ea6476c' AND deleted_at = ''
)
SELECT
  (SELECT count(*) FROM old) AS old_alive,
  (SELECT count(*) FROM c82) AS c82_alive,
  (SELECT count(*) FROM old o
    INNER JOIN c82 k
      ON btrim(coalesce(o.audio_id, '')) = btrim(coalesce(k.audio_id, ''))
     AND btrim(coalesce(o.audio_id, '')) <> ''
     AND coalesce(o.kind, 'full') = coalesce(k.kind, 'full')
  ) AS overlap_audio_id_kind,
  (SELECT count(*) FROM old o
    WHERE btrim(coalesce(o.audio_id, '')) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM c82 k
        WHERE btrim(k.audio_id) = btrim(o.audio_id)
          AND coalesce(k.kind, 'full') = coalesce(o.kind, 'full')
      )
  ) AS old_unique_to_move,
  (SELECT count(*) FROM c82) +
  (SELECT count(*) FROM old o
    WHERE btrim(coalesce(o.audio_id, '')) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM c82 k
        WHERE btrim(k.audio_id) = btrim(o.audio_id)
          AND coalesce(k.kind, 'full') = coalesce(o.kind, 'full')
      )
  ) AS estimated_c82_after_merge;

-- C) Sample overlap titles (review — c82 copy will be kept)
WITH alive AS (
  SELECT user_id, audio_id, kind, title
  FROM user_songs
  WHERE user_id IN (
    'c82c6e9b-b4e7-47a0-85a5-5f3e4591ef2b',
    '683f9328-a98d-4ab5-9701-bf1d8ea6476c'
  )
    AND coalesce(meta->>'deletedAt', '') = ''
),
old AS (
  SELECT * FROM alive WHERE user_id = '683f9328-a98d-4ab5-9701-bf1d8ea6476c'
),
c82 AS (
  SELECT * FROM alive WHERE user_id = 'c82c6e9b-b4e7-47a0-85a5-5f3e4591ef2b'
)
SELECT o.audio_id, o.kind, o.title AS old_title, k.title AS c82_title
FROM old o
INNER JOIN c82 k
  ON btrim(o.audio_id) = btrim(k.audio_id)
 AND coalesce(o.kind, 'full') = coalesce(k.kind, 'full')
ORDER BY o.title
LIMIT 30;

-- D) Sample songs that WILL move (unique on old account)
WITH alive AS (
  SELECT user_id, id, audio_id, kind, title, created_at
  FROM user_songs
  WHERE user_id IN (
    'c82c6e9b-b4e7-47a0-85a5-5f3e4591ef2b',
    '683f9328-a98d-4ab5-9701-bf1d8ea6476c'
  )
    AND coalesce(meta->>'deletedAt', '') = ''
),
old AS (
  SELECT * FROM alive WHERE user_id = '683f9328-a98d-4ab5-9701-bf1d8ea6476c'
),
c82 AS (
  SELECT * FROM alive WHERE user_id = 'c82c6e9b-b4e7-47a0-85a5-5f3e4591ef2b'
)
SELECT o.id, o.audio_id, o.kind, o.title, o.created_at
FROM old o
WHERE btrim(coalesce(o.audio_id, '')) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM c82 k
    WHERE btrim(k.audio_id) = btrim(o.audio_id)
      AND coalesce(k.kind, 'full') = coalesce(o.kind, 'full')
  )
ORDER BY o.created_at DESC
LIMIT 30;
