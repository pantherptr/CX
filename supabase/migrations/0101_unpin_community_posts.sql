-- Community posts must never sit in Official's Pinned / Featured slots.
-- Pin to top and Feature were offered on Community posts too, which moved them into
-- Official (and out of the Community feed). The app no longer offers them there; this puts
-- back any Community post that was pinned or featured that way.
update public.empire_posts
set is_pinned = false, is_featured = false
where publisher_type = 'self' and (is_pinned or is_featured);
