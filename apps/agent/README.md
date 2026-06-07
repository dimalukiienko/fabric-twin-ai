# fabric-twin-ai-agent

The LangGraph agent behind Fabric Twin AI. It plays a manufacturing-process
engineer: it turns a plain-language description of a production line into a
structured model, simulates it, and proposes validated improvements.

## The model

Everything derives from one structured model — the **LineGraph** — which lives
in the agent's state as the single source of truth (`LineState.line_graph`).

- `line_graph.py` — the Pydantic schema. `LineNode` (id, type, `cycle_time_s`,
  `parallelism`, `scrap_rate`, `buffer_capacity`), `LineEdge` (material flow),
  and `LineGraph` (nodes, edges, `units`, optional `demand_rate_per_hr`,
  `assumptions`). Node/edge ids are validated for uniqueness and referential
  integrity. Keep this in sync with the TS mirror at
  `apps/web/lib/types/line-graph.ts`.
- `simulation.py` — a [SimPy](https://simpy.readthedocs.io) discrete-event
  simulation. Each station is a resource with capacity = `parallelism` and
  service time = `cycle_time_s`; parts flow along the edges and may be scrapped.
  Over an 8-hour shift (with a warm-up discard) it measures per-station
  utilization, time-average queue length and throughput, the line throughput,
  and the bottleneck. Runs in two modes:
  - **Saturated** (no demand): a CONWIP cap keeps the line full so the slowest
    station runs ~100% busy — this measures *maximum* capacity and surfaces the
    bottleneck.
  - **Open** (demand given): parts arrive at the demand rate, so utilization
    shows how hard each station works and whether the line keeps up.
- `improvements.py` — the improvement/validation loop. A `NodeChange` is a small
  patch to one station; `compare()` applies it to a copy of the line,
  re-simulates, and returns a before/after `ChangeComparison` with the
  throughput delta. No improvement is asserted without a number behind it. Keep
  in sync with `apps/web/lib/types/improvement.ts`.

## The graph

`graph.py` wires it together with `create_agent` (OpenAI `gpt-4o-mini`) and a
`LineState` that carries the LineGraph. Four tools:

| Tool | What it does |
| --- | --- |
| `build_line_graph` | Writes the full LineGraph to state. Called again (never a diff) whenever the user corrects the line. |
| `run_simulation` | Reads the line from state and simulates it; returns metrics. Takes no arguments. |
| `simulate_change` | What-if: returns a before/after comparison for a proposed patch. Does not mutate the line. |
| `apply_change` | Commits an accepted patch so it becomes the new baseline. |

The graph is exposed to the LangGraph server as `agent` via `langgraph.json`.

## Run

```bash
uv sync                # install deps
uv run langgraph dev   # serve on http://localhost:2024
```

Set `OPENAI_API_KEY` in `.env` (copy from `.env.example`). LangSmith tracing
vars are optional. The Next.js app in `apps/web` calls this server over the
`@langchain/langgraph-sdk`.

## Layout

```
src/agent/
  graph.py         create_agent + the four tools + system prompt
  line_graph.py    LineGraph schema (single source of truth)
  simulation.py    SimPy discrete-event simulation
  improvements.py  patch / compare / apply improvement loop
langgraph.json     exposes graph.py:graph as the "agent" assistant
```
