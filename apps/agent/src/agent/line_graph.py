"""The LineGraph schema — the single source of truth for a production line.

Both the 3D scene and the simulation are derived from this one structured model:
nodes are operations/stations, edges are material flows, and the parameters
(cycle times, buffers, scrap) drive everything downstream. Keep this in sync with
the TypeScript mirror at ``apps/web/lib/types/line-graph.ts``.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

NodeType = Literal["source", "operation", "inspection", "buffer", "transport", "sink"]


class LineNode(BaseModel):
    """A station in the line: an operation, inspection, buffer, source or sink."""

    id: str = Field(description="Stable slug, e.g. 'weld-1'. Unique within the line.")
    name: str = Field(description="Human label, e.g. 'Welding'.")
    type: NodeType = Field(description="The role this station plays in the flow.")
    cycle_time_s: float | None = Field(
        default=None, description="Seconds to process one unit at this station."
    )
    parallelism: int = Field(
        default=1, ge=1, description="Number of identical parallel machines/operators."
    )
    scrap_rate: float = Field(
        default=0.0, ge=0.0, le=1.0, description="Fraction of units scrapped here (0..1)."
    )
    buffer_capacity: int | None = Field(
        default=None, ge=0, description="Units of storage, for buffer nodes."
    )
    notes: str | None = Field(
        default=None, description="Per-node assumption note, e.g. a defaulted value."
    )


class LineEdge(BaseModel):
    """A material flow from one station to the next."""

    id: str = Field(description="Stable slug, unique within the line.")
    source: str = Field(description="Id of the upstream node.")
    target: str = Field(description="Id of the downstream node.")
    transport_time_s: float | None = Field(
        default=None, description="Seconds to move a unit along this flow."
    )
    routing_weight: float | None = Field(
        default=None,
        gt=0.0,
        description=(
            "Relative share of flow to this edge when the source has multiple "
            "outgoing routes. If omitted, outgoing routes split evenly."
        ),
    )


class LineGraph(BaseModel):
    """A complete production line: the canonical model everything derives from."""

    name: str = Field(description="Short name for the line.")
    units: str = Field(default="parts", description="What a unit of flow is, e.g. 'parts'.")
    demand_rate_per_hr: float | None = Field(
        default=None, description="Target throughput in units/hour, if stated."
    )
    nodes: list[LineNode] = Field(default_factory=list)
    edges: list[LineEdge] = Field(default_factory=list)
    assumptions: list[str] = Field(
        default_factory=list,
        description="Industry defaults the agent filled in for missing data.",
    )

    @model_validator(mode="after")
    def _check_integrity(self) -> LineGraph:
        ids = [n.id for n in self.nodes]
        if len(ids) != len(set(ids)):
            raise ValueError("node ids must be unique")

        edge_ids = [e.id for e in self.edges]
        if len(edge_ids) != len(set(edge_ids)):
            raise ValueError("edge ids must be unique")

        known = set(ids)
        for e in self.edges:
            if e.source not in known:
                raise ValueError(f"edge {e.id!r} has unknown source {e.source!r}")
            if e.target not in known:
                raise ValueError(f"edge {e.id!r} has unknown target {e.target!r}")
        return self
