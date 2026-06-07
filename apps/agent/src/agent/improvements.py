"""The improvement / validation loop.

The agent proposes a change to the line as a small patch (not a whole new graph),
we apply it to a copy of the current line and re-simulate, then compare before vs
after. Every proposal is validated by the simulator — no improvement is asserted
without a number behind it. Keep ``NodeChange`` in sync with the TS mirror at
``apps/web/lib/types/improvement.ts``.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from agent.line_graph import LineGraph
from agent.simulation import SimulationResult, simulate


class NodeChange(BaseModel):
    """A patch to one station: only the provided fields are overridden."""

    node_id: str = Field(description="Id of the station to change.")
    parallelism: int | None = Field(
        default=None, description="New number of parallel machines/operators."
    )
    cycle_time_s: float | None = Field(
        default=None, description="New seconds per unit."
    )
    scrap_rate: float | None = Field(default=None, description="New scrap fraction 0..1.")
    buffer_capacity: int | None = Field(
        default=None, description="New buffer size in units."
    )


class ChangeComparison(BaseModel):
    """Before/after result for a proposed change."""

    rationale: str = Field(description="What the change is and why it should help.")
    changes: list[NodeChange]
    variant_graph: LineGraph = Field(description="The line with the change applied.")
    baseline: SimulationResult
    variant: SimulationResult
    throughput_delta_per_hr: float
    throughput_delta_pct: float


def apply_changes(graph: LineGraph, changes: list[NodeChange]) -> LineGraph:
    """Return a copy of the line with each patch applied to its node."""
    variant = graph.model_copy(deep=True)
    by_id = {n.id: n for n in variant.nodes}
    for ch in changes:
        node = by_id.get(ch.node_id)
        if node is None:
            raise ValueError(f"unknown node {ch.node_id!r}")
        if ch.parallelism is not None:
            node.parallelism = ch.parallelism
        if ch.cycle_time_s is not None:
            node.cycle_time_s = ch.cycle_time_s
        if ch.scrap_rate is not None:
            node.scrap_rate = ch.scrap_rate
        if ch.buffer_capacity is not None:
            node.buffer_capacity = ch.buffer_capacity
    # Re-validate (catches e.g. an out-of-range scrap rate).
    return LineGraph.model_validate(variant.model_dump())


def compare(
    graph: LineGraph, changes: list[NodeChange], rationale: str
) -> ChangeComparison:
    """Simulate the current line and the patched line, and diff their throughput."""
    baseline = simulate(graph)
    variant_graph = apply_changes(graph, changes)
    variant = simulate(variant_graph)

    delta = round(variant.line_throughput_per_hr - baseline.line_throughput_per_hr, 2)
    pct = (
        round(delta / baseline.line_throughput_per_hr * 100, 1)
        if baseline.line_throughput_per_hr
        else 0.0
    )
    return ChangeComparison(
        rationale=rationale,
        changes=changes,
        variant_graph=variant_graph,
        baseline=baseline,
        variant=variant,
        throughput_delta_per_hr=delta,
        throughput_delta_pct=pct,
    )
