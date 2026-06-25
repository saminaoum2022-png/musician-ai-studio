-- =============================================================================
-- STEP 3 — ROLLBACK (only if merge was COMMITted and something went wrong)
-- Restores user_id + meta + public_on_profile from backup table.
-- =============================================================================

BEGIN;

UPDATE user_songs AS live
SET
  user_id = b.user_id,
  meta = b.meta,
  public_on_profile = b.public_on_profile
FROM user_songs_merge_backup_20260615 AS b
WHERE live.id = b.id;

-- Remove rows created after backup (should be none if merge only updated)
-- DELETE FROM user_songs live
-- WHERE NOT EXISTS (
--   SELECT 1 FROM user_songs_merge_backup_20260615 b WHERE b.id = live.id
-- )
-- AND live.user_id IN (
--   'c82c6e9b-b4e7-47a0-85a5-5f3e4591ef2b',
--   '683f9328-a98d-4ab5-9701-bf1d8ea6476c'
-- );

SELECT count(*) AS restored_rows FROM user_songs_merge_backup_20260615;

-- Review, then COMMIT if correct:
ROLLBACK;
-- COMMIT;
