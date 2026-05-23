import type { Vec3 } from './types';
import { v } from './vec';

export interface IcoFace {
  a: number;
  b: number;
  c: number;
}

export interface IcoBase {
  vertices: Vec3[];
  edges: Array<[number, number]>;
  faces: IcoFace[];
}

// Pole-aligned icosahedron: north pole at (0,0,1), 5-vertex upper ring
// at z = 1/sqrt(5), 5-vertex lower ring at z = -1/sqrt(5) offset by 36°,
// south pole at (0,0,-1). This orientation is the standard for dome
// partial cuts because it places a 5-fold symmetry axis vertical.
export function icosahedron(): IcoBase {
  const z = 1 / Math.sqrt(5);
  const r = 2 / Math.sqrt(5);
  const vertices: Vec3[] = [];

  // 0: north pole
  vertices.push(v(0, 0, 1));

  // 1..5: upper ring at z = +1/sqrt(5)
  for (let k = 0; k < 5; k++) {
    const ang = (k * 72 * Math.PI) / 180;
    vertices.push(v(r * Math.cos(ang), r * Math.sin(ang), z));
  }

  // 6..10: lower ring at z = -1/sqrt(5), offset by 36°
  for (let k = 0; k < 5; k++) {
    const ang = ((k * 72 + 36) * Math.PI) / 180;
    vertices.push(v(r * Math.cos(ang), r * Math.sin(ang), -z));
  }

  // 11: south pole
  vertices.push(v(0, 0, -1));

  // Indices: NORTH=0, UP[k]=1+k, LO[k]=6+k, SOUTH=11
  const UP = (k: number): number => 1 + ((k + 5) % 5);
  const LO = (k: number): number => 6 + ((k + 5) % 5);
  const NORTH = 0;
  const SOUTH = 11;

  const faces: IcoFace[] = [];

  // Top cap: 5 faces around north
  for (let k = 0; k < 5; k++) {
    faces.push({ a: NORTH, b: UP(k), c: UP(k + 1) });
  }

  // Middle band: 10 faces
  for (let k = 0; k < 5; k++) {
    // up-pointing-from-below: lower[k], upper[k+1], lower[k+1]
    faces.push({ a: LO(k), b: UP(k + 1), c: LO(k + 1) });
    // down-pointing: upper[k], lower[k], upper[k+1]
    faces.push({ a: UP(k), b: LO(k), c: UP(k + 1) });
  }

  // Bottom cap
  for (let k = 0; k < 5; k++) {
    faces.push({ a: SOUTH, b: LO(k + 1), c: LO(k) });
  }

  const edgeSet = new Set<string>();
  const edges: Array<[number, number]> = [];
  const addEdge = (a: number, b: number) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = `${lo}-${hi}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      edges.push([lo, hi]);
    }
  };
  for (const f of faces) {
    addEdge(f.a, f.b);
    addEdge(f.b, f.c);
    addEdge(f.c, f.a);
  }

  return { vertices, edges, faces };
}
