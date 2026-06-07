# fabric-twin-ai

A minimal LangGraph agent with a Next.js chat widget. The agent answers
questions about the current time by calling a `get_current_time` tool.

```
apps/
  agent/   LangGraph agent (Python) — OpenAI + get_current_time tool
  web/     Next.js chat widget that talks to the agent
```

## How it works

```
ChatWidget (browser)  ->  /api/chat (Next.js route)  ->  LangGraph server  ->  OpenAI + tool
```

The agent is a `create_agent` (OpenAI `gpt-4o-mini`) served by the
`langgraph dev` server. The Next.js API route calls it via
`@langchain/langgraph-sdk`.

Auth and chat history live entirely in the Next.js app via **Supabase**: the
`/api/chat` route authenticates the user, then persists each message and reply
to the `chat_sessions` / `messages` tables. The Python agent is unchanged — the
LangGraph `thread_id` is just stored alongside each session.

## Setup

1. **Agent key** — copy `apps/agent/.env.example` to `apps/agent/.env` and set
   `OPENAI_API_KEY`.
2. **Web env** — copy `apps/web/.env.example` to `apps/web/.env.local`
   (LangGraph defaults point at `http://localhost:2024`).
3. **Supabase** — create a project, then:
   - Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in
     `apps/web/.env.local` (Supabase dashboard → Settings → API).
   - Run `apps/web/supabase/schema.sql` in the SQL editor to create the
     `chat_sessions` / `messages` tables with Row Level Security.
   - Auth → Providers: enable **Email** (with confirmations) and **Google**.
   - Auth → URL Configuration: add `http://localhost:3000/auth/callback` as a
     redirect URL.
4. **Install** — `task install` (or run the two install commands below).

## Run

Two processes (with [Task](https://taskfile.dev)):

```bash
task agent   # LangGraph server  -> http://localhost:2024
task web     # Next.js app       -> http://localhost:3000
```

Or directly:

```bash
cd apps/agent && uv run langgraph dev      # terminal 1
cd apps/web   && pnpm dev                  # terminal 2
```

Open http://localhost:3000. You'll be redirected to `/auth/login` — sign in
with Google or email/password, then click the chat bubble and ask
*"What time is it in Tokyo?"*. Conversations are stored per user in Supabase;
use the 🕘 button to revisit past sessions and ＋ to start a new one.
