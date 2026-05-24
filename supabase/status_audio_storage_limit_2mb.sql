-- Raise voice clip limit (Echo Tone + longer drops). Run in Supabase SQL Editor.
update storage.buckets
set file_size_limit = 2097152
where id = 'status_audio';
