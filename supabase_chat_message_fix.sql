create extension if not exists "pgcrypto";

alter table public.profiles enable row level security;

alter table public.profiles
  add column if not exists email text;

alter table public.profiles
  add column if not exists username text;

alter table public.profiles
  add column if not exists avatar_url text;

grant select, insert, update on public.profiles to authenticated;

drop policy if exists "Users can read profiles" on public.profiles;
create policy "Users can read profiles"
  on public.profiles
  for select
  to authenticated
  using (true);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

alter table public.messages enable row level security;

grant select, insert on public.messages to authenticated;

drop policy if exists "Authenticated users can read messages" on public.messages;
create policy "Authenticated users can read messages"
  on public.messages
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can create own messages" on public.messages;
create policy "Authenticated users can create own messages"
  on public.messages
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and user_id = auth.uid()
  );

create index if not exists messages_channel_id_created_at_idx
  on public.messages (channel_id, created_at);

create index if not exists messages_user_id_idx
  on public.messages (user_id);

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

  insert into public.profiles (id, email, username, avatar_url)
  values (auth.uid(), profile_email, profile_username, null)
  on conflict (id) do nothing;

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
