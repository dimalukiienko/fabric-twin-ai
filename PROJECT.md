# PROJECT.md

This file is for AI agents working in this repository. The developer-facing
overview and setup instructions live in `README.md`.

## Mission

`fabric-twin-ai` is a production-line digital twin. The user describes a line in
plain language; the agent builds a structured `LineGraph`, simulates throughput
and bottlenecks, and proposes validated changes.

The main design rule: the visual scene and the simulation must derive from the
same `LineGraph`. Do not create a separate visual-only model or simulation-only
model.

## Repository Map

```text
apps/agent/   LangGraph agent, Pydantic schemas, simulation, improvement tools
apps/web/     Next.js UI, Supabase auth/persistence, React Flow scene
README.md     Developer-facing project overview and setup
HANDOFF.md    Current implementation status and roadmap notes
Taskfile.yml  Shared local commands
```

Start by reading `README.md` and `HANDOFF.md` before making architectural
changes.

## Core Contracts

- `LineGraph` is the source of truth at runtime.
- Agent schema mirrors in TypeScript must stay synchronized by hand until a
  shared schema/codegen layer exists.
- Simulation and improvement results are transient. Persist versioned line
  graphs, not simulation snapshots.
- What-if changes are represented as patches, not whole replacement graphs.
- A proposal should not be presented as validated unless it has a simulation
  result behind it.

## Important Files

Agent:

- `apps/agent/src/agent/graph.py`
- `apps/agent/src/agent/line_graph.py`
- `apps/agent/src/agent/simulation.py`
- `apps/agent/src/agent/improvements.py`

Web:

- `apps/web/app/api/chat/route.ts`
- `apps/web/components/SceneGraph.tsx`
- `apps/web/lib/line-layout.ts`
- `apps/web/lib/types/line-graph.ts`
- `apps/web/lib/types/simulation.ts`
- `apps/web/lib/types/improvement.ts`
- `apps/web/supabase/schema.sql`

## Schema Sync Pairs

Keep these pairs aligned whenever changing model shape:

- `apps/agent/src/agent/line_graph.py` <-> `apps/web/lib/types/line-graph.ts`
- `apps/agent/src/agent/simulation.py` <-> `apps/web/lib/types/simulation.ts`
- `apps/agent/src/agent/improvements.py` <-> `apps/web/lib/types/improvement.ts`

Also update extraction/serialization logic in `apps/web/app/api/chat/route.ts`
when agent tool outputs change.

## Agent Tool Semantics

- `build_line_graph` extracts or fully rebuilds the line graph from user input.
- `run_simulation` reads the current graph from state and returns line/station
  metrics.
- `simulate_change` applies a patch to a copy, simulates baseline and variant,
  and does not mutate state.
- `apply_change` commits an accepted patch to state.

`apply_change` intentionally emits a tool message named `build_line_graph` so
the web app can extract the updated graph using the same path as initial graph
creation. Do not rename only one side of this contract.

## Known Gotchas

- Do not add `from __future__ import annotations` to
  `apps/agent/src/agent/graph.py`; it breaks LangGraph type hint handling for
  the state schema.
- `routing_weight` models OR-splits only. It is a relative choice weight, not an
  AND-split or synchronization primitive.
- UI components in `apps/web/components/ui/` are shadcn-style components built
  on Base UI. Do not run `npx shadcn add`.
- The repo uses `uv` for the Python agent and `pnpm` for the web app.
- The agent uses OpenAI models.

## Local Commands

Use the root `Taskfile.yml` when possible:

```bash
task install
task agent
task web
```

Direct equivalents:

```bash
cd apps/agent && uv run langgraph dev
cd apps/web && pnpm dev
```

## Change Guidance

- Prefer existing patterns over new abstractions.
- Keep edits scoped to the relevant app unless the contract between agent and
  web changes.
- When changing schemas, update both language definitions and any persistence or
  API extraction code.
- When changing simulation behavior, verify that the UI still receives the same
  fields or update the TypeScript types and renderer together.
- When changing persistence, review Row Level Security assumptions in
  `apps/web/supabase/schema.sql`.
- For UI work, keep the first screen as the actual application experience, not a
  marketing page.

## Current Roadmap Context

Implemented:

- Plain-language extraction into `LineGraph`.
- 2D React Flow rendering and layout.
- Discrete-event simulation.
- Bottleneck analysis.
- Simulated improvement proposals and apply flow.
- Supabase-authenticated chat/session persistence.

Open:

- 3D station asset library.
- Binding simulation state to 3D objects.
- Shared schema/codegen to remove Pydantic/TypeScript drift.
