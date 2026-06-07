"""A LangGraph agent that turns a spoken description of a production line into a
structured LineGraph and simulates it.

The LineGraph lives in the agent's state — the single source of truth.
``build_line_graph`` writes it there; ``run_simulation`` reads it back and runs a
discrete-event simulation, so the model never has to re-pass the line.
"""

import json
from typing import Annotated

from langchain.agents import AgentState, create_agent
from langchain_core.messages import ToolMessage
from langchain_core.tools import InjectedToolCallId, tool
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import InjectedState
from langgraph.types import Command
from typing_extensions import NotRequired

from agent.improvements import NodeChange, apply_changes, compare
from agent.line_graph import LineGraph
from agent.simulation import simulate


class LineState(AgentState):
    """Agent state plus the current production line — the single source of truth."""

    line_graph: NotRequired[dict | None]


@tool
def build_line_graph(
    graph: LineGraph,
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """Build or rebuild the structured production-line model.

    Pass the full line: every station as a node (with cycle times, parallelism,
    scrap rate and buffers) and every material flow as an edge. Record any value
    you defaulted rather than got from the user in `assumptions` or the node's
    `notes`. Call this again with the complete updated line whenever the user
    corrects something — never a partial diff.
    """
    canonical = graph.model_dump_json()
    return Command(
        update={
            "line_graph": graph.model_dump(),
            "messages": [
                ToolMessage(canonical, tool_call_id=tool_call_id, name="build_line_graph")
            ],
        }
    )


@tool
def run_simulation(state: Annotated[LineState, InjectedState]) -> str:
    """Simulate the current line to find its throughput and bottleneck.

    Use this whenever the user asks how much the line can produce, where the
    constraint is, how busy a station is, or whether the line meets demand. Takes
    no arguments — it reads the line you already built. Returns per-station
    utilization, throughput and queue lengths plus the overall throughput and the
    bottleneck station.
    """
    raw = state.get("line_graph")
    if not raw:
        return json.dumps(
            {"error": "No line has been built yet. Build the line first."}
        )
    result = simulate(LineGraph.model_validate(raw))
    return result.model_dump_json()


@tool
def simulate_change(
    changes: list[NodeChange],
    rationale: str,
    state: Annotated[LineState, InjectedState],
) -> str:
    """Try a what-if improvement and get a before/after comparison.

    Use this to validate an improvement you want to propose — adding a parallel
    machine (raise `parallelism`), speeding up a station (lower `cycle_time_s`),
    cutting scrap, or enlarging a buffer. Pass the changed stations as patches and
    a short `rationale`. This does NOT change the line; it simulates the current
    line and the patched line and returns both results with the throughput delta.
    Always validate a proposal here before claiming it helps.
    """
    raw = state.get("line_graph")
    if not raw:
        return json.dumps({"error": "No line has been built yet. Build the line first."})
    try:
        result = compare(LineGraph.model_validate(raw), changes, rationale)
    except Exception as exc:  # invalid patch (unknown node, bad value)
        return json.dumps({"error": str(exc)})
    return result.model_dump_json()


@tool
def apply_change(
    changes: list[NodeChange],
    tool_call_id: Annotated[str, InjectedToolCallId],
    state: Annotated[LineState, InjectedState],
) -> Command:
    """Commit a change to the line once the user accepts it.

    Applies the same patches as `simulate_change` to the real line so it becomes
    the new baseline. Call this only after the user agrees to the proposal, then
    call `run_simulation` to show the improved line's metrics.
    """
    raw = state.get("line_graph")
    if not raw:
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        json.dumps({"error": "No line has been built yet."}),
                        tool_call_id=tool_call_id,
                        name="apply_change",
                    )
                ]
            }
        )
    new_graph = apply_changes(LineGraph.model_validate(raw), changes)
    return Command(
        update={
            "line_graph": new_graph.model_dump(),
            "messages": [
                ToolMessage(
                    new_graph.model_dump_json(),
                    tool_call_id=tool_call_id,
                    name="build_line_graph",
                )
            ],
        }
    )


model = ChatOpenAI(model="gpt-4o-mini", max_completion_tokens=2048)

SYSTEM_PROMPT = (
    "You are a manufacturing process engineer. You turn a user's plain-language "
    "description of a production line into a structured model, then simulate it.\n\n"
    "Building the line:\n"
    "1. Identify the sequence of stations (operations, inspections, buffers) and "
    "how material flows between them.\n"
    "   When one station has multiple outgoing routes and each unit chooses one "
    "route (OR-split), set each edge's `routing_weight` as the relative flow "
    "share. If the user does not specify shares, use equal weights and record "
    "that assumption. Do not use routing weights for true AND-splits where every "
    "unit must go through multiple branches.\n"
    "2. Ask focused clarifying questions ONLY when something essential to the "
    "flow is missing or ambiguous (order of steps, parallel machines, where "
    "material splits or merges). A couple of pointed questions at most.\n"
    "3. Fill sensible industry defaults for unstated cycle times, scrap rates, "
    "parallelism or buffers rather than blocking. Record EVERY assumed value in "
    "the graph's `assumptions` list or the node's `notes`, so the user can "
    "correct it.\n"
    "4. Call `build_line_graph` with the full line. Always include a source node "
    "(parts enter) and a sink node (finished units leave). Use short stable ids "
    "like 'weld-1'.\n"
    "5. Summarize the line in plain language and ask the user to confirm.\n\n"
    "Simulating:\n"
    "When the user asks about output, capacity, bottlenecks, station load, or "
    "whether the line meets demand, call `run_simulation` (no arguments). Then "
    "explain the result in human terms: state the throughput in units/hour, name "
    "the bottleneck station and why (it runs near 100% while others wait), and — "
    "if a demand was given — whether the line keeps up. Be concrete, e.g. 'your "
    "line tops out around 40 parts/hour because packing is the constraint; "
    "everything upstream sits idle waiting for it.'\n\n"
    "Improving the line:\n"
    "When the user asks how to improve output, relieve the bottleneck, or hit a "
    "target, propose a CONCRETE change and validate it with `simulate_change` "
    "before claiming anything. Attack the bottleneck first (add a parallel "
    "machine there, speed it up, or cut its scrap). Report the before/after "
    "honestly, e.g. 'adding a second packer lifts the line from 40 to 80 "
    "parts/hour (+100%); the bottleneck moves to welding.' If a change barely "
    "helps, say so — often only the bottleneck matters. When the user accepts a "
    "proposal, call `apply_change` to commit it, then `run_simulation` to show "
    "the improved line.\n\n"
    "When the user corrects the line, call `build_line_graph` again with the full "
    "updated model, then re-simulate if performance is what they care about."
)

# Exposed to the LangGraph server via langgraph.json.
graph = create_agent(
    model,
    tools=[build_line_graph, run_simulation, simulate_change, apply_change],
    system_prompt=SYSTEM_PROMPT,
    state_schema=LineState,
)
