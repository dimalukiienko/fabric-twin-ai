"""Discrete-event simulation of a LineGraph.

Material flows through the line as discrete parts; each station is a SimPy
resource whose capacity is its ``parallelism`` and whose service time is its
``cycle_time_s``. We measure steady-state throughput, per-station utilization and
queue lengths, and name the bottleneck.

Two modes:
- **Saturated** (no demand given): a CONWIP cap keeps the line full so the
  slowest station runs ~100% busy — this measures the line's *maximum* capacity
  and surfaces the bottleneck. Queues stay bounded and meaningful.
- **Open** (demand given): parts arrive at the demand rate, so utilization shows
  how hard each station works to meet that demand and whether the line keeps up.
"""

from __future__ import annotations

import random

import simpy
from pydantic import BaseModel, Field

from agent.line_graph import LineGraph

HORIZON_S = 8 * 3600.0  # simulate an 8-hour shift
WARMUP_FRACTION = 0.1  # discard transient at the start


class NodeMetric(BaseModel):
    node_id: str
    utilization: float = Field(description="Busy fraction of the station, 0..1.")
    throughput_per_hr: float = Field(description="Units passing through per hour.")
    avg_queue: float = Field(description="Time-average number of units waiting.")
    is_bottleneck: bool = False


class SimulationResult(BaseModel):
    line_throughput_per_hr: float = Field(description="Good units leaving the line per hour.")
    bottleneck_node_id: str | None = None
    meets_demand: bool | None = Field(
        default=None, description="Whether throughput meets demand_rate_per_hr, if set."
    )
    horizon_s: float = HORIZON_S
    node_metrics: list[NodeMetric] = Field(default_factory=list)


def _entrance(graph: LineGraph) -> str | None:
    """Where parts enter: an explicit source, else any node with no inflow."""
    targets = {e.target for e in graph.edges}
    for n in graph.nodes:
        if n.type == "source":
            return n.id
    for n in graph.nodes:
        if n.id not in targets:
            return n.id
    return graph.nodes[0].id if graph.nodes else None


def simulate(graph: LineGraph, horizon_s: float = HORIZON_S) -> SimulationResult:
    if not graph.nodes:
        return SimulationResult(line_throughput_per_hr=0.0)

    nodes = {n.id: n for n in graph.nodes}
    adjacency: dict[str, list[str]] = {n.id: [] for n in graph.nodes}
    for e in graph.edges:
        adjacency[e.source].append(e.target)

    start = _entrance(graph)
    warmup = horizon_s * WARMUP_FRACTION
    effective_s = horizon_s - warmup

    env = simpy.Environment()
    resources = {
        nid: simpy.Resource(env, capacity=max(1, n.parallelism))
        for nid, n in nodes.items()
    }
    rng = random.Random(42)

    # Per-station accumulators (only counted after warmup).
    wait_total = {nid: 0.0 for nid in nodes}  # queue wait summed over parts
    service_total = {nid: 0.0 for nid in nodes}  # machine-seconds of service
    seen = {nid: 0 for nid in nodes}  # parts that reached the station
    completed = 0  # good units out of the sink
    open_mode = graph.demand_rate_per_hr is not None and graph.demand_rate_per_hr > 0

    # CONWIP cap saturates the line in closed mode; None in open mode.
    wip = None
    if not open_mode:
        cap = 2 * sum(max(1, n.parallelism) for n in graph.nodes) + 5
        wip = simpy.Container(env, capacity=cap, init=cap)

    def part_proc(node_id: str | None):
        nonlocal completed
        hops = 0
        while node_id is not None and hops <= len(nodes):
            node = nodes[node_id]
            ct = node.cycle_time_s or 0.0
            recording = env.now >= warmup
            if ct > 0:
                t0 = env.now
                with resources[node_id].request() as req:
                    yield req
                    if recording:
                        wait_total[node_id] += env.now - t0
                        seen[node_id] += 1
                        service_total[node_id] += ct
                    yield env.timeout(ct)
            elif recording:
                seen[node_id] += 1
            # Scrap: the part is discarded and never reaches the sink.
            if node.scrap_rate and rng.random() < node.scrap_rate:
                if wip is not None:
                    yield wip.put(1)
                return
            succ = adjacency.get(node_id) or []
            node_id = succ[0] if succ else None
            hops += 1
        if env.now >= warmup:
            completed += 1
        if wip is not None:
            yield wip.put(1)

    def source_closed():
        while True:
            yield wip.get(1)
            env.process(part_proc(start))

    def source_open():
        interarrival = 3600.0 / graph.demand_rate_per_hr
        while True:
            yield env.timeout(interarrival)
            env.process(part_proc(start))

    env.process(source_open() if open_mode else source_closed())
    env.run(until=horizon_s)

    # Derive metrics. Little's law: avg_queue = total_wait / observation_window.
    metrics: list[NodeMetric] = []
    for nid, node in nodes.items():
        parallel = max(1, node.parallelism)
        util = service_total[nid] / (effective_s * parallel) if effective_s else 0.0
        metrics.append(
            NodeMetric(
                node_id=nid,
                utilization=round(min(util, 1.0), 4),
                throughput_per_hr=round(seen[nid] / effective_s * 3600.0, 2),
                avg_queue=round(wait_total[nid] / effective_s, 2),
            )
        )

    # Bottleneck = the busiest processing station.
    processing = [m for m in metrics if (nodes[m.node_id].cycle_time_s or 0) > 0]
    bottleneck = max(processing, key=lambda m: m.utilization, default=None)
    if bottleneck is not None:
        for m in metrics:
            m.is_bottleneck = m.node_id == bottleneck.node_id

    line_tph = round(completed / effective_s * 3600.0, 2)
    meets = None
    if graph.demand_rate_per_hr:
        meets = line_tph >= graph.demand_rate_per_hr * 0.99

    return SimulationResult(
        line_throughput_per_hr=line_tph,
        bottleneck_node_id=bottleneck.node_id if bottleneck else None,
        meets_demand=meets,
        horizon_s=horizon_s,
        node_metrics=metrics,
    )
