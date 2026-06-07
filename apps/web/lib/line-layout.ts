import type { LineGraph } from "@/lib/types/line-graph";

export type LayoutPoint = { x: number; y: number };

const COLUMN_WIDTH = 240;
const ROW_HEIGHT = 150;
const BAND_GAP = 90;
const COLUMNS_PER_BAND = 4;
const ORDER_PASSES = 4;

type EdgeRef = { source: string; target: string };

export function layoutLineGraph(graph: LineGraph): Map<string, LayoutPoint> {
  const nodeIds = graph.nodes.map((node) => node.id);
  const nodeIndex = new Map(nodeIds.map((id, index) => [id, index]));
  const edges = graph.edges.filter(
    (edge) => nodeIndex.has(edge.source) && nodeIndex.has(edge.target),
  );
  const { predecessors, successors } = adjacency(nodeIds, edges);
  const { componentOf, components } = stronglyConnectedComponents(nodeIds, successors);
  const componentDepth = componentDepths(components, componentOf, edges, nodeIndex);

  const columns = new Map<number, string[]>();
  for (const id of nodeIds) {
    const depth = componentDepth.get(componentOf.get(id) ?? 0) ?? 0;
    const column = columns.get(depth) ?? [];
    column.push(id);
    columns.set(depth, column);
  }

  const orderedColumns = [...columns.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, ids]) => ids.sort((a, b) => (nodeIndex.get(a) ?? 0) - (nodeIndex.get(b) ?? 0)));

  improveRowOrder(orderedColumns, predecessors, successors, nodeIndex);

  const positions = new Map<string, LayoutPoint>();

  for (let bandStart = 0, yBase = 0; bandStart < orderedColumns.length;) {
    const band = orderedColumns.slice(bandStart, bandStart + COLUMNS_PER_BAND);
    const bandIndex = Math.floor(bandStart / COLUMNS_PER_BAND);
    const reversed = bandIndex % 2 === 1;
    const maxRows = Math.max(1, ...band.map((ids) => ids.length));

    band.forEach((ids, columnOffset) => {
      const visualColumn = reversed
        ? COLUMNS_PER_BAND - 1 - columnOffset
        : columnOffset;
      const yOffset = ((maxRows - ids.length) * ROW_HEIGHT) / 2;
      ids.forEach((id, rowIndex) => {
        positions.set(id, {
          x: visualColumn * COLUMN_WIDTH,
          y: yBase + yOffset + rowIndex * ROW_HEIGHT,
        });
      });
    });

    bandStart += COLUMNS_PER_BAND;
    yBase += maxRows * ROW_HEIGHT + BAND_GAP;
  }

  return positions;
}

function adjacency(nodeIds: string[], edges: EdgeRef[]) {
  const predecessors = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  const successors = new Map<string, string[]>(nodeIds.map((id) => [id, []]));

  for (const edge of edges) {
    successors.get(edge.source)?.push(edge.target);
    predecessors.get(edge.target)?.push(edge.source);
  }

  return { predecessors, successors };
}

function stronglyConnectedComponents(
  nodeIds: string[],
  successors: Map<string, string[]>,
) {
  let nextIndex = 0;
  const index = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const componentOf = new Map<string, number>();
  const components: string[][] = [];

  function visit(id: string) {
    index.set(id, nextIndex);
    lowlink.set(id, nextIndex);
    nextIndex += 1;
    stack.push(id);
    onStack.add(id);

    for (const next of successors.get(id) ?? []) {
      if (!index.has(next)) {
        visit(next);
        lowlink.set(id, Math.min(lowlink.get(id) ?? 0, lowlink.get(next) ?? 0));
      } else if (onStack.has(next)) {
        lowlink.set(id, Math.min(lowlink.get(id) ?? 0, index.get(next) ?? 0));
      }
    }

    if (lowlink.get(id) !== index.get(id)) return;

    const component: string[] = [];
    let current: string | undefined;
    do {
      current = stack.pop();
      if (current == null) break;
      onStack.delete(current);
      componentOf.set(current, components.length);
      component.push(current);
    } while (current !== id);
    components.push(component);
  }

  for (const id of nodeIds) {
    if (!index.has(id)) visit(id);
  }

  return { componentOf, components };
}

function componentDepths(
  components: string[][],
  componentOf: Map<string, number>,
  edges: EdgeRef[],
  nodeIndex: Map<string, number>,
) {
  const successors = new Map<number, Set<number>>();
  const indegree = new Map<number, number>();
  const depth = new Map<number, number>();
  const componentOrder = new Map<number, number>();

  components.forEach((component, index) => {
    successors.set(index, new Set());
    indegree.set(index, 0);
    depth.set(index, 0);
    componentOrder.set(
      index,
      Math.min(...component.map((id) => nodeIndex.get(id) ?? Number.MAX_SAFE_INTEGER)),
    );
  });

  for (const edge of edges) {
    const source = componentOf.get(edge.source);
    const target = componentOf.get(edge.target);
    if (source == null || target == null || source === target) continue;
    const outgoing = successors.get(source);
    if (!outgoing || outgoing.has(target)) continue;
    outgoing.add(target);
    indegree.set(target, (indegree.get(target) ?? 0) + 1);
  }

  const queue = [...indegree.entries()]
    .filter(([, count]) => count === 0)
    .map(([id]) => id)
    .sort((a, b) => (componentOrder.get(a) ?? 0) - (componentOrder.get(b) ?? 0));

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of successors.get(current) ?? []) {
      depth.set(next, Math.max(depth.get(next) ?? 0, (depth.get(current) ?? 0) + 1));
      indegree.set(next, (indegree.get(next) ?? 0) - 1);
      if ((indegree.get(next) ?? 0) === 0) {
        queue.push(next);
        queue.sort(
          (a, b) => (componentOrder.get(a) ?? 0) - (componentOrder.get(b) ?? 0),
        );
      }
    }
  }

  return depth;
}

function improveRowOrder(
  columns: string[][],
  predecessors: Map<string, string[]>,
  successors: Map<string, string[]>,
  nodeIndex: Map<string, number>,
) {
  const rowById = new Map<string, number>();
  const refreshRows = () => {
    rowById.clear();
    for (const ids of columns) {
      ids.forEach((id, row) => rowById.set(id, row));
    }
  };
  refreshRows();

  for (let pass = 0; pass < ORDER_PASSES; pass += 1) {
    for (let column = 1; column < columns.length; column += 1) {
      sortByNeighborMedian(columns[column], predecessors, rowById, nodeIndex);
      refreshRows();
    }
    for (let column = columns.length - 2; column >= 0; column -= 1) {
      sortByNeighborMedian(columns[column], successors, rowById, nodeIndex);
      refreshRows();
    }
  }
}

function sortByNeighborMedian(
  ids: string[],
  neighbors: Map<string, string[]>,
  rowById: Map<string, number>,
  nodeIndex: Map<string, number>,
) {
  ids.sort((a, b) => {
    const aMedian = medianNeighborRow(a, neighbors, rowById);
    const bMedian = medianNeighborRow(b, neighbors, rowById);
    if (aMedian !== bMedian) return aMedian - bMedian;

    const aRow = rowById.get(a) ?? 0;
    const bRow = rowById.get(b) ?? 0;
    if (aRow !== bRow) return aRow - bRow;

    return (nodeIndex.get(a) ?? 0) - (nodeIndex.get(b) ?? 0);
  });
}

function medianNeighborRow(
  id: string,
  neighbors: Map<string, string[]>,
  rowById: Map<string, number>,
) {
  const rows = (neighbors.get(id) ?? [])
    .map((neighbor) => rowById.get(neighbor))
    .filter((row): row is number => row != null)
    .sort((a, b) => a - b);

  if (rows.length === 0) return rowById.get(id) ?? 0;

  const middle = Math.floor(rows.length / 2);
  if (rows.length % 2 === 1) return rows[middle];
  return (rows[middle - 1] + rows[middle]) / 2;
}
