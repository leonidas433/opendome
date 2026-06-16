import type {
  DomeConfig,
  DomeResult,
  Mesh,
  NodeCut,
  PartialDome,
  Strut,
  StrutTypeSummary,
  Triangle,
  TriangleFaceType,
  Vec3,
  Vertex,
} from './types';
import { subdivide } from './subdivide';
import { classify } from './kruschke';
import { cutAngles } from './cutAngles';
import { cross, dot, normalize, sub } from './vec';

// Z-cutoff (on unit sphere, north pole at z=+1) for each partial fraction.
// Choose cutoffs that align with the icosahedron's pole-aligned ring latitudes
// where possible: upper ring at z = +1/√5, lower ring at z = -1/√5.
function partialCutoff(partial: PartialDome): number {
  const upperRing = 1 / Math.sqrt(5); // ≈ 0.4472
  const lowerRing = -1 / Math.sqrt(5); // ≈ -0.4472
  switch (partial) {
    case '3/8':
      return upperRing - 1e-6; // keep top cap + upper ring
    case '1/2':
      return 0; // hemisphere
    case '5/8':
      return lowerRing - 1e-6; // keep through middle band
    case '7/12':
      return -1 / 6; // ≈ -0.1667, slightly below hemisphere
    case '1/1':
      return -1.1; // full sphere (mismo valor que default, a propósito)
    default:
      return -1.1; // full sphere
  }
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

// Outward unit normal of a triangle on the unit sphere centered at the
// origin. We flip to outward by sign-checking against any vertex (which is
// itself the outward radial direction). This is robust to inconsistent
// winding in the source mesh.
function faceNormal(positions: Vec3[], tri: Triangle): Vec3 {
  const a = positions[tri[0]];
  const b = positions[tri[1]];
  const c = positions[tri[2]];
  const n = normalize(cross(sub(b, a), sub(c, a)));
  if (dot(n, a) < 0) return { x: -n.x, y: -n.y, z: -n.z };
  return n;
}

// Interior dihedral angle (degrees) along the edge shared by two faces with
// outward normals n1 and n2: 180° − angle(n1, n2).
function dihedralFromNormals(n1: Vec3, n2: Vec3): number {
  const c = Math.max(-1, Math.min(1, dot(n1, n2)));
  return 180 - (Math.acos(c) * 180) / Math.PI;
}

export function computeDome(config: DomeConfig): DomeResult {
  const radiusM = config.radius;
  const radiusMm = radiusM * 1000;

  const fullMesh = subdivide(config.frequency);

  // Filter mesh by partial cutoff BEFORE classification?
  // Note: chord factors are intrinsic to the full geodesic geometry, so we
  // classify on the full mesh first and then filter struts. This preserves the
  // standard A/B/C/D type letters even for partial domes.
  const cutoff = partialCutoff(config.partial);

  // Classify on full mesh to get canonical type labels and chord factors
  const fullClassified = classify(fullMesh, radiusMm, config.method);
  const strutTypeById = new Map<number, string>();
  const strutCfById = new Map<number, number>();
  for (const s of fullClassified.struts) {
    strutTypeById.set(s.id, s.type);
    strutCfById.set(s.id, s.chordFactor);
  }

  // Per-edge dihedral (degrees) computed on the full closed mesh, where every
  // edge is shared by exactly two faces. Boundary struts in a partial dome
  // still get a defined dihedral via this full-mesh lookup.
  const fullPositions = fullMesh.vertices.map((v) => v.pos);
  const facesByEdge = new Map<string, number[]>();
  for (let fi = 0; fi < fullMesh.faces.length; fi++) {
    const [a, b, c] = fullMesh.faces[fi];
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = edgeKey(u, v);
      const arr = facesByEdge.get(k);
      if (arr) arr.push(fi);
      else facesByEdge.set(k, [fi]);
    }
  }
  const faceNormals: Vec3[] = fullMesh.faces.map((tri) =>
    faceNormal(fullPositions, tri)
  );
  const dihedralByEdge = new Map<number, number>();
  for (let ei = 0; ei < fullMesh.edges.length; ei++) {
    const e = fullMesh.edges[ei];
    const fs = facesByEdge.get(edgeKey(e.v1, e.v2)) ?? [];
    if (fs.length >= 2) {
      const d = dihedralFromNormals(faceNormals[fs[0]], faceNormals[fs[1]]);
      dihedralByEdge.set(ei, d);
    }
  }

  // Build filtered mesh with re-indexed vertices
  const keepVertex = fullMesh.vertices.map((v) => v.pos.z >= cutoff - 1e-9);
  const idMap = new Map<number, number>();
  const filteredVertices: Vertex[] = [];
  for (const v of fullMesh.vertices) {
    if (keepVertex[v.id]) {
      idMap.set(v.id, filteredVertices.length);
      filteredVertices.push({ id: filteredVertices.length, pos: v.pos, valence: 0 });
    }
  }

  const filteredStruts: Strut[] = [];
  const dihedralByFilteredStrut: number[] = [];
  for (let i = 0; i < fullMesh.edges.length; i++) {
    const e = fullMesh.edges[i];
    if (!(keepVertex[e.v1] && keepVertex[e.v2])) continue;
    const newV1 = idMap.get(e.v1);
    const newV2 = idMap.get(e.v2);
    if (newV1 === undefined || newV2 === undefined) continue;
    const type = strutTypeById.get(i) ?? '?';
    const cf = strutCfById.get(i) ?? e.chordFactor;
    filteredStruts.push({
      id: filteredStruts.length,
      v1: newV1,
      v2: newV2,
      type,
      chordFactor: cf,
      length: cf * radiusMm,
    });
    dihedralByFilteredStrut.push(dihedralByEdge.get(i) ?? NaN);
  }

  // Recompute valence in filtered mesh (must reflect filtered topology only,
  // because the cut angle at a "boundary" hex node now has fewer neighbors)
  for (const s of filteredStruts) {
    filteredVertices[s.v1].valence++;
    filteredVertices[s.v2].valence++;
  }

  // Filter faces: keep only triangles whose 3 vertices are all inside the
  // partial. Re-index vertex IDs to the filtered space.
  const filteredFaces: Triangle[] = [];
  for (const tri of fullMesh.faces) {
    if (!keepVertex[tri[0]] || !keepVertex[tri[1]] || !keepVertex[tri[2]]) continue;
    const a = idMap.get(tri[0]);
    const b = idMap.get(tri[1]);
    const c = idMap.get(tri[2]);
    if (a === undefined || b === undefined || c === undefined) continue;
    filteredFaces.push([a, b, c]);
  }

  const filteredMesh: Mesh = {
    vertices: filteredVertices,
    edges: filteredStruts.map((s) => ({
      v1: s.v1,
      v2: s.v2,
      chordFactor: s.chordFactor,
    })),
    faces: filteredFaces,
  };

  // Strut type summary on filtered set, including average dihedral and table
  // saw blade tilt = (180° − dihedral) / 2.
  interface SummaryAcc {
    type: string;
    chordFactor: number;
    length: number;
    count: number;
    dihedralSum: number;
    dihedralCount: number;
  }
  const summaryMap = new Map<string, SummaryAcc>();
  for (let i = 0; i < filteredStruts.length; i++) {
    const s = filteredStruts[i];
    const d = dihedralByFilteredStrut[i];
    const existing = summaryMap.get(s.type);
    if (existing) {
      existing.count++;
      if (Number.isFinite(d)) {
        existing.dihedralSum += d;
        existing.dihedralCount++;
      }
    } else {
      summaryMap.set(s.type, {
        type: s.type,
        chordFactor: s.chordFactor,
        length: s.length,
        count: 1,
        dihedralSum: Number.isFinite(d) ? d : 0,
        dihedralCount: Number.isFinite(d) ? 1 : 0,
      });
    }
  }
  const strutTypes: StrutTypeSummary[] = Array.from(summaryMap.values())
    .map((acc) => {
      const dihedral = acc.dihedralCount > 0
        ? acc.dihedralSum / acc.dihedralCount
        : NaN;
      const tableSawTilt = Number.isFinite(dihedral) ? (180 - dihedral) / 2 : NaN;
      return {
        type: acc.type,
        chordFactor: acc.chordFactor,
        length: acc.length,
        count: acc.count,
        dihedralAngle: Number.isFinite(dihedral)
          ? Math.round(dihedral * 10) / 10
          : 0,
        tableSawTilt: Number.isFinite(tableSawTilt)
          ? Math.round(tableSawTilt * 10) / 10
          : 0,
      };
    })
    .sort((a, b) => a.length - b.length);

  // Cut angles on filtered mesh + struts
  const cuts = cutAngles(filteredMesh, filteredStruts);
  const nodeCuts: NodeCut[] = cuts.nodeCuts;

  // Triangle face types: classify each filtered face by the multiset of strut
  // types of its 3 edges. Use opposite-angle convention so groupings are
  // orientation-independent: lengths[i] / strutTypes[i] = side opposite to
  // vertex i, angles[i] = angle at vertex i (= angle opposite that side).
  const strutByEdge = new Map<string, Strut>();
  for (const s of filteredStruts) {
    strutByEdge.set(edgeKey(s.v1, s.v2), s);
  }
  const triangleMap = new Map<string, TriangleFaceType>();
  let triangleFaceTotal = 0;
  for (const tri of filteredFaces) {
    const [a, b, c] = tri;
    // Sides opposite each vertex.
    const sOppA = strutByEdge.get(edgeKey(b, c));
    const sOppB = strutByEdge.get(edgeKey(c, a));
    const sOppC = strutByEdge.get(edgeKey(a, b));
    if (!sOppA || !sOppB || !sOppC) continue;
    if (sOppA.type === '?' || sOppB.type === '?' || sOppC.type === '?') continue;

    const L: [number, number, number] = [sOppA.length, sOppB.length, sOppC.length];
    const T: [string, string, string] = [sOppA.type, sOppB.type, sOppC.type];
    const L0sq = L[0] * L[0];
    const L1sq = L[1] * L[1];
    const L2sq = L[2] * L[2];
    const safeAcos = (cos: number) =>
      (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    // angle at v_i = angle opposite side L[i] (law of cosines).
    const ang0 = safeAcos((L1sq + L2sq - L0sq) / (2 * L[1] * L[2]));
    const ang1 = safeAcos((L0sq + L2sq - L1sq) / (2 * L[0] * L[2]));
    const ang2 = safeAcos((L0sq + L1sq - L2sq) / (2 * L[0] * L[1]));

    if (Math.abs(ang0 + ang1 + ang2 - 180) > 0.5) {
      // eslint-disable-next-line no-console
      console.warn(
        `Triangle angles do not sum to 180° (got ${(ang0 + ang1 + ang2).toFixed(3)}°)`
      );
    }

    // Sort the three (type, length, angle) triples by type (tie-break by
    // length) for canonical id and representative ordering.
    const triples: Array<[string, number, number]> = [
      [T[0], L[0], ang0],
      [T[1], L[1], ang1],
      [T[2], L[2], ang2],
    ];
    triples.sort((x, y) => {
      if (x[0] !== y[0]) return x[0].localeCompare(y[0]);
      return x[1] - y[1];
    });
    const id = triples.map((t) => t[0]).join('-');
    const existing = triangleMap.get(id);
    if (existing) {
      existing.count++;
    } else {
      triangleMap.set(id, {
        id,
        strutTypes: [triples[0][0], triples[1][0], triples[2][0]],
        lengths: [triples[0][1], triples[1][1], triples[2][1]],
        angles: [triples[0][2], triples[1][2], triples[2][2]],
        count: 1,
      });
    }
    triangleFaceTotal++;
  }
  const triangleTypes: TriangleFaceType[] = Array.from(triangleMap.values()).sort(
    (x, y) => x.id.localeCompare(y.id)
  );

  if (triangleFaceTotal !== filteredFaces.length) {
    // eslint-disable-next-line no-console
    console.warn(
      `triangleTypes covers ${triangleFaceTotal} of ${filteredFaces.length} faces ` +
        `(some faces have unclassified struts)`
    );
  }

  // Geometry stats
  const heightUnit = 1 - cutoff;
  const height = config.partial === '1/1' ? 2 * radiusM : heightUnit * radiusM;

  // Base ring: vertices at the lowest z (within tolerance) of the filtered
  // mesh. baseRadius from polygon: max horizontal radius among them.
  let minZ = Infinity;
  for (const v of filteredVertices) {
    if (v.pos.z < minZ) minZ = v.pos.z;
  }
  const BASE_TOL = 0.01;
  const baseVertexIds = new Set<number>();
  let baseRadius = 0;
  for (const v of filteredVertices) {
    if (Math.abs(v.pos.z - minZ) <= BASE_TOL) {
      baseVertexIds.add(v.id);
      const r = Math.sqrt(v.pos.x * v.pos.x + v.pos.y * v.pos.y) * radiusM;
      if (r > baseRadius) baseRadius = r;
    }
  }
  // Fallback to sphere small-circle radius if no base ring is detectable
  // (e.g. degenerate partials).
  if (baseRadius === 0) {
    baseRadius = Math.sqrt(Math.max(0, 1 - cutoff * cutoff)) * radiusM;
  }

  // Spherical cap area: 2πRh (h = height in same units as R)
  const coverArea = 2 * Math.PI * radiusM * height;

  // Materials totals
  let totalLengthMm = 0;
  for (const s of filteredStruts) totalLengthMm += s.length;
  const totalLinearMeters = totalLengthMm / 1000;
  const beamWidthM = config.beamWidth / 1000;
  const beamThicknessM = config.beamThickness / 1000;
  const totalWoodVolume = totalLinearMeters * beamWidthM * beamThicknessM;

  // Base perimeter: sum of strut lengths (in m) for struts whose endpoints
  // both lie on the base ring.
  let basePerimeterMm = 0;
  for (const s of filteredStruts) {
    if (baseVertexIds.has(s.v1) && baseVertexIds.has(s.v2)) {
      basePerimeterMm += s.length;
    }
  }
  const basePerimeter = basePerimeterMm / 1000;

  const baseArea = Math.PI * baseRadius * baseRadius;

  return {
    struts: filteredStruts,
    vertices: filteredVertices,
    faces: filteredFaces,
    strutTypes,
    nodeCuts,
    strutCuts: cuts.strutCuts,
    triangleTypes,
    totalBeams: filteredStruts.length,
    coverArea,
    baseRadius,
    height,
    domeHeight: height,
    baseArea,
    basePerimeter,
    totalLinearMeters,
    totalWoodVolume,
  };
}
