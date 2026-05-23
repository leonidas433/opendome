import type { Mesh, NodeCut, Strut, Vec3 } from './types';
import { cross, dot, normalize, sub } from './vec';

const RAD2DEG = 180 / Math.PI;
const CUT_GROUP_TOL = 0.5;

interface RawCut {
  nodeType: string;
  strutType: string;
  miter: number;
  bevel: number;
}

function nodeTypeFromValence(valence: number): string {
  if (valence === 5) return 'pentagonal';
  if (valence === 6) return 'hexagonal';
  return `boundary-${valence}`;
}

// Compound miter saw formulas (carpentry standard for crown molding):
//   miter = atan(cos(S) * tan(P))
//   bevel = asin(sin(S) * sin(P))
// where:
//   S = slope angle: angle the strut makes with the tangent plane at the
//       node. S = 90° - angle_between(strut_axis, vertex_normal).
//   P = plan angle: half of the face angle between this strut and its
//       angular neighbors at the node, measured in the tangent plane.
function computeCut(
  S: number,
  P: number
): { miter: number; bevel: number } {
  const miter = Math.abs(Math.atan(Math.cos(S) * Math.tan(P)) * RAD2DEG);
  const bevel = Math.abs(Math.asin(Math.sin(S) * Math.sin(P)) * RAD2DEG);
  return { miter, bevel };
}

interface NeighborProjection {
  strutId: number;
  // angle in tangent plane, in (-π, π]
  angleTangent: number;
  // slope angle of this strut at this vertex (radians)
  slope: number;
}

// For a vertex V, build the projected angles of all incident struts in the
// tangent plane. Returns the average face angle at V (in radians).
function projectIncidents(
  vertexPos: Vec3,
  incidentStruts: Array<{ strutId: number; otherPos: Vec3 }>
): { proj: NeighborProjection[]; avgFaceAngle: number } {
  const n = normalize(vertexPos);

  // Build a tangent-plane basis (u, w) at V.
  // Choose any vector not parallel to n; project to get u.
  const seed: Vec3 = Math.abs(n.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const u = normalize({
    x: seed.x - n.x * dot(seed, n),
    y: seed.y - n.y * dot(seed, n),
    z: seed.z - n.z * dot(seed, n),
  });
  const w = cross(n, u);

  const proj: NeighborProjection[] = incidentStruts.map((s) => {
    const dir = normalize(sub(s.otherPos, vertexPos));
    const cosA = Math.max(-1, Math.min(1, dot(dir, n)));
    const slope = Math.PI / 2 - Math.acos(cosA);
    // Project dir onto tangent plane
    const tx = dot(dir, u);
    const ty = dot(dir, w);
    const angleTangent = Math.atan2(ty, tx);
    return { strutId: s.strutId, angleTangent, slope };
  });

  proj.sort((a, b) => a.angleTangent - b.angleTangent);

  // Compute consecutive gaps around the circle
  let sum = 0;
  for (let i = 0; i < proj.length; i++) {
    const a = proj[i].angleTangent;
    const b = proj[(i + 1) % proj.length].angleTangent;
    let gap = b - a;
    if (i === proj.length - 1) gap += 2 * Math.PI;
    if (gap < 0) gap += 2 * Math.PI;
    sum += gap;
  }
  // For a closed node, sum ≈ 2π; for a boundary node we still divide by
  // valence to get the average local face angle, but skip the wraparound
  // wedge that crosses the missing-edge gap.
  const avgFaceAngle = sum / proj.length;

  return { proj, avgFaceAngle };
}

export interface CutAnglesResult {
  nodeCuts: NodeCut[];
  strutCuts: Array<{
    strutId: number;
    cut1: { node: string; miter: number; bevel: number };
    cut2: { node: string; miter: number; bevel: number };
  }>;
}

export function cutAngles(mesh: Mesh, struts: Strut[]): CutAnglesResult {
  // Build adjacency: for each vertex, list of (strutId, otherVertexId)
  const adjacency = new Map<number, Array<{ strutId: number; other: number }>>();
  for (const s of struts) {
    const a = adjacency.get(s.v1) ?? [];
    a.push({ strutId: s.id, other: s.v2 });
    adjacency.set(s.v1, a);
    const b = adjacency.get(s.v2) ?? [];
    b.push({ strutId: s.id, other: s.v1 });
    adjacency.set(s.v2, b);
  }

  // For each vertex compute the per-strut tangential projection and the
  // average face angle (used as 2P).
  const vertexInfo = new Map<
    number,
    { faceAngle: number; bySterut: Map<number, NeighborProjection> }
  >();
  for (const [vid, list] of adjacency) {
    const pos = mesh.vertices[vid].pos;
    const incidents = list.map((x) => ({
      strutId: x.strutId,
      otherPos: mesh.vertices[x.other].pos,
    }));
    const { proj, avgFaceAngle } = projectIncidents(pos, incidents);
    const m = new Map<number, NeighborProjection>();
    for (const p of proj) m.set(p.strutId, p);
    vertexInfo.set(vid, { faceAngle: avgFaceAngle, bySterut: m });
  }

  const raws: RawCut[] = [];
  const strutCuts: CutAnglesResult['strutCuts'] = [];

  for (const s of struts) {
    const va = mesh.vertices[s.v1];
    const vb = mesh.vertices[s.v2];

    const infoA = vertexInfo.get(s.v1)!;
    const infoB = vertexInfo.get(s.v2)!;

    const slopeA = infoA.bySterut.get(s.id)!.slope;
    const slopeB = infoB.bySterut.get(s.id)!.slope;

    const Pa = infoA.faceAngle / 2;
    const Pb = infoB.faceAngle / 2;

    const cutA = computeCut(slopeA, Pa);
    const cutB = computeCut(slopeB, Pb);

    const nodeA = nodeTypeFromValence(va.valence);
    const nodeB = nodeTypeFromValence(vb.valence);

    raws.push({ nodeType: nodeA, strutType: s.type, miter: cutA.miter, bevel: cutA.bevel });
    raws.push({ nodeType: nodeB, strutType: s.type, miter: cutB.miter, bevel: cutB.bevel });

    strutCuts.push({
      strutId: s.id,
      cut1: { node: nodeA, miter: cutA.miter, bevel: cutA.bevel },
      cut2: { node: nodeB, miter: cutB.miter, bevel: cutB.bevel },
    });
  }

  // Group by (nodeType, strutType) where miter and bevel match within tolerance
  const groups: NodeCut[] = [];
  for (const r of raws) {
    const found = groups.find(
      (g) =>
        g.nodeType === r.nodeType &&
        g.strutType === r.strutType &&
        Math.abs(g.miter - r.miter) < CUT_GROUP_TOL &&
        Math.abs(g.bevel - r.bevel) < CUT_GROUP_TOL
    );
    if (found) {
      const n = found.quantity + 1;
      found.miter = (found.miter * found.quantity + r.miter) / n;
      found.bevel = (found.bevel * found.quantity + r.bevel) / n;
      found.quantity = n;
    } else {
      groups.push({
        nodeType: r.nodeType,
        strutType: r.strutType,
        miter: r.miter,
        bevel: r.bevel,
        axialAngle: 0,
        quantity: 1,
      });
    }
  }

  for (const g of groups) {
    g.miter = Math.round(g.miter * 10) / 10;
    g.bevel = Math.round(g.bevel * 10) / 10;
    g.axialAngle = Math.round((90 - g.miter) * 10) / 10;
  }

  groups.sort((a, b) => {
    if (a.strutType !== b.strutType) return a.strutType.localeCompare(b.strutType);
    return a.nodeType.localeCompare(b.nodeType);
  });

  return { nodeCuts: groups, strutCuts };
}
