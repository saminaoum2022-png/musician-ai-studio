-- Fix voice status uploads rejected for audio/webm;codecs=opus (run if bucket already exists).
update storage.buckets
set allowed_mime_types = array[
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/x-m4a',
  'audio/m4a'
]
where id = 'status_audio';
