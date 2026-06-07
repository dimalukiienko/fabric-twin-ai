// The LineGraph schema — the single source of truth for a production line.
//
// Both the 2D scene and (later) the simulation derive from this one structured
// model: nodes are operations/stations, edges are material flows, and the
// parameters drive everything downstream. Keep this in sync with the Pydantic
// mirror at apps/agent/src/agent/line_graph.py.

export type NodeType =
  | "source"
  | "operation"
  | "inspection"
  | "buffer"
  | "transport"
  | "sink";

export type LineNode = {
  id: string; // stable slug, e.g. "weld-1", unique within the line
  name: string; // human label, e.g. "Welding"
  type: NodeType;
  cycle_time_s?: number | null; // seconds to process one unit
  parallelism: number; // # parallel machines/operators (>= 1)
  scrap_rate: number; // fraction scrapped here (0..1)
  buffer_capacity?: number | null; // units of storage, for buffer nodes
  notes?: string | null; // per-node assumption note
};

export type LineEdge = {
  id: string;
  source: string; // upstream node id
  target: string; // downstream node id
  transport_time_s?: number | null;
};

export type LineGraph = {
  name: string;
  units: string; // what a unit of flow is, e.g. "parts"
  demand_rate_per_hr?: number | null; // target throughput, units/hour
  nodes: LineNode[];
  edges: LineEdge[];
  assumptions: string[]; // industry defaults the agent filled in
};
