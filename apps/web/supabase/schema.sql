-- Chat persistence for Fabric Twin AI.
-- Run this in the Supabase SQL editor (or `supabase db push`).
--
-- A `chat_session` ties a Supabase auth user to a LangGraph thread; `messages`
-- holds the full transcript. Row Level Security ensures each user only ever
-- sees and writes their own rows.

create table if not exists public.chat_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  thread_id   text,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.chat_sessions (id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists chat_sessions_user_id_idx
  on public.chat_sessions (user_id, updated_at desc);
create index if not exists messages_session_id_idx
  on public.messages (session_id, created_at);

-- Row Level Security -------------------------------------------------------

alter table public.chat_sessions enable row level security;
alter table public.messages enable row level security;

-- Sessions: owner-only access.
create policy "own sessions - select"
  on public.chat_sessions for select
  using (auth.uid() = user_id);

create policy "own sessions - insert"
  on public.chat_sessions for insert
  with check (auth.uid() = user_id);

create policy "own sessions - update"
  on public.chat_sessions for update
  using (auth.uid() = user_id);

create policy "own sessions - delete"
  on public.chat_sessions for delete
  using (auth.uid() = user_id);

-- Messages: access allowed only when the parent session belongs to the user.
create policy "own messages - select"
  on public.messages for select
  using (
    exists (
      select 1 from public.chat_sessions s
      where s.id = messages.session_id and s.user_id = auth.uid()
    )
  );

create policy "own messages - insert"
  on public.messages for insert
  with check (
    exists (
      select 1 from public.chat_sessions s
      where s.id = messages.session_id and s.user_id = auth.uid()
    )
  );
