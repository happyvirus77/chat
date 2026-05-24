alter table public.profiles
  add column if not exists email text;

alter table public.profiles
  add column if not exists username text;

alter table public.profiles
  add column if not exists avatar_url text;

insert into public.profiles (id, email, username, avatar_url)
select
  users.id,
  users.email,
  coalesce(
    nullif(split_part(users.email, '@', 1), ''),
    'user-' || replace(users.id::text, '-', '')
  ) || '-' || left(replace(users.id::text, '-', ''), 6) as username,
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
  insert into public.profiles (id, email, username, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(split_part(new.email, '@', 1), ''),
      'user-' || replace(new.id::text, '-', '')
    ) || '-' || left(replace(new.id::text, '-', ''), 6),
    null
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

notify pgrst, 'reload schema';
