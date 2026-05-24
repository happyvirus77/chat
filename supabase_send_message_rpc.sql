drop function if exists public.send_message(uuid, text);

create or replace function public.send_message(
  message_channel_id uuid,
  message_content text,
  message_image_url text default null
)
returns table (
  id uuid,
  channel_id uuid,
  user_id uuid,
  content text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_email text;
  profile_username text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if nullif(trim(message_content), '') is null then
    if nullif(trim(coalesce(message_image_url, '')), '') is null then
      raise exception 'Message content or image is required';
    end if;
  end if;

  profile_email := coalesce(auth.jwt() ->> 'email', auth.uid()::text || '@unknown.local');
  profile_username := 'user-' || replace(auth.uid()::text, '-', '');

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'email'
  ) then
    insert into public.profiles (id, email, username, avatar_url)
    values (auth.uid(), profile_email, profile_username, null)
    on conflict (id) do nothing;
  else
    insert into public.profiles (id, username, avatar_url)
    values (auth.uid(), profile_username, null)
    on conflict (id) do nothing;
  end if;

  return query
  insert into public.messages (channel_id, user_id, content, image_url)
  values (
    message_channel_id,
    auth.uid(),
    nullif(trim(message_content), ''),
    nullif(trim(coalesce(message_image_url, '')), '')
  )
  returning messages.id, messages.channel_id, messages.user_id, messages.content, messages.created_at;
end;
$$;

grant execute on function public.send_message(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
