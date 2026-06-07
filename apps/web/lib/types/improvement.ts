// A proposed improvement and its before/after comparison. Keep in sync with the
// Pydantic mirror at apps/agent/src/agent/improvements.py.

import type { LineGraph } from "./line-graph";
import type { SimulationResult } from "./simulation";

export type NodeChange = {
  node_id: string;
  parallelism?: number | null;
  cycle_time_s?: number | null;
  scrap_rate?: number | null;
  buffer_capacity?: number | null;
};

export type ChangeComparison = {
  rationale: string;
  changes: NodeChange[];
  variant_graph: LineGraph; // the line with the change applied
  baseline: SimulationResult;
  variant: SimulationResult;
  throughput_delta_per_hr: number;
  throughput_delta_pct: number;
};
