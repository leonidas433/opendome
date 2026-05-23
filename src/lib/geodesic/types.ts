export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Vertex {
  id: number;
  pos: Vec3;
  valence: number;
}

export interface Strut {
  id: number;
  v1: number;
  v2: number;
  type: string;
  length: number;
  chordFactor: number;
}

export interface StrutTypeSummary {
  type: string;
  chordFactor: number;
  length: number;
  count: number;
  dihedralAngle: number;
  tableSawTilt: number;
}

export interface NodeCut {
  nodeType: string;
  strutType: string;
  miter: number;
  bevel: number;
  axialAngle: number;
  quantity: number;
}

export interface TriangleFaceType {
  id: string;
  strutTypes: [string, string, string];
  lengths: [number, number, number];
  angles: [number, number, number];
  count: number;
}

export type Frequency = 2 | 3 | 4;
export type PartialDome = '1/2' | '3/8' | '5/8' | '7/12';
export type DomeMethod = 'kruschke' | 'chord';

export interface DomeConfig {
  frequency: Frequency;
  radius: number;
  partial: PartialDome;
  method: DomeMethod;
  beamWidth: number;
  beamThickness: number;
}

export type Triangle = [number, number, number];

export interface DomeResult {
  struts: Strut[];
  vertices: Vertex[];
  faces: Triangle[];
  strutTypes: StrutTypeSummary[];
  nodeCuts: NodeCut[];
  triangleTypes: TriangleFaceType[];
  totalBeams: number;
  coverArea: number;
  baseRadius: number;
  height: number;
  domeHeight: number;
  baseArea: number;
  basePerimeter: number;
  totalLinearMeters: number;
  totalWoodVolume: number;
}

export interface Mesh {
  vertices: Vertex[];
  edges: Edge[];
  faces: Triangle[];
}

export interface Edge {
  v1: number;
  v2: number;
  chordFactor: number;
}
