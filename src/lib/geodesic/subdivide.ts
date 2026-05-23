import type { Edge, Mesh, Triangle, Vec3, Vertex, Frequency } from './types';
import { icosahedron, type IcoFace } from './icosahedron';
import { add, distance, normalize, scale } from './vec';

const VERTEX_TOL = 1e-7;

function vertexKey(p: Vec3): string {
  const r = (n: number) => Math.round(n / VERTEX_TOL) * VERTEX_TOL;
  return `${r(p.x)}|${r(p.y)}|${r(p.z)}`;
}

function findOrAddVertex(
  pos: Vec3,
  vertices: Vec3[],
  index: Map<string, number>
): number {
  const key = vertexKey(pos);
  const existing = index.get(key);
  if (existing !== undefined) return existing;
  const id = vertices.length;
  vertices.push(pos);
  index.set(key, id);
  return id;
}

function subdivideFace(
  face: IcoFace,
  baseVerts: Vec3[],
  freq: number,
  vertices: Vec3[],
  vIndex: Map<string, number>
): number[][] {
  const A = baseVerts[face.a];
  const B = baseVerts[face.b];
  const C = baseVerts[face.c];

  const grid: number[][] = [];
  for (let i = 0; i <= freq; i++) {
    const row: number[] = [];
    for (let j = 0; j <= freq - i; j++) {
      const k = freq - i - j;
      // Barycentric interpolation: i counts toward C-side (rows from A→C),
      // here we use (k,j,i) so i=0 row is the AB edge.
      const w0 = k / freq;
      const w1 = j / freq;
      const w2 = i / freq;
      const interp: Vec3 = add(add(scale(A, w0), scale(B, w1)), scale(C, w2));
      const projected = normalize(interp);
      const id = findOrAddVertex(projected, vertices, vIndex);
      row.push(id);
    }
    grid.push(row);
  }
  return grid;
}

function addFacesFromGrid(grid: number[][], faces: Triangle[]): void {
  // Up triangles: (i,j), (i,j+1), (i+1,j) — preserves CCW outward winding of
  // the parent icosahedron face.
  // Down triangles: (i,j+1), (i+1,j+1), (i+1,j) — same outward winding.
  const rows = grid.length;
  for (let i = 0; i < rows - 1; i++) {
    const row = grid[i];
    const next = grid[i + 1];
    for (let j = 0; j < next.length; j++) {
      faces.push([row[j], row[j + 1], next[j]]);
    }
    for (let j = 0; j < next.length - 1; j++) {
      faces.push([row[j + 1], next[j + 1], next[j]]);
    }
  }
}

function addEdgesFromGrid(
  grid: number[][],
  edgeSet: Set<string>,
  edges: Array<[number, number]>
): void {
  const addEdge = (a: number, b: number) => {
    if (a === b) return;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = `${lo}-${hi}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      edges.push([lo, hi]);
    }
  };

  const rows = grid.length;
  for (let i = 0; i < rows; i++) {
    const row = grid[i];
    for (let j = 0; j < row.length - 1; j++) {
      addEdge(row[j], row[j + 1]);
    }
  }
  for (let i = 0; i < rows - 1; i++) {
    const row = grid[i];
    const next = grid[i + 1];
    for (let j = 0; j < next.length; j++) {
      // edge to vertex at (i, j)
      addEdge(next[j], row[j]);
      // diagonal edge to vertex at (i, j+1)
      addEdge(next[j], row[j + 1]);
    }
  }
}

export function subdivide(frequency: Frequency): Mesh {
  const base = icosahedron();
  const vertices: Vec3[] = [];
  const vIndex = new Map<string, number>();

  const edges: Array<[number, number]> = [];
  const edgeSet = new Set<string>();
  const faces: Triangle[] = [];

  for (const face of base.faces) {
    const grid = subdivideFace(face, base.vertices, frequency, vertices, vIndex);
    addEdgesFromGrid(grid, edgeSet, edges);
    addFacesFromGrid(grid, faces);
  }

  // valence count
  const valence = new Array<number>(vertices.length).fill(0);
  for (const [a, b] of edges) {
    valence[a]++;
    valence[b]++;
  }

  const verts: Vertex[] = vertices.map((pos, id) => ({
    id,
    pos,
    valence: valence[id],
  }));

  const meshEdges: Edge[] = edges.map(([v1, v2]) => ({
    v1,
    v2,
    chordFactor: distance(vertices[v1], vertices[v2]),
  }));

  return { vertices: verts, edges: meshEdges, faces };
}
