alter table public.channels
  add column if not exists user_id uuid references public.profiles(id) on delete set null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'channels'
      and column_name = 'created_by'
  ) then
    update public.channels
    set user_id = created_by
    where user_id is null;
  end if;
end $$;

create unique index if not exists channels_name_unique_lower_idx
  on public.channels (lower(trim(name)));

alter table public.channels enable row level security;

grant select, insert on public.channels to authenticated;

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
  with check (
    auth.uid() is not null
    and user_id = auth.uid()
  );

notify pgrst, 'reload schema';
