alter table public.profiles
  add column if not exists email text;

alter table public.profiles
  add column if not exists username text;

alter table public.profiles
  add column if not exists display_name text;

alter table public.profiles
  add column if not exists avatar_url text;

alter table public.profiles enable row level security;

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

insert into public.profiles (id, email, username, display_name, avatar_url)
select
  users.id,
  users.email,
  coalesce(
    nullif(split_part(users.email, '@', 1), ''),
    'user-' || replace(users.id::text, '-', '')
  ) || '-' || left(replace(users.id::text, '-', ''), 6) as username,
  null as display_name,
  null as avatar_url
from auth.users as users
where users.email is not null
on conflict (id) do update
set email = coalesce(public.profiles.email, excluded.email),
    username = coalesce(public.profiles.username, excluded.username);

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, username, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(split_part(new.email, '@', 1), ''),
      'user-' || replace(new.id::text, '-', '')
    ) || '-' || left(replace(new.id::text, '-', ''), 6),
    null,
    null
  )
  on conflict (id) do update
  set email = coalesce(public.profiles.email, excluded.email),
      username = coalesce(public.profiles.username, excluded.username);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

notify pgrst, 'reload schema';
