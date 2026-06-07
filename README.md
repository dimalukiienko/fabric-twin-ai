# fabric-twin-ai

A digital twin for production lines. Describe a line in plain language — the
steps parts go through and how many machines at each — and a LangGraph agent
turns it into a structured model, simulates its throughput and bottleneck, and
proposes validated improvements. A Next.js app shows the line as a live flow
diagram next to the chat.

```
apps/
  agent/   LangGraph agent (Python) — builds + simulates + improves the line
  web/     Next.js chat + flow-diagram UI, with Supabase auth and persistence
```

## How it works

```
Chat UI (browser)  ->  /api/chat (Next.js)  ->  LangGraph server  ->  OpenAI + tools
      ^                                                                     |
      |  line graph + simulation metrics + before/after proposals          |
      +---------------------------------------------------------------------+
```

The agent is a manufacturing-process engineer. Everything derives from one
structured model — the **LineGraph** — which lives in the agent's state as the
single source of truth: nodes are stations (operations, inspections, buffers,
source/sink) with cycle times, parallelism and scrap; edges are material flows.

Four tools drive the loop:

- **`build_line_graph`** — turns the user's description into the LineGraph and
  writes it to state (also re-built whenever the user corrects the line).
- **`run_simulation`** — a SimPy discrete-event simulation of the current line.
  Returns per-station utilization, queue lengths and throughput, plus the line
  throughput and the bottleneck station. Runs *saturated* (max capacity) when no
  demand is given, *open* (arrival-driven) when a demand rate is set.
- **`simulate_change`** — a what-if: applies a patch (add a parallel machine,
  speed up a station, cut scrap, enlarge a buffer) to a copy of the line and
  returns a before/after throughput comparison. No proposal is asserted without
  a number behind it.
- **`apply_change`** — commits an accepted proposal so it becomes the new
  baseline.

The web UI is a ChatGPT-style layout (shadcn/ui sidebar) with the conversation
on the left and a resizable scene on the right. The scene renders the LineGraph
as a React Flow diagram: stations colored by role, per-station load bars, the
bottleneck flagged in red, and any pending proposal previewed in blue with its
throughput delta.

Auth and history live in the Next.js app via **Supabase**: `/api/chat`
authenticates the user, runs the agent, then persists each message, the reply,
and every version of the line to the `chat_sessions` / `messages` /
`line_graphs` tables (all under Row Level Security). The LangGraph `thread_id`
is stored alongside each session.

See [`apps/agent/README.md`](apps/agent/README.md) and
[`apps/web/README.md`](apps/web/README.md) for per-app detail.

## Setup

1. **Agent key** — copy `apps/agent/.env.example` to `apps/agent/.env` and set
   `OPENAI_API_KEY`.
2. **Web env** — copy `apps/web/.env.example` to `apps/web/.env.local`
   (LangGraph defaults point at `http://localhost:2024`).
3. **Supabase** — create a project, then:
   - Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in
     `apps/web/.env.local` (Supabase dashboard → Settings → API).
   - Run `apps/web/supabase/schema.sql` in the SQL editor to create the
     `chat_sessions` / `messages` / `line_graphs` tables with Row Level Security.
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
with Google or email/password, then describe a line, e.g. *"Parts are cut, then
welded by two welders, painted, inspected, and packed."* Ask *"What's the
throughput and where's the bottleneck?"* to simulate it, then *"How do I get to
80 parts/hour?"* to get a validated improvement. Conversations and line versions
are stored per user in Supabase; pick a past chat from the sidebar or hit
**New chat** to start fresh.
