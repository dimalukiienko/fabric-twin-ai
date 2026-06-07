"use client";

import { useMemo } from "react";
import {
  Background,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Panel,
  Position,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { layoutLineGraph } from "@/lib/line-layout";
import type { LayoutPoint } from "@/lib/line-layout";
import type { LineGraph, LineNode, NodeType } from "@/lib/types/line-graph";
import type { NodeMetric, SimulationResult } from "@/lib/types/simulation";
import type { ChangeComparison, NodeChange } from "@/lib/types/improvement";

// Visual treatment per station role. Colors are inline so they survive the
// React Flow node wrapper without leaning on Tailwind's purge.
const TYPE_STYLE: Record<NodeType, { bg: string; border: string; label: string }> = {
  source: { bg: "#ecfdf5", border: "#10b981", label: "Source" },
  operation: { bg: "#eff6ff", border: "#3b82f6", label: "Operation" },
  inspection: { bg: "#fffbeb", border: "#f59e0b", label: "Inspection" },
  buffer: { bg: "#f5f3ff", border: "#8b5cf6", label: "Buffer" },
  transport: { bg: "#f8fafc", border: "#64748b", label: "Transport" },
  sink: { bg: "#fef2f2", border: "#ef4444", label: "Sink" },
};

type StationData = { node: LineNode; metric?: NodeMetric; changed?: boolean };
type HandleSide = "left" | "right" | "top" | "bottom";

const HIDDEN_HANDLE_STYLE = {
  opacity: 0,
  pointerEvents: "none",
} as const;

const HANDLE_POSITION: Record<HandleSide, Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};

function StationNode({ data }: NodeProps) {
  const { node, metric, changed } = data as StationData;
  const style = TYPE_STYLE[node.type];
  const cycle = node.cycle_time_s != null ? `${node.cycle_time_s}s/unit` : null;
  const bottleneck = metric?.is_bottleneck;
  const utilPct = metric ? Math.round(metric.utilization * 100) : null;
  const ring = bottleneck
    ? "0 0 0 3px rgba(239,68,68,0.35)"
    : changed
      ? "0 0 0 3px rgba(59,130,246,0.35)"
      : undefined;
  return (
    <div
      style={{
        background: style.bg,
        borderColor: bottleneck ? "#ef4444" : changed ? "#3b82f6" : style.border,
        boxShadow: ring,
      }}
      className="relative min-w-[150px] rounded-lg border-2 px-3 py-2 text-xs shadow-sm"
    >
      {(["left", "right", "top", "bottom"] as const).map((side) => (
        <Handle
          key={`target-${side}`}
          id={`target-${side}`}
          type="target"
          position={HANDLE_POSITION[side]}
          style={HIDDEN_HANDLE_STYLE}
        />
      ))}
      {(["left", "right", "top", "bottom"] as const).map((side) => (
        <Handle
          key={`source-${side}`}
          id={`source-${side}`}
          type="source"
          position={HANDLE_POSITION[side]}
          style={HIDDEN_HANDLE_STYLE}
        />
      ))}
      {bottleneck && (
        <span className="absolute -top-2 left-2 rounded bg-red-500 px-1 text-[9px] font-bold uppercase text-white">
          Bottleneck
        </span>
      )}
      {changed && (
        <span className="absolute -top-2 right-2 rounded bg-blue-500 px-1 text-[9px] font-bold uppercase text-white">
          Proposed
        </span>
      )}
      <div className="font-semibold text-foreground">{node.name}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {style.label}
        {node.parallelism > 1 ? ` ·×${node.parallelism}` : ""}
      </div>
      {cycle && <div className="mt-1 text-muted-foreground">{cycle}</div>}
      {node.scrap_rate > 0 && (
        <div className="text-muted-foreground">
          scrap {Math.round(node.scrap_rate * 100)}%
        </div>
      )}
      {utilPct != null && (
        <div className="mt-1 border-t pt-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">load</span>
            <span
              className="font-semibold"
              style={{ color: bottleneck ? "#ef4444" : undefined }}
            >
              {utilPct}%
            </span>
          </div>
          <div className="mt-0.5 h-1 w-full rounded bg-black/10">
            <div
              className="h-1 rounded"
              style={{
                width: `${utilPct}%`,
                background: bottleneck ? "#ef4444" : style.border,
              }}
            />
          </div>
          {metric!.avg_queue >= 0.5 && (
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              queue ≈ {metric!.avg_queue}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { station: StationNode };

export default function SceneGraph({
  graph,
  simulation,
  comparison,
}: {
  graph: LineGraph | null;
  simulation?: SimulationResult | null;
  comparison?: ChangeComparison | null;
}) {
  // A pending proposal takes over the scene: show the variant line and its
  // metrics so the user evaluates the "after" state.
  const activeGraph = comparison?.variant_graph ?? graph;
  const activeSim = comparison?.variant ?? simulation ?? null;
  const changedIds = useMemo(
    () => new Set((comparison?.changes ?? []).map((c) => c.node_id)),
    [comparison],
  );

  const { nodes, edges } = useMemo(() => {
    if (!activeGraph) return { nodes: [] as Node[], edges: [] as Edge[] };
    const pos = layoutLineGraph(activeGraph);
    const metrics = new Map(
      (activeSim?.node_metrics ?? []).map((m) => [m.node_id, m]),
    );
    const nodes: Node[] = activeGraph.nodes.map((n) => {
      const position = pos.get(n.id) ?? { x: 0, y: 0 };
      return {
        id: n.id,
        type: "station",
        position,
        data: {
          node: n,
          metric: metrics.get(n.id),
          changed: changedIds.has(n.id),
        } satisfies StationData,
      };
    });
    const edges: Edge[] = activeGraph.edges.map((e) => {
      const handles = edgeHandles(pos.get(e.source), pos.get(e.target));
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: "smoothstep",
        sourceHandle: `source-${handles.source}`,
        targetHandle: `target-${handles.target}`,
        markerEnd: { type: MarkerType.ArrowClosed },
      };
    });
    return { nodes, edges };
  }, [activeGraph, activeSim, changedIds]);

  if (!activeGraph) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Factory Layout Scene
      </div>
    );
  }

  const bottleneckName = activeSim?.bottleneck_node_id
    ? activeGraph.nodes.find((n) => n.id === activeSim.bottleneck_node_id)?.name
    : null;

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background />
      <Controls showInteractive={false} />
      {comparison ? (
        <Panel
          position="top-left"
          className="max-w-[260px] rounded-lg border border-blue-300 bg-background/95 px-3 py-2 text-xs shadow-sm"
        >
          <div className="mb-1 font-semibold text-blue-600">Proposed change</div>
          <div className="mb-2 text-muted-foreground">{comparison.rationale}</div>
          {comparison.changes.map((c) => (
            <div key={c.node_id} className="text-[11px]">
              {describeChange(c, graph)}
            </div>
          ))}
          <div className="mt-2 flex items-baseline gap-2 border-t pt-2">
            <span className="text-muted-foreground line-through">
              {comparison.baseline.line_throughput_per_hr}
            </span>
            <span className="font-semibold">→</span>
            <span className="text-base font-bold">
              {comparison.variant.line_throughput_per_hr} {activeGraph.units}/hr
            </span>
            <span
              className="font-semibold"
              style={{
                color:
                  comparison.throughput_delta_per_hr >= 0 ? "#10b981" : "#ef4444",
              }}
            >
              {comparison.throughput_delta_per_hr >= 0 ? "+" : ""}
              {comparison.throughput_delta_pct}%
            </span>
          </div>
          {bottleneckName && (
            <div className="mt-1 text-muted-foreground">
              new bottleneck: <span className="text-red-500">{bottleneckName}</span>
            </div>
          )}
        </Panel>
      ) : (
        simulation && (
          <Panel
            position="top-left"
            className="rounded-lg border bg-background/95 px-3 py-2 text-xs shadow-sm"
          >
            <div className="font-semibold">
              {simulation.line_throughput_per_hr} {activeGraph.units}/hr
            </div>
            {bottleneckName && (
              <div className="text-muted-foreground">
                bottleneck: <span className="text-red-500">{bottleneckName}</span>
              </div>
            )}
            {simulation.meets_demand != null && (
              <div
                style={{ color: simulation.meets_demand ? "#10b981" : "#ef4444" }}
              >
                {simulation.meets_demand ? "meets demand" : "below demand"}
              </div>
            )}
          </Panel>
        )
      )}
    </ReactFlow>
  );
}

function edgeHandles(
  source?: LayoutPoint,
  target?: LayoutPoint,
): { source: HandleSide; target: HandleSide } {
  if (!source || !target) return { source: "right", target: "left" };

  const dx = target.x - source.x;
  const dy = target.y - source.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { source: "right", target: "left" }
      : { source: "left", target: "right" };
  }

  return dy >= 0
    ? { source: "bottom", target: "top" }
    : { source: "top", target: "bottom" };
}

// One line per patched field, e.g. "Pack: machines ×1 → ×2".
function describeChange(change: NodeChange, baseline: LineGraph | null): string {
  const node = baseline?.nodes.find((n) => n.id === change.node_id);
  const name = node?.name ?? change.node_id;
  const parts: string[] = [];
  if (change.parallelism != null) {
    parts.push(`machines ×${node?.parallelism ?? "?"} → ×${change.parallelism}`);
  }
  if (change.cycle_time_s != null) {
    parts.push(`cycle ${node?.cycle_time_s ?? "?"}s → ${change.cycle_time_s}s`);
  }
  if (change.scrap_rate != null) {
    parts.push(
      `scrap ${Math.round((node?.scrap_rate ?? 0) * 100)}% → ${Math.round(
        change.scrap_rate * 100,
      )}%`,
    );
  }
  if (change.buffer_capacity != null) {
    parts.push(`buffer ${node?.buffer_capacity ?? "?"} → ${change.buffer_capacity}`);
  }
  return `${name}: ${parts.join(", ")}`;
}
