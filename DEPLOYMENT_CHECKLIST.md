# Deployment Checklist

## App Features

- Supabase Auth email/password login and signup work.
- A new user creates or reuses one row in `public.profiles`.
- Channels load from `public.channels`.
- Channel creation inserts `name`, `description`, and `user_id`.
- Duplicate channel names are blocked by the `channels_name_unique_lower_idx` unique index.
- Channel messages load by the selected `channel_id`, sorted by `created_at` ascending.
- Channel message sends insert directly into `public.messages`.
- Channel realtime receives `INSERT` events from `public.messages`.
- Image uploads use the `chat-images` Storage bucket and save the public URL in `messages.image_url` or `direct_messages.image_url`.
- Presence uses channel-scoped Realtime Presence and removes users after disconnect.
- DM profile list loads from `public.profiles` and excludes the logged-in user.
- DM messages load where the logged-in user is either `sender_id` or `receiver_id`.
- DM sends insert directly into `public.direct_messages`.
- DM realtime receives `INSERT` events from `public.direct_messages`.
- Empty, loading, and error states are visible in the UI.
- Responsive layout keeps the DM button available on small screens.

## Supabase SQL Setup

Run the focused SQL files below in the Supabase SQL Editor for an existing project:

1. `supabase_dm_profiles_fix.sql`
2. `supabase_channels_user_id_fix.sql`
3. `supabase_messages_rls_fix.sql`
4. `supabase_direct_messages_rls_fix.sql`
5. `supabase_chat_images_storage_fix.sql`
6. `supabase_messages_realtime_fix.sql`

For a fresh database, `supabase_schema.sql` contains the core table and RLS setup. The app does not use `rpc("send_message")`; messages are inserted directly into `messages` and `direct_messages`.

## Required Tables

- `public.profiles`
  - `id uuid primary key references auth.users(id)`
  - `email text`
  - `username text`
  - `display_name text`
  - `avatar_url text`
  - `created_at timestamptz`
- `public.channels`
  - `id uuid`
  - `name text unique`
  - `description text`
  - `user_id uuid references public.profiles(id)`
  - `created_at timestamptz`
- `public.messages`
  - `id uuid`
  - `channel_id uuid references public.channels(id)`
  - `user_id uuid references public.profiles(id)`
  - `content text`
  - `image_url text`
  - `created_at timestamptz`
- `public.direct_messages`
  - `id uuid`
  - `sender_id uuid references public.profiles(id)`
  - `receiver_id uuid references public.profiles(id)`
  - `content text`
  - `image_url text`
  - `created_at timestamptz`

## RLS Checklist

- `profiles`: authenticated users can select profiles, insert their own profile, and update their own profile.
- `channels`: authenticated users can select channels and insert rows where `user_id = auth.uid()`.
- `messages`: authenticated users can select messages and insert rows where `user_id = auth.uid()`.
- `direct_messages`: authenticated users can select rows where they are the sender or receiver, and insert rows where `sender_id = auth.uid()`.
- `storage.objects`: authenticated users can upload into the `chat-images` bucket according to the policy in `supabase_chat_images_storage_fix.sql`.

## Storage Checklist

- Bucket name is exactly `chat-images`.
- Bucket is public, because the app renders images through public URLs.
- Upload policy allows authenticated users to insert image objects.
- If upload fails with `Bucket not found`, run `supabase_chat_images_storage_fix.sql`.
- If upload fails with 403, check the Storage RLS policy for `storage.objects`.

## Realtime Checklist

- `public.messages` is added to the `supabase_realtime` publication.
- `public.direct_messages` is added to the `supabase_realtime` publication.
- Realtime is enabled in the Supabase dashboard for both tables.
- Presence does not require a table; it uses Supabase Realtime channels.

## GitHub Pages

`vite.config.js` already supports GitHub Pages:

```js
base: process.env.VITE_BASE_PATH || './'
```

For a project page like `https://USERNAME.github.io/REPOSITORY/`, build with:

```bash
VITE_BASE_PATH=/REPOSITORY/ npm run build
```

On Windows PowerShell:

```powershell
$env:VITE_BASE_PATH='/REPOSITORY/'; npm run build
```

Deploy the generated `dist` folder.

## Recommended Component Split

- `AuthPanel`: login, signup, logout, profile bootstrap.
- `ChannelSidebar`: channel list and channel creation.
- `ChatPanel`: selected channel or selected DM shell.
- `MessageList`: channel and DM message rendering.
- `MessageComposer`: text input, image input, upload/send states.
- `DirectMessagesPanel`: user list and selected DM state.
- `PresencePanel`: online users for the selected channel.
- Hooks: `useAuth`, `useChannels`, `useMessages`, `useDirectMessages`, `usePresence`.
