alter table public.profiles
  add column if not exists email text;

create unique index if not exists profiles_email_idx
  on public.profiles (email)
  where email is not null;

notify pgrst, 'reload schema';
