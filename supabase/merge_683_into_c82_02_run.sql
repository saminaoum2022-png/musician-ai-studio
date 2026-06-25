-- =============================================================================
-- STEP 2 — MERGE (run only after Step 1 audit looks correct)
-- Strategy:
--   • BACKUP both accounts into a dated table (rollback possible)
--   • MOVE old-account songs to c82 when audio_id+kind is unique (no duplicate)
--   • MOVE old rows without audio_id when song_url+kind is unique on c82
--   • SOFT-DELETE old-account duplicates (keep c82 copy — nothing lost)
--   • VERIFY counts before COMMIT; ROLLBACK if anything looks wrong
--
-- Run in Supabase SQL Editor as postgres. Review verification output, then
-- uncomment COMMIT or leave as ROLLBACK for a dry run.
-- =============================================================================

BEGIN;

-- ── Backup (rollback source) ───────────────────────────────────────────────
DROP TABLE IF EXISTS user_songs_merge_backup_20260615;
CREATE TABLE user_songs_merge_backup_20260615 AS
SELECT *, now() AS backed_up_at
FROM user_songs
WHERE user_id IN (
  'c82c6e9b-b4e7-47a0-85a5-5f3e4591ef2b',
  '683f9328-a98d-4ab5-9701-bf1d8ea6476c'
);

-- ── 1) Move UNIQUE songs (audio_id + kind) from old → c82 ─────────────────
UPDATE user_songs AS old
SET user_id = 'c82c6e9b-b4e7-47a0-85a5-5f3e4591ef2b'
WHERE old.user_id = '683f9328-a98d-4ab5-9701-bf1d8ea6476c'
  AND coalesce(old.meta->>'deletedAt', '') = ''
  AND btrim(coalesce(old.audio_id, '')) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM user_songs AS keep
    WHERE keep.user_id = 'c82c6e9b-b4e7-47a0-85a5-5f3e4591ef2b'
      AND coalesce(keep.meta->>'deletedAt', '') = ''
      AND btrim(coalesce(keep.audio_id, '')) = btrim(coalesce(old.audio_id, ''))
      AND coalesce(keep.kind, 'full') = coalesce(old.kind, 'full')
  );

-- ── 2) Move no-audio_id rows when song_url + kind is unique on c82 ────────
UPDATE user_songs AS old
SET user_id = 'c82c6e9b-b4e7-47a0-85a5-5f3e4591ef2b'
WHERE old.user_id = '683f9328-a98d-4ab5-9701-bf1d8ea6476c'
  AND coalesce(old.meta->>'deletedAt', '') = ''
  AND btrim(coalesce(old.audio_id, '')) = ''
  AND btrim(coalesce(old.song_url, '')) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM user_songs AS keep
    WHERE keep.user_id = 'c82c6e9b-b4e7-47a0-85a5-5f3e4591ef2b'
      AND coalesce(keep.meta->>'deletedAt', '') = ''
      AND btrim(coalesce(keep.song_url, '')) = btrim(coalesce(old.song_url, ''))
      AND coalesce(keep.kind, 'full') = coalesce(old.kind, 'full')
  );

-- ── 3) Soft-delete remaining alive duplicates on old (c82 copy wins) ───────
UPDATE user_songs AS old
SET meta = jsonb_set(
      coalesce(old.meta, '{}'::jsonb),
      '{deletedAt}',
      to_jsonb(to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
      true
    ),
    public_on_profile = false
WHERE old.user_id = '683f9328-a98d-4ab5-9701-bf1d8ea6476c'
  AND coalesce(old.meta->>'deletedAt', '') = ''
  AND EXISTS (
    SELECT 1
    FROM user_songs AS keep
    WHERE keep.user_id = 'c82c6e9b-b4e7-47a0-85a5-5f3e4591ef2b'
      AND coalesce(keep.meta->>'deletedAt', '') = ''
      AND (
        (
          btrim(coalesce(old.audio_id, '')) <> ''
          AND btrim(coalesce(keep.audio_id, '')) = btrim(coalesce(old.audio_id, ''))
          AND coalesce(keep.kind, 'full') = coalesce(old.kind, 'full')
        )
        OR (
          btrim(coalesce(old.audio_id, '')) = ''
          AND btrim(coalesce(old.song_url, '')) <> ''
          AND btrim(coalesce(keep.song_url, '')) = btrim(coalesce(old.song_url, ''))
          AND coalesce(keep.kind, 'full') = coalesce(old.kind, 'full')
        )
      )
  );

-- ── Verification (must review before COMMIT) ───────────────────────────────
SELECT 'backup_rows' AS check_name, count(*)::text AS value
FROM user_songs_merge_backup_20260615
UNION ALL
SELECT 'c82_alive_after', count(*)::text
FROM user_songs
WHERE user_id = 'c82c6e9b-b4e7-47a0-85a5-5f3e4591ef2b'
  AND coalesce(meta->>'deletedAt', '') = ''
UNION ALL
SELECT 'old_alive_remaining', count(*)::text
FROM user_songs
WHERE user_id = '683f9328-a98d-4ab5-9701-bf1d8ea6476c'
  AND coalesce(meta->>'deletedAt', '') = ''
UNION ALL
SELECT 'old_soft_deleted_after', count(*)::text
FROM user_songs
WHERE user_id = '683f9328-a98d-4ab5-9701-bf1d8ea6476c'
  AND coalesce(meta->>'deletedAt', '') <> '';

-- Dry run already passed. This version COMMITs the merge.
-- ROLLBACK;
COMMIT;
