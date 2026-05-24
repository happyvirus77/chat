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

notify pgrst, 'reload schema';
