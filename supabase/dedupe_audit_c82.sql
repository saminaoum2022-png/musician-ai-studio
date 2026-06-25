-- Duplicate audit for @samynaoum (c82). Run in Supabase SQL Editor.
-- Replace user_id if auditing another account.

WITH mine AS (
  SELECT
    id,
    audio_id,
    kind,
    title,
    song_url,
    created_at,
    public_on_profile,
    coalesce(meta->>'deletedAt', '') AS deleted_at
  FROM user_songs
  WHERE user_id = 'c82c6e9b-b4e7-47a0-85a5-5f3e4591ef2b'
),
alive AS (
  SELECT * FROM mine WHERE deleted_at = ''
),
by_audio AS (
  SELECT audio_id, kind, count(*) AS copies
  FROM alive
  WHERE audio_id IS NOT NULL AND btrim(audio_id) <> ''
  GROUP BY audio_id, kind
),
dup_groups AS (
  SELECT * FROM by_audio WHERE copies > 1
)
SELECT
  (SELECT count(*) FROM mine) AS total_rows,
  (SELECT count(*) FROM mine WHERE deleted_at <> '') AS soft_deleted_rows,
  (SELECT count(*) FROM alive) AS alive_rows,
  (SELECT count(DISTINCT (audio_id, kind)) FROM alive WHERE audio_id IS NOT NULL AND btrim(audio_id) <> '') AS unique_audio_id_kind,
  (SELECT count(*) FROM dup_groups) AS duplicate_groups,
  (SELECT coalesce(sum(copies - 1), 0) FROM dup_groups) AS extra_duplicate_rows,
  (SELECT count(*) FROM alive) - (SELECT coalesce(sum(copies - 1), 0) FROM dup_groups) AS estimated_distinct_songs;

-- Top duplicate groups (same audio_id + kind)
SELECT audio_id, kind, count(*) AS copies, min(title) AS sample_title
FROM alive
WHERE audio_id IS NOT NULL AND btrim(audio_id) <> ''
GROUP BY audio_id, kind
HAVING count(*) > 1
ORDER BY copies DESC, audio_id
LIMIT 25;
