import type { Edge, Mesh, StrutTypeSummary, Strut } from './types';

// Tolerance is in unit-sphere chord-factor units. Standard geodesic chord
// factors at 3V differ between B and C by only ~0.008, so we use a tight
// tolerance and rely on the natural symmetry of Class I subdivision (all
// edges within a true group are identical to numerical precision).
const GROUP_TOL = 0.003;
const TYPE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export interface ClassifiedEdges {
  struts: Strut[];
  strutTypes: StrutTypeSummary[];
}

interface Group {
  indices: number[];
  meanFactor: number;
}

function groupEdges(edges: Edge[], tolerance: number): Group[] {
  const sorted = edges
    .map((e, i) => ({ idx: i, cf: e.chordFactor }))
    .sort((a, b) => a.cf - b.cf);

  const groups: Group[] = [];
  let current: { indices: number[]; sum: number; count: number; prevCf: number } | null = null;

  for (const item of sorted) {
    if (current === null) {
      current = { indices: [item.idx], sum: item.cf, count: 1, prevCf: item.cf };
      continue;
    }
    // Gap-based clustering: start a new group when the gap to the previous
    // sorted value exceeds tolerance. Robust against drift in running mean.
    if (item.cf - current.prevCf <= tolerance) {
      current.indices.push(item.idx);
      current.sum += item.cf;
      current.count += 1;
      current.prevCf = item.cf;
    } else {
      groups.push({ indices: current.indices, meanFactor: current.sum / current.count });
      current = { indices: [item.idx], sum: item.cf, count: 1, prevCf: item.cf };
    }
  }
  if (current !== null) {
    groups.push({ indices: current.indices, meanFactor: current.sum / current.count });
  }

  groups.sort((a, b) => a.meanFactor - b.meanFactor);
  return groups;
}

export function classify(
  mesh: Mesh,
  radiusMm: number,
  method: 'kruschke' | 'chord'
): ClassifiedEdges {
  const groups = groupEdges(mesh.edges, GROUP_TOL);

  const strutType = new Array<string>(mesh.edges.length);
  const strutFactor = new Array<number>(mesh.edges.length);

  groups.forEach((g, gi) => {
    const letter = TYPE_LETTERS[gi] ?? `T${gi}`;
    for (const ei of g.indices) {
      strutType[ei] = letter;
      strutFactor[ei] =
        method === 'kruschke' ? g.meanFactor : mesh.edges[ei].chordFactor;
    }
  });

  const struts: Strut[] = mesh.edges.map((e, i) => ({
    id: i,
    v1: e.v1,
    v2: e.v2,
    type: strutType[i],
    chordFactor: strutFactor[i],
    length: strutFactor[i] * radiusMm,
  }));

  const summaryMap = new Map<string, StrutTypeSummary>();
  for (const s of struts) {
    const key = s.type;
    const existing = summaryMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      summaryMap.set(key, {
        type: s.type,
        chordFactor: s.chordFactor,
        length: s.length,
        count: 1,
        dihedralAngle: 0,
        tableSawTilt: 0,
      });
    }
  }

  const strutTypes = Array.from(summaryMap.values()).sort((a, b) =>
    a.length - b.length
  );

  return { struts, strutTypes };
}
