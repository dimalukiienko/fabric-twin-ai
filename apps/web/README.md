# fabric-twin-ai-web

The Next.js front end for Fabric Twin AI: a chat that turns a spoken production
line into a live flow diagram, with Supabase auth and per-user history. It talks
to the LangGraph agent in [`apps/agent`](../agent) over the
`@langchain/langgraph-sdk`.

## What it does

A ChatGPT-style layout (shadcn/ui sidebar) with two resizable panels:

- **Chat** (left) — the conversation with the agent. Past sessions are listed in
  the sidebar; **New chat** starts a fresh line.
- **Scene** (right) — the current LineGraph drawn as a
  [React Flow](https://reactflow.dev) diagram. Stations are colored by role
  (source / operation / inspection / buffer / transport / sink) and show cycle
  time, parallelism and scrap. After a simulation each station gains a load bar
  and queue estimate, and the bottleneck is flagged in red. A pending what-if
  proposal takes over the scene in blue, previewing the changed stations and the
  before/after throughput delta.

The LineGraph, simulation metrics and improvement proposals are produced by the
agent's tools and mirrored here as TypeScript types in `lib/types/`
(`line-graph.ts`, `simulation.ts`, `improvement.ts`) — keep these in sync with
the Python Pydantic models in `apps/agent`.

## How a turn works

`app/api/chat/route.ts` is the bridge:

1. Authenticates the user (Supabase) and resolves the chat session — reusing the
   caller's or creating a new one backed by a fresh LangGraph thread.
2. Persists the user's message, runs the agent to completion
   (`client.runs.wait`), and reads the final state.
3. Extracts the latest `build_line_graph`, `run_simulation` and
   `simulate_change` tool results from the message stream and returns them as
   `graph` / `simulation` / `comparison` alongside the reply.
4. Persists the assistant reply and stores the new line as the next **version**
   in `line_graphs`, so each session keeps a history of the line.

`app/components/ChatApp.tsx` holds the client state and renders chat + scene;
`app/components/SceneGraph.tsx` is the React Flow renderer.

## Auth & data

Supabase Auth (Email + Google) gates the app. A Next.js proxy (`proxy.ts`,
Next 16's middleware convention) refreshes the session on every request and
redirects unauthenticated users to `/auth/login`. The schema lives in
`supabase/schema.sql` — `chat_sessions`, `messages` and versioned `line_graphs`,
all under Row Level Security so each user only sees their own rows.

## Setup

Copy `.env.example` to `.env.local` and fill in:

- `LANGGRAPH_API_URL` (default `http://localhost:2024`) and
  `LANGGRAPH_ASSISTANT_ID` (default `agent`) — the running `langgraph dev`
  server.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase
  dashboard → Settings → API.

Then run `supabase/schema.sql` in the Supabase SQL editor and add
`http://localhost:3000/auth/callback` as a redirect URL (Auth → URL
Configuration). See the root [README](../../README.md) for the full Supabase
setup.

## Run

```bash
pnpm install
pnpm dev      # http://localhost:3000
```

Requires the agent server running (`cd ../agent && uv run langgraph dev`).

## Stack

Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · Base UI (`@base-ui/react`,
shadcn-style components in `components/ui/`) · React Flow (`@xyflow/react`) ·
`react-resizable-panels` · Supabase (`@supabase/ssr`) · `@langchain/langgraph-sdk`.
