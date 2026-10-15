-- 0132 · SIGNAL media: nothing is refused for its type, size or length.
-- The app no longer limits what people publish (any photo, any video). This removes the bucket-level
-- restrictions that would still reject files on the server: the type allow-list and the 80 MB cap.
-- The ceiling that remains is Supabase's own "Upload file size limit" (Storage → Settings in the dashboard;
-- raise it there, it needs the Pro plan above 50 MB).
-- Run this in the Supabase SQL Editor.

update storage.buckets
   set file_size_limit = null,
       allowed_mime_types = null
 where id = 'empire-post-media';

-- the portfolio (Visions) bucket had a 50 MB cap
update storage.buckets
   set file_size_limit = null
 where id in (select id from storage.buckets where name ilike '%vision%' or id ilike '%vision%');
