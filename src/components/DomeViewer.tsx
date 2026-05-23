import { useEffect, useRef } from 'react';
import type { Strut, Vertex, Triangle, NodeCut } from '../lib/geodesic/types';
import { STRUT_COLORS_THREE, STRUT_COLOR_FALLBACK_THREE } from '../constants/strutColors';

interface DomeViewerProps {
  vertices: Vertex[];
  struts: Strut[];
  faces: Triangle[];      // para normales de cara
  nodeCuts: NodeCut[];    // para ángulos de inglete por tipo/nudo
  radius: number;
  beamWidth: number;
  beamThickness: number;
}

// Visual exaggeration of beam cross-section. A real 40×120 mm beam viewed
// from ~3·R away (typical dome viewing distance) subtends only 3–10 px on
// screen — antialiased to a colored line, hiding the multi-material faces.
// We scale the section (preserving the thickness:width ratio) so the wide
// face / narrow face / end face are all clearly differentiated. Length and
// position of each beam remain faithful to the geodesic calculation.
const BEAM_VISUAL_SCALE = 1.8;

function darkenColor(hex: number, factor: number): number {
  const r = Math.floor(((hex >> 16) & 0xff) * factor);
  const g = Math.floor(((hex >> 8) & 0xff) * factor);
  const b = Math.floor((hex & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

// Beam geometry with real miter cuts at each end. Replaces BoxGeometry:
// 8 vertices (4 per end), 12 triangles (2 per face × 6 faces). The miter
// shifts the end vertices along the beam's local Y axis by
// Δ = (beamW / 2) · tan(miter). The shift is symmetric on Z so the cut
// "opens" outward from the node. Each end has its own miter angle.
//
// Local frame: thickness on X, length on Y, width on Z. Material groups
// match the order used by the `mats` array below:
//   group 0 → +X narrow, 1 → -X narrow, 2 → top end, 3 → bot end,
//   group 4 → +Z wide,   5 → -Z wide.
function createMiterBeamGeometry(
  len: number,
  beamW: number,
  beamT: number,
  miterTop: number,   // grados — extremo v2 (top en local frame)
  miterBot: number,   // grados — extremo v1 (bottom en local frame)
  THREE: typeof import('three')
): import('three').BufferGeometry {
  const geo = new THREE.BufferGeometry();

  const hw = beamW / 2; // half-width
  const ht = beamT / 2; // half-thickness
  const hl = len / 2;   // half-length

  const mTopRad = (miterTop * Math.PI) / 180;
  const mBotRad = (miterBot * Math.PI) / 180;

  // Desplazamiento en Y por inglete (los cortes se "abren" hacia afuera del nudo).
  const dTop = hw * Math.tan(mTopRad);
  const dBot = hw * Math.tan(mBotRad);

  // 8 vértices: índices 0-3 = extremo top, 4-7 = extremo bot.
  const verts = new Float32Array([
    // Top end (v2): cara exterior (Z=+hw) es el lado CORTO,
    // cara interior (Z=-hw) es el lado LARGO
    -ht,  hl + dTop,  -hw,   // 0: top, -X, -Z (largo — cara interior)
     ht,  hl + dTop,  -hw,   // 1: top, +X, -Z (largo — cara interior)
     ht,  hl - dTop,   hw,   // 2: top, +X, +Z (corto — cara exterior)
    -ht,  hl - dTop,   hw,   // 3: top, -X, +Z (corto — cara exterior)

    // Bot end (v1): mismo criterio, simétrico en Y
    -ht, -hl - dBot,  -hw,   // 4: bot, -X, -Z (largo — cara interior)
     ht, -hl - dBot,  -hw,   // 5: bot, +X, -Z (largo — cara interior)
     ht, -hl + dBot,   hw,   // 6: bot, +X, +Z (corto — cara exterior)
    -ht, -hl + dBot,   hw,   // 7: bot, -X, +Z (corto — cara exterior)
  ]);

  // 12 triángulos (2 por cara). La cara "ancha" es Z (beamW), la "estrecha" X (beamT).
  const indices = new Uint16Array([
    // +X narrow (grupo 0)
    1, 5, 6,   1, 6, 2,
    // -X narrow (grupo 1)
    4, 0, 3,   4, 3, 7,
    // Top end (grupo 2)
    0, 1, 2,   0, 2, 3,
    // Bot end (grupo 3)
    5, 4, 7,   5, 7, 6,
    // +Z wide (grupo 4)
    3, 2, 6,   3, 6, 7,
    // -Z wide (grupo 5)
    1, 0, 4,   1, 4, 5,
  ]);

  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));

  // Grupos de material (2 triángulos = 6 índices por grupo).
  geo.addGroup(0,  6, 0);   // +X narrow
  geo.addGroup(6,  6, 1);   // -X narrow
  geo.addGroup(12, 6, 2);   // top end
  geo.addGroup(18, 6, 3);   // bot end
  geo.addGroup(24, 6, 4);   // +Z wide
  geo.addGroup(30, 6, 5);   // -Z wide

  geo.computeVertexNormals();

  return geo;
}

interface OrbitControlsLike {
  update(): void;
  dispose(): void;
  autoRotate: boolean;
  enableDamping: boolean;
  dampingFactor: number;
  autoRotateSpeed: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  minDistance: number;
  maxDistance: number;
  target: { set(x: number, y: number, z: number): void };
  addEventListener(event: string, handler: () => void): void;
}

export default function DomeViewer({
  vertices,
  struts,
  faces,
  nodeCuts,
  radius,
  beamWidth,
  beamThickness,
}: DomeViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    THREE: typeof import('three') | null;
    renderer: import('three').WebGLRenderer | null;
    scene: import('three').Scene | null;
    camera: import('three').PerspectiveCamera | null;
    controls: OrbitControlsLike | null;
    group: import('three').Group | null;
    light1: import('three').DirectionalLight | null;
    light2: import('three').DirectionalLight | null;
    rafId: number | null;
    resumeTimer: number | null;
    resizeObs: ResizeObserver | null;
  }>({
    THREE: null,
    renderer: null,
    scene: null,
    camera: null,
    controls: null,
    group: null,
    light1: null,
    light2: null,
    rafId: null,
    resumeTimer: null,
    resizeObs: null,
  });

  // Mount: create renderer/scene/camera/controls once.
  useEffect(() => {
    let cancelled = false;
    const mountEl = mountRef.current;
    if (!mountEl) return;

    (async () => {
      const THREE = await import('three');
      const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
      if (cancelled || !mountRef.current) return;

      const width = mountEl.clientWidth || 800;
      const height = mountEl.clientHeight || 420;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      mountEl.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x12151c);

      const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 1000);

      const ambient = new THREE.AmbientLight(0xffffff, 0.5);
      scene.add(ambient);
      const light1 = new THREE.DirectionalLight(0xffffff, 0.85);
      scene.add(light1);
      const light2 = new THREE.DirectionalLight(0xffffff, 0.4);
      scene.add(light2);

      const group = new THREE.Group();
      scene.add(group);

      const controls = new OrbitControls(camera, renderer.domElement) as unknown as OrbitControlsLike;
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.8;
      controls.minPolarAngle = 0;
      controls.maxPolarAngle = Math.PI * 0.72;

      const pauseAndScheduleResume = () => {
        controls.autoRotate = false;
        if (stateRef.current.resumeTimer !== null) {
          window.clearTimeout(stateRef.current.resumeTimer);
        }
        stateRef.current.resumeTimer = window.setTimeout(() => {
          controls.autoRotate = true;
        }, 3000);
      };
      controls.addEventListener('start', pauseAndScheduleResume);

      const animate = () => {
        controls.update();
        renderer.render(scene, camera);
        stateRef.current.rafId = requestAnimationFrame(animate);
      };
      stateRef.current.rafId = requestAnimationFrame(animate);

      const resizeObs = new ResizeObserver(() => {
        const w = mountEl.clientWidth;
        const h = mountEl.clientHeight;
        if (w === 0 || h === 0) return;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      });
      resizeObs.observe(mountEl);

      stateRef.current = {
        THREE,
        renderer,
        scene,
        camera,
        controls,
        group,
        light1,
        light2,
        rafId: stateRef.current.rafId,
        resumeTimer: stateRef.current.resumeTimer,
        resizeObs,
      };

      buildGeometry();
    })();

    return () => {
      cancelled = true;
      const s = stateRef.current;
      if (s.rafId !== null) cancelAnimationFrame(s.rafId);
      if (s.resumeTimer !== null) window.clearTimeout(s.resumeTimer);
      if (s.resizeObs) s.resizeObs.disconnect();
      if (s.controls) s.controls.dispose();
      if (s.renderer) {
        s.renderer.dispose();
        const canvas = s.renderer.domElement;
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
      stateRef.current = {
        THREE: null,
        renderer: null,
        scene: null,
        camera: null,
        controls: null,
        group: null,
        light1: null,
        light2: null,
        rafId: null,
        resumeTimer: null,
        resizeObs: null,
      };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild geometry when props change.
  useEffect(() => {
    buildGeometry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vertices, struts, faces, nodeCuts, radius, beamWidth, beamThickness]);

  function buildGeometry() {
    const s = stateRef.current;
    const THREE = s.THREE;
    if (!THREE || !s.group || !s.scene || !s.camera) return;

    const group = s.group;

    // ── 1. Limpiar geometrías anteriores ──────────────────────────────────────
    const disposedMats = new WeakSet<import('three').Material>();
    while (group.children.length) {
      const child = group.children.pop()!;
      const mesh = child as import('three').Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as
        | import('three').Material
        | import('three').Material[]
        | undefined;
      if (Array.isArray(mat)) {
        for (const m of mat) {
          if (!disposedMats.has(m)) { m.dispose(); disposedMats.add(m); }
        }
      } else if (mat && !disposedMats.has(mat)) {
        mat.dispose(); disposedMats.add(mat);
      }
    }

    const toRemove: import('three').Object3D[] = [];
    s.scene.traverse(obj => { if (obj.userData.isGrid) toRemove.push(obj); });
    toRemove.forEach(o => s.scene!.remove(o));

    if (!vertices.length || !struts.length) return;

    // ── 2. Coordenadas en espacio Three.js (z-up → y-up) ─────────────────────
    const beamW = (beamWidth / 1000) * BEAM_VISUAL_SCALE;
    const beamT = (beamThickness / 1000) * BEAM_VISUAL_SCALE;
    const hw = beamW / 2;
    const ht = beamT / 2;

    const toV3 = (v: Vertex) =>
      new THREE.Vector3(v.pos.x * radius, v.pos.z * radius, v.pos.y * radius);

    const positions = vertices.map(toV3);

    let minY = Infinity;
    for (const p of positions) { if (p.y < minY) minY = p.y; }

    // ── 3. Mapa de adyacencia: vertex_id → [{strutId, dir FROM vertex}] ───────
    interface AdjEntry { strutId: number; dir: import('three').Vector3; }
    const vertexAdj = new Map<number, AdjEntry[]>();

    for (const strut of struts) {
      const p1 = positions[strut.v1];
      const p2 = positions[strut.v2];
      const d = p2.clone().sub(p1).normalize();

      const a1 = vertexAdj.get(strut.v1) ?? [];
      a1.push({ strutId: strut.id, dir: d.clone() });
      vertexAdj.set(strut.v1, a1);

      const a2 = vertexAdj.get(strut.v2) ?? [];
      a2.push({ strutId: strut.id, dir: d.clone().negate() });
      vertexAdj.set(strut.v2, a2);
    }

    // ── 4. Helper: calcular trim en un extremo ────────────────────────────────
    function computeTrim(
      strutDir: import('three').Vector3,
      adjEntries: AdjEntry[],
      halfThickness: number,
      maxTrim: number
    ): number {
      let best = 0;
      for (const { dir: adjDir } of adjEntries) {
        const cosA = Math.abs(strutDir.dot(adjDir));
        const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
        if (sinA < 0.05) continue; // barras casi paralelas: skip
        const t = halfThickness / sinA;
        if (t > best) best = t;
      }
      return Math.min(best, maxTrim);
    }

    // ── 5. Normales de cara promedio por arista ────────────────────────────────
    function edgeKey(a: number, b: number): string {
      return a < b ? `${a}-${b}` : `${b}-${a}`;
    }

    const faceNormalAccum = new Map<string, import('three').Vector3>();

    for (const [a, b, c] of faces) {
      const pA = positions[a];
      const pB = positions[b];
      const pC = positions[c];
      if (!pA || !pB || !pC) continue;

      const n = new THREE.Vector3()
        .crossVectors(pB.clone().sub(pA), pC.clone().sub(pA))
        .normalize();
      const centroid = pA.clone().add(pB).add(pC).multiplyScalar(1 / 3);
      if (n.dot(centroid) < 0) n.negate();

      for (const [u, v] of [[a, b], [b, c], [c, a]] as [number, number][]) {
        const k = edgeKey(u, v);
        const acc = faceNormalAccum.get(k);
        if (acc) acc.add(n);
        else faceNormalAccum.set(k, n.clone());
      }
    }

    const edgeFaceNormal = new Map<string, import('three').Vector3>();
    for (const [k, acc] of faceNormalAccum) {
      edgeFaceNormal.set(k, acc.normalize());
    }

    // ── 6. Lookup de inglete ───────────────────────────────────────────────────
    function nodeTypeFromValence(valence: number): string {
      if (valence === 5) return 'pentagonal';
      if (valence === 6) return 'hexagonal';
      return `boundary-${valence}`;
    }

    const cutMap = new Map<string, number>();
    for (const cut of nodeCuts) {
      const key = `${cut.strutType}_${cut.nodeType}`;
      if (!cutMap.has(key)) cutMap.set(key, cut.miter);
    }

    function getMiter(strutType: string, valence: number): number {
      return cutMap.get(`${strutType}_${nodeTypeFromValence(valence)}`) ?? 0;
    }

    // ── 7. Cache de materiales ────────────────────────────────────────────────
    const matCache = new Map<string, import('three').MeshPhongMaterial[]>();
    const yAxis = new THREE.Vector3(0, 1, 0);

    // ── 8. Bucle principal de barras ──────────────────────────────────────────
    for (const strut of struts) {
      const v1 = vertices[strut.v1];
      const v2 = vertices[strut.v2];
      if (!v1 || !v2) continue;

      const p1 = positions[strut.v1];
      const p2 = positions[strut.v2];
      const fullLen = p1.distanceTo(p2);
      if (fullLen === 0) continue;

      const dir = p2.clone().sub(p1).normalize();
      const maxTrimPerEnd = fullLen * 0.4;

      // Adyacentes en cada extremo (excluir la barra actual)
      const adj1 = (vertexAdj.get(strut.v1) ?? []).filter(a => a.strutId !== strut.id);
      const adj2 = (vertexAdj.get(strut.v2) ?? []).filter(a => a.strutId !== strut.id);

      // Trim en cada extremo
      const trim1 = computeTrim(dir, adj1, ht, maxTrimPerEnd);
      const trim2 = computeTrim(dir.clone().negate(), adj2, ht, maxTrimPerEnd);

      // Extremos efectivos (acortados)
      const p1Eff = p1.clone().addScaledVector(dir, trim1);
      const p2Eff = p2.clone().addScaledVector(dir, -trim2);
      const lenEff = Math.max(0.001, p1Eff.distanceTo(p2Eff));
      const midEff = p1Eff.clone().add(p2Eff).multiplyScalar(0.5);

      // Ángulos de inglete en cada extremo
      const miterBot = getMiter(strut.type, v1.valence);
      const miterTop = getMiter(strut.type, v2.valence);

      // Geometría con cortes reales + longitud efectiva
      const geo = createMiterBeamGeometry(lenEff, beamW, beamT, miterTop, miterBot, THREE);

      // Materiales
      let mats = matCache.get(strut.type);
      if (!mats) {
        const hex = STRUT_COLORS_THREE[strut.type] ?? STRUT_COLOR_FALLBACK_THREE;
        const matWide   = new THREE.MeshPhongMaterial({ color: hex, shininess: 40 });
        const matNarrow = new THREE.MeshPhongMaterial({ color: darkenColor(hex, 0.45), shininess: 15 });
        const matEnd    = new THREE.MeshPhongMaterial({ color: 0x0d1a0f, shininess: 5 });
        // Orden: [+X narrow, -X narrow, top end, bot end, +Z wide, -Z wide]
        mats = [matNarrow, matNarrow, matEnd, matEnd, matWide, matWide];
        matCache.set(strut.type, mats);
      }

      const beam = new THREE.Mesh(geo, mats);
      beam.position.copy(midEff);

      // Rotación primaria: alinear Y local con dirección del strut
      const dotDir = dir.dot(yAxis);
      if (Math.abs(dotDir) < 0.999) {
        beam.quaternion.setFromUnitVectors(yAxis, dir);
      } else if (dotDir < 0) {
        beam.rotation.z = Math.PI;
      }

      // Rotación secundaria: cara ancha hacia exterior (face normal)
      // + offset hubless: desplazar beamT/2 hacia interior
      const ek = edgeKey(strut.v1, strut.v2);
      const faceN = edgeFaceNormal.get(ek);
      const outwardRef = faceN ?? midEff.clone().normalize();

      const proj = outwardRef.clone().projectOnVector(dir);
      const outwardPerp = outwardRef.clone().sub(proj);

      if (outwardPerp.length() > 0.001) {
        outwardPerp.normalize();
        const currentZ = new THREE.Vector3(0, 0, 1).applyQuaternion(beam.quaternion);
        if (currentZ.dot(outwardPerp) < 0.999) {
          const q2 = new THREE.Quaternion().setFromUnitVectors(currentZ, outwardPerp);
          beam.quaternion.premultiply(q2);
        }
        // Hubless offset
        beam.position.addScaledVector(outwardPerp, -ht);
      }

      group.add(beam);
    }

    // ── 9. Grid + cámara ──────────────────────────────────────────────────────
    const gridSize = radius * 3;
    const grid = new THREE.GridHelper(gridSize, 10, 0x1a2a1a, 0x1a2a1a);
    grid.position.y = isFinite(minY) ? minY : 0;
    grid.userData.isGrid = true;
    s.scene.add(grid);

    const R = radius;
    s.camera.position.set(R * 1.4, R * 0.7, R * 1.6);
    s.camera.near = Math.max(0.01, R / 1000);
    s.camera.far = R * 50;
    s.camera.updateProjectionMatrix();

    if (s.light1) s.light1.position.set(R, R * 2, R);
    if (s.light2) s.light2.position.set(-R, -R * 0.5, -R);

    if (s.controls) {
      s.controls.target.set(0, R * 0.3, 0);
      s.controls.minDistance = R * 0.7;
      s.controls.maxDistance = R * 5;
    }
  }

  return (
    <div
      ref={mountRef}
      style={{
        width: '100%',
        height: '420px',
        borderRadius: '12px',
        overflow: 'hidden',
      }}
    />
  );
}
