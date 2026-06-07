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

## Setup

1. **Agent key** — copy `apps/agent/.env.example` to `apps/agent/.env` and set
   `OPENAI_API_KEY`.
2. **Web env** — copy `apps/web/.env.example` to `apps/web/.env.local`
   (defaults point at `http://localhost:2024`).
3. **Install** — `task install` (or run the two install commands below).

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

Open http://localhost:3000, click the chat bubble, and ask
*"What time is it in Tokyo?"*.
