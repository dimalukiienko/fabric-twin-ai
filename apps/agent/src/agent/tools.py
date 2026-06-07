"""Tools exposed to the manufacturing-process agent."""

import json
from typing import Annotated

from langchain_core.messages import ToolMessage
from langchain_core.tools import InjectedToolCallId, tool
from langgraph.prebuilt import InjectedState
from langgraph.types import Command

from agent.improvements import NodeChange, apply_changes, compare
from agent.line_graph import LineGraph
from agent.simulation import simulate
from agent.state import LineState


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
    corrects something \u2014 never a partial diff.
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
    no arguments \u2014 it reads the line you already built. Returns per-station
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

    Use this to validate an improvement you want to propose \u2014 adding a parallel
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
