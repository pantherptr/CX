-- Fix for 0086: the upload policy checked "Visions is on" by reading
-- signal_visions_profiles directly, but that table has RLS on with no
-- policies, so from the user's role the check always came back empty and
-- every upload failed with "new row violates row-level security policy".
-- Ask the security-definer helper instead (fetch_visions_enabled, from 0085).

drop policy if exists "Visions owners can upload" on storage.objects;
create policy "Visions owners can upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'signal-visions'
    and auth.uid()::text = (storage.foldername(name))[1]
    and public.fetch_visions_enabled(auth.uid())
  );
