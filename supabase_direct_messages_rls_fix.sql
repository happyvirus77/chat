alter table public.direct_messages enable row level security;

grant select, insert on public.direct_messages to authenticated;

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

create index if not exists direct_messages_sender_receiver_created_at_idx
  on public.direct_messages (sender_id, receiver_id, created_at);

create index if not exists direct_messages_receiver_sender_created_at_idx
  on public.direct_messages (receiver_id, sender_id, created_at);

notify pgrst, 'reload schema';
