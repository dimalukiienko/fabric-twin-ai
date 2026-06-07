// Result of a discrete-event simulation run over a LineGraph. Keep in sync with
// the Pydantic mirror at apps/agent/src/agent/simulation.py.

export type NodeMetric = {
  node_id: string;
  utilization: number; // busy fraction of the station, 0..1
  throughput_per_hr: number; // units passing through per hour
  avg_queue: number; // time-average number of units waiting
  is_bottleneck: boolean;
};

export type SimulationResult = {
  line_throughput_per_hr: number; // good units leaving the line per hour
  bottleneck_node_id: string | null;
  meets_demand: boolean | null; // vs demand_rate_per_hr, if it was set
  horizon_s: number;
  node_metrics: NodeMetric[];
};
