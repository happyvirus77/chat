insert into public.profiles (id, email, username, avatar_url)
select
  users.id,
  users.email,
  coalesce(
    nullif(split_part(users.email, '@', 1), ''),
    'user-' || replace(users.id::text, '-', '')
  ) as username,
  null as avatar_url
from auth.users
where users.email is not null
on conflict (id) do nothing;

notify pgrst, 'reload schema';
