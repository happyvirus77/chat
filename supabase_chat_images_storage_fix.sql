insert into storage.buckets (id, name, public)
values ('chat-images', 'chat-images', true)
on conflict (id) do update
set public = true,
    file_size_limit = null,
    allowed_mime_types = null;

drop policy if exists "Anyone can read chat images" on storage.objects;
create policy "Anyone can read chat images"
  on storage.objects
  for select
  using (bucket_id = 'chat-images');

drop policy if exists "Authenticated users can upload chat images" on storage.objects;
create policy "Authenticated users can upload chat images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update own chat images" on storage.objects;
create policy "Users can update own chat images"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete own chat images" on storage.objects;
create policy "Users can delete own chat images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

notify pgrst, 'reload schema';
