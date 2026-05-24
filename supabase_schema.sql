create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  username text not null unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists email text;

create unique index if not exists profiles_email_idx
  on public.profiles (email);

alter table public.profiles enable row level security;

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

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.channels
  add column if not exists user_id uuid references public.profiles(id) on delete set null;

create unique index if not exists channels_name_unique_lower_idx
  on public.channels (lower(trim(name)));

alter table public.channels enable row level security;

drop policy if exists "Authenticated users can read channels" on public.channels;
create policy "Authenticated users can read channels"
  on public.channels
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can create channels" on public.channels;
create policy "Authenticated users can create channels"
  on public.channels
  for insert
  to authenticated
  with check (auth.uid() is not null and user_id = auth.uid());

insert into public.channels (name, description, user_id)
values ('General', 'Community-wide conversation', null)
on conflict (name) do nothing;

drop function if exists public.create_channel(text, text);

create or replace function public.create_channel(
  channel_description text,
  channel_name text
)
returns table (
  id uuid,
  name text,
  description text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  return query
  insert into public.channels (name, description, user_id)
  values (
    nullif(trim(channel_name), ''),
    channel_description,
    auth.uid()
  )
  returning channels.id, channels.name, channels.description, channels.created_at;
end;
$$;

grant execute on function public.create_channel(text, text) to authenticated;

notify pgrst, 'reload schema';

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text,
  image_url text,
  created_at timestamptz not null default now(),
  constraint messages_content_or_image_required check (
    content is not null or image_url is not null
  )
);

alter table public.messages enable row level security;

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
  with check (auth.uid() = user_id);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  content text,
  image_url text,
  created_at timestamptz not null default now(),
  constraint direct_messages_content_or_image_required check (
    content is not null or image_url is not null
  ),
  constraint direct_messages_no_self_message check (sender_id <> receiver_id)
);

alter table public.direct_messages enable row level security;

drop policy if exists "Users can read own direct messages" on public.direct_messages;
create policy "Users can read own direct messages"
  on public.direct_messages
  for select
  to authenticated
  using (
    auth.uid() = sender_id
    or auth.uid() = receiver_id
  );

drop policy if exists "Users can send own direct messages" on public.direct_messages;
create policy "Users can send own direct messages"
  on public.direct_messages
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and auth.uid() = sender_id
    and sender_id <> receiver_id
  );

create index if not exists messages_channel_id_created_at_idx
  on public.messages (channel_id, created_at);

create index if not exists messages_user_id_idx
  on public.messages (user_id);

create index if not exists direct_messages_sender_receiver_created_at_idx
  on public.direct_messages (sender_id, receiver_id, created_at);

create index if not exists direct_messages_receiver_sender_created_at_idx
  on public.direct_messages (receiver_id, sender_id, created_at);
