import { useEffect, useRef } from 'react';
import type { Strut, Vertex } from '../lib/geodesic/types';
import { STRUT_COLORS_THREE, STRUT_COLOR_FALLBACK_THREE } from '../constants/strutColors';

interface DomeViewerProps {
  vertices: Vertex[];
  struts: Strut[];
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
const BEAM_VISUAL_SCALE = 2.5;

function darkenColor(hex: number, factor: number): number {
  const r = Math.floor(((hex >> 16) & 0xff) * factor);
  const g = Math.floor(((hex >> 8) & 0xff) * factor);
  const b = Math.floor((hex & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
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
  }, [vertices, struts, radius, beamWidth, beamThickness]);

  function buildGeometry() {
    const s = stateRef.current;
    const THREE = s.THREE;
    if (!THREE || !s.group || !s.scene || !s.camera) return;

    const group = s.group;

    // 1) Clear previous beams. Dispose each unique material at most once
    //    because the matCache shares the same 6-array reference across all
    //    beams of the same strut type.
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
          if (!disposedMats.has(m)) {
            m.dispose();
            disposedMats.add(m);
          }
        }
      } else if (mat) {
        if (!disposedMats.has(mat)) {
          mat.dispose();
          disposedMats.add(mat);
        }
      }
    }
    // Confirm group is still a child of scene (it is; cleanup only popped its
    // children, never scene.remove(group)).

    // Clear grid (we re-add it sized to current radius).
    const toRemove: import('three').Object3D[] = [];
    s.scene.traverse((obj) => {
      if (obj.userData.isGrid) toRemove.push(obj);
    });
    toRemove.forEach((o) => s.scene!.remove(o));

    if (!vertices.length || !struts.length) return;

    // Geodesic frame is z-up. Three.js convention is y-up. Map (x, y, z)_geo
    // to (x, z, y)_three so the dome's pole points up the screen.
    // Real dimensions in meters, scaled visually to make the cross-section
    // distinguishable at typical dome viewing distances.
    const beamW = (beamWidth / 1000) * BEAM_VISUAL_SCALE;
    const beamT = (beamThickness / 1000) * BEAM_VISUAL_SCALE;

    const toV3 = (v: Vertex) =>
      new THREE.Vector3(v.pos.x * radius, v.pos.z * radius, v.pos.y * radius);

    const positions = vertices.map(toV3);

    let minY = Infinity;
    for (const p of positions) {
      if (p.y < minY) minY = p.y;
    }

    // 2) Per-type material cache: store the FULL 6-element array so the
    //    Mesh receives it directly, in canonical BoxGeometry face order.
    const matCache = new Map<string, import('three').MeshPhongMaterial[]>();
    const yAxis = new THREE.Vector3(0, 1, 0);

    for (const strut of struts) {
      const v1 = vertices[strut.v1];
      const v2 = vertices[strut.v2];
      if (!v1 || !v2) continue;

      const p1 = positions[strut.v1];
      const p2 = positions[strut.v2];
      const len = p1.distanceTo(p2);
      if (len === 0) continue;

      const mid = p1.clone().add(p2).multiplyScalar(0.5);
      const dir = p2.clone().sub(p1).normalize();

      // 3) Geometry: thickness on X, length on Y, width on Z.
      //    BoxGeometry face order is +X, -X, +Y, -Y, +Z, -Z.
      const geo = new THREE.BoxGeometry(beamT, len, beamW);

      // 4) Materials. Cached per type; the cached value IS the 6-array,
      //    so Mesh receives it directly (not a single Material).
      let mats = matCache.get(strut.type);
      if (!mats) {
        const hex = STRUT_COLORS_THREE[strut.type] ?? STRUT_COLOR_FALLBACK_THREE;
        const matWide = new THREE.MeshPhongMaterial({ color: hex, shininess: 30 });
        const matNarrow = new THREE.MeshPhongMaterial({
          color: darkenColor(hex, 0.4),
          shininess: 10,
        });
        const matEnd = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 5 });
        mats = [matNarrow, matNarrow, matEnd, matEnd, matWide, matWide];
        matCache.set(strut.type, mats);
      }

      // 5) Build mesh, then position & rotate (NOT applyMatrix4 on geometry).
      const beam = new THREE.Mesh(geo, mats);
      beam.position.copy(mid);

      // Primary rotation: align beam Y-axis with strut direction.
      // setFromUnitVectors fails when vectors are antiparallel — handle that.
      const dotDir = dir.dot(yAxis);
      if (Math.abs(dotDir) < 0.999) {
        beam.quaternion.setFromUnitVectors(yAxis, dir);
      } else if (dotDir < 0) {
        beam.rotation.z = Math.PI;
      }
      // (else: dir parallel to +Y, identity rotation — leave quaternion alone)

      // Secondary rotation: orient wide face (Z) outward from dome center.
      const outward = mid.clone().normalize();
      const proj = outward.clone().projectOnVector(dir);
      const outwardPerp = outward.clone().sub(proj);
      if (outwardPerp.length() > 0.001) {
        outwardPerp.normalize();
        const currentZ = new THREE.Vector3(0, 0, 1).applyQuaternion(beam.quaternion);
        if (currentZ.dot(outwardPerp) < 0.999) {
          const q2 = new THREE.Quaternion().setFromUnitVectors(currentZ, outwardPerp);
          beam.quaternion.premultiply(q2);
        }
      }

      group.add(beam);
    }

    // Grid at base.
    const gridSize = radius * 3;
    const grid = new THREE.GridHelper(gridSize, 10, 0x2a2d38, 0x2a2d38);
    grid.position.y = isFinite(minY) ? minY : 0;
    grid.userData.isGrid = true;
    s.scene.add(grid);

    // Camera + lights + control limits sized to current radius.
    // Position pulled in (~R·2.2 distance vs the previous R·3) so the
    // beam cross-section is more obvious on first paint.
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
