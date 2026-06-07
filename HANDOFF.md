# Handoff — fabric-twin-ai

Status as of 2026-06-07. This is the working state of the production-line digital
twin, what's already built, and what's left to do.

## What this is

An agent that turns a plain-language description of a production line into a
**digital twin**. The load-bearing decision: the 2D/3D scene and the simulation
are **never generated independently** — both derive from one structured model,
the **LineGraph** (nodes = stations, edges = material flows, params = cycle
times / parallelism / scrap / buffers).

The LineGraph lives in the agent's LangGraph state (`LineState.line_graph`) —
that is the single source of truth at runtime. See the package READMEs for
detail: [`apps/agent/README.md`](apps/agent/README.md),
[`apps/web/README.md`](apps/web/README.md).

## What's been added

### Agent (`apps/agent`)
- **LineGraph schema** (`line_graph.py`) — Pydantic model with id/referential
  integrity validation. Single source of truth.
- **`build_line_graph` tool** — extracts the line from plain language and writes
  it to state via a `Command` (+ named ToolMessage). Re-called in full (never a
  diff) when the user corrects the line.
- **`run_simulation` tool** — reads the line from `InjectedState` (no args) and
  runs a **SimPy discrete-event simulation** (`simulation.py`). Saturated CONWIP
  mode finds max throughput + bottleneck; open mode (when `demand_rate_per_hr`
  is set) checks demand attainment. Returns per-station utilization / throughput
  / avg-queue.
- **Improvement loop** (`improvements.py`) — proposals are **patches**
  (`NodeChange`), not whole graphs.
  - `simulate_change(changes, rationale)` — what-if: simulates baseline +
    patched line, returns a `ChangeComparison` (variant graph + before/after +
    throughput delta). Does **not** mutate state.
  - `apply_change(changes)` — commits the patch to state, emitting a
    `build_line_graph`-named ToolMessage so the web re-renders and persists.

### Web (`apps/web`)
- **Chat + scene UI** — ChatGPT-style sidebar layout with a resizable chat panel
  and a **React Flow** scene (`SceneGraph.tsx`).
- **Live scene** — stations colored by role, per-station load bars, bottleneck
  flagged red, a throughput/bottleneck overlay panel, and a blue "Proposed"
  preview of pending what-if changes with the before/after delta.
- **`/api/chat` bridge** (`route.ts`) — authenticates, runs the agent, extracts
  the latest `build_line_graph` / `run_simulation` / `simulate_change` tool
  results, and returns them as `graph` / `simulation` / `comparison`.
- **Supabase persistence** — `chat_sessions`, `messages`, and **versioned**
  `line_graphs` tables, all under Row Level Security. Email + Google auth gated
  by the Next 16 `proxy.ts`.
- **TS type mirrors** of the Pydantic models in `lib/types/`.

### Docs / tooling
- Package READMEs document the architecture; a `doc-sync` subagent keeps them in
  sync. `Taskfile.yml` runs the two dev servers.

## 9-step roadmap status

| # | Step | Status |
|---|---|---|
| 1 | Extract description → LineGraph | ✅ Done |
| 2 | Confirm the line with the user | ✅ Done |
| 3 | Render the scene (2D React Flow) | ✅ Done |
| 4 | 2D layout optimization | ❌ Not built |
| 5 | 3D asset library | ❌ Not built |
| 6 | Bind simulation to scene objects | 🟡 Partial — metrics shown in 2D, not yet bound to 3D objects |
| 7 | Discrete-event simulation engine | ✅ Done |
| 8 | Bottleneck analysis | ✅ Done |
| 9 | Improvement + validation loop | ✅ Done |

## What needs to be added (next up)

1. **Step 4 — 2D layout optimization.** The current `layout()` in
   `SceneGraph.tsx` is a simple longest-path column assignment. Improve edge
   routing / row packing so larger lines (splits, merges, parallel branches)
   stay readable.
2. **Step 5 — 3D asset library.** A catalog of station meshes keyed by
   `NodeType`, so the scene can render in 3D instead of (or alongside) the 2D
   flow diagram.
3. **Step 6 — bind simulation to 3D.** Drive 3D object state (busy/idle, queue
   length, bottleneck highlight) from `SimulationResult`, the way the 2D nodes
   already are.
4. **Shared schema package.** LineGraph / SimulationResult / NodeChange are each
   defined **twice** and synced by hand (Pydantic in `apps/agent`, TS in
   `apps/web/lib/types`). Extract a shared source (codegen or a shared package)
   to remove the drift risk.

## Gotchas (read before touching the agent)

- **Do NOT add `from __future__ import annotations` to `graph.py`** — it breaks
  `create_agent`'s `get_type_hints` on the `NotRequired` state field.
- The agent's `pyproject.toml` needs `[build-system]` (hatchling) so `uv sync`
  installs `agent` as a package; otherwise `langgraph dev` can't import it.
- `apply_change` deliberately emits a ToolMessage **named `build_line_graph`** so
  the web's `extractLineGraph()` picks up committed changes — don't rename one
  side without the other.
- Simulation metrics and what-if comparisons are **transient**: returned to the
  web but not persisted, and cleared when a session is reopened or the line is
  rebuilt. Only the versioned LineGraph is persisted.
- Three Pydantic↔TS mirror pairs must stay in sync:
  `line_graph.py`↔`line-graph.ts`, `simulation.py`↔`simulation.ts`,
  `improvements.py`↔`improvement.ts`.
- UI components in `components/ui/` are shadcn-style but built on **Base UI**
  (`@base-ui/react`), not the shadcn CLI — don't run `npx shadcn add`.
- Repo uses **pnpm** (web) and **uv** (agent). Agent stays on OpenAI
  (`gpt-4o-mini`), not Claude.

## Run

```bash
task agent   # LangGraph server -> http://localhost:2024
task web     # Next.js app      -> http://localhost:3000
```

See the root [README](README.md) for full Supabase setup.
