import { useEffect, useRef } from 'react';
import type { TriangleFaceType } from '../lib/geodesic/types';

interface TriangleViewerProps {
  triangleTypes: TriangleFaceType[];
  beamWidth: number;
  beamThickness: number;
  strutColors: Record<string, string>;
}

const FALLBACK_COLOR = '#888888';
const FALLBACK_HEX = 0x888888;

function hexFromString(c: string): number {
  const m = c.match(/^#?([0-9a-f]{6})$/i);
  return m ? parseInt(m[1], 16) : FALLBACK_HEX;
}

function darkenHex(hex: number, factor: number): number {
  const r = Math.floor(((hex >> 16) & 0xff) * factor);
  const g = Math.floor(((hex >> 8) & 0xff) * factor);
  const b = Math.floor((hex & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

function TriangleCard({
  triangle,
  beamWidth,
  beamThickness,
  strutColors,
}: {
  triangle: TriangleFaceType;
  beamWidth: number;
  beamThickness: number;
  strutColors: Record<string, string>;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const angleRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const edgeRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const pausedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let rafId: number | null = null;
    let resizeObs: ResizeObserver | null = null;
    let renderer: import('three').WebGLRenderer | null = null;
    let scene: import('three').Scene | null = null;
    let camera: import('three').PerspectiveCamera | null = null;
    let group: import('three').Group | null = null;
    const disposables: Array<{ dispose: () => void }> = [];

    (async () => {
      const THREE = await import('three');
      if (cancelled || !canvasRef.current || !mountRef.current) return;

      const canvas = canvasRef.current;
      const mountEl = mountRef.current;
      const initialW = canvas.clientWidth || 400;
      const initialH = canvas.clientHeight || 280;

      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(initialW, initialH, false);
      renderer.setClearColor(0x0f1117, 1);

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(45, initialW / initialH, 0.01, 100);

      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      const light1 = new THREE.DirectionalLight(0xffffff, 0.85);
      const light2 = new THREE.DirectionalLight(0xffffff, 0.35);
      scene.add(light1);
      scene.add(light2);

      group = new THREE.Group();
      scene.add(group);

      // Opposite-angle convention from dome.ts: strutTypes[i] / lengths[i] is
      // the side opposite vertex i, and angles[i] is the angle AT vertex i.
      // Side v0–v1 = side opposite v2 (length L2). Side v1–v2 = side opposite
      // v0 (length L0). The interior angle at v1 is angles[1].
      const L0 = triangle.lengths[0] / 1000;
      const L1 = triangle.lengths[1] / 1000;
      const L2 = triangle.lengths[2] / 1000;
      const A1 = (triangle.angles[1] * Math.PI) / 180;

      const v0 = new THREE.Vector3(0, 0, 0);
      const v1 = new THREE.Vector3(L2, 0, 0);
      const v2 = new THREE.Vector3(L2 - L0 * Math.cos(A1), 0, L0 * Math.sin(A1));

      const centroid = v0.clone().add(v1).add(v2).divideScalar(3);
      v0.sub(centroid);
      v1.sub(centroid);
      v2.sub(centroid);
      const verts = [v0, v1, v2];
      const triSize = Math.max(L0, L1, L2);

      camera.position.set(triSize * 0.3, triSize * 1.4, triSize * 1.8);
      camera.lookAt(triSize * 0.15, 0, triSize * 0.2);
      camera.updateProjectionMatrix();

      light1.position.set(triSize, triSize * 2, triSize);
      light2.position.set(-triSize, -triSize * 0.5, -triSize);

      // Subtle floor grid for spatial context.
      const grid = new THREE.GridHelper(triSize * 2.5, 6, 0x1a1a2e, 0x1a1a2e);
      const gridMat = grid.material as import('three').LineBasicMaterial;
      gridMat.transparent = true;
      gridMat.opacity = 0.4;
      grid.position.y = -0.001;
      scene.add(grid);
      disposables.push(grid.geometry, gridMat);

      const bW = beamWidth / 1000;
      const bT = beamThickness / 1000;
      const yAxis = new THREE.Vector3(0, 1, 0);

      // Each edge between v_i and v_{(i+1)%3} carries the strut whose type is
      // opposite vertex (i+2)%3.
      for (let i = 0; i < 3; i++) {
        const j = (i + 1) % 3;
        const opp = (i + 2) % 3;
        const t = triangle.strutTypes[opp];
        const colorHex = hexFromString(strutColors[t] ?? FALLBACK_COLOR);

        const vi = verts[i];
        const vj = verts[j];
        const dir = vj.clone().sub(vi);
        const len = dir.length();
        if (len === 0) continue;
        dir.divideScalar(len);

        // BoxGeometry(width=bW along X, height=bT along Y, depth=len along Z).
        // Wide face on +Y/-Y (top/bottom), narrow faces on +X/-X (sides),
        // ends on +Z/-Z. BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z.
        const geo = new THREE.BoxGeometry(bW, bT, len);
        disposables.push(geo);

        const matTop = new THREE.MeshPhongMaterial({ color: colorHex, shininess: 40 });
        const matBottom = new THREE.MeshPhongMaterial({
          color: darkenHex(colorHex, 0.5),
          shininess: 10,
        });
        const matSide = new THREE.MeshPhongMaterial({
          color: darkenHex(colorHex, 0.7),
          shininess: 15,
        });
        const matEnd = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 5 });
        disposables.push(matTop, matBottom, matSide, matEnd);

        const materials = [matSide, matSide, matTop, matBottom, matEnd, matEnd];
        const mesh = new THREE.Mesh(geo, materials);
        const mid = vi.clone().add(vj).multiplyScalar(0.5);
        mid.y = bT / 2;
        mesh.position.copy(mid);
        mesh.rotation.y = Math.atan2(dir.x, dir.z);

        const edgesGeo = new THREE.EdgesGeometry(geo);
        const edgesMat = new THREE.LineBasicMaterial({ color: 0x000000 });
        disposables.push(edgesGeo, edgesMat);
        const lines = new THREE.LineSegments(edgesGeo, edgesMat);
        mesh.add(lines);

        group.add(mesh);
      }

      // Local label positions (will be projected each frame through
      // group.matrixWorld so they follow the auto-rotation).
      const angleLabel3D = verts.map((v) => {
        const out = new THREE.Vector3(v.x, 0, v.z);
        if (out.lengthSq() > 1e-9) out.normalize();
        return v.clone()
          .add(out.multiplyScalar(0.05))
          .add(new THREE.Vector3(0, bT + 0.04, 0));
      });
      const edgeLabel3D: import('three').Vector3[] = [];
      for (let i = 0; i < 3; i++) {
        const j = (i + 1) % 3;
        const vi = verts[i];
        const vj = verts[j];
        const mid = vi.clone().add(vj).multiplyScalar(0.5);
        const ed = vj.clone().sub(vi).normalize();
        const perp = new THREE.Vector3().crossVectors(ed, yAxis).normalize();
        if (perp.dot(mid) < 0) perp.negate();
        edgeLabel3D.push(
          mid
            .add(perp.multiplyScalar(bW * 1.4 + 0.06))
            .add(new THREE.Vector3(0, bT + 0.02, 0))
        );
      }

      const projVec = new THREE.Vector3();
      const animate = () => {
        if (cancelled) return;
        if (group && !pausedRef.current) group.rotation.y += 0.005;
        const cw = canvas.clientWidth;
        const ch = canvas.clientHeight;
        if (renderer && scene && camera && cw > 0 && ch > 0) {
          renderer.render(scene, camera);
        }

        if (group && camera && cw > 0 && ch > 0) {
          for (let i = 0; i < 3; i++) {
            const aDiv = angleRefs.current[i];
            if (aDiv) {
              projVec
                .copy(angleLabel3D[i])
                .applyMatrix4(group.matrixWorld)
                .project(camera);
              const x = ((projVec.x + 1) / 2) * cw;
              const y = ((-projVec.y + 1) / 2) * ch;
              aDiv.style.transform =
                `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
            }
            const eDiv = edgeRefs.current[i];
            if (eDiv) {
              projVec
                .copy(edgeLabel3D[i])
                .applyMatrix4(group.matrixWorld)
                .project(camera);
              const x = ((projVec.x + 1) / 2) * cw;
              const y = ((-projVec.y + 1) / 2) * ch;
              eDiv.style.transform =
                `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
            }
          }
        }

        rafId = requestAnimationFrame(animate);
      };
      rafId = requestAnimationFrame(animate);

      resizeObs = new ResizeObserver(() => {
        if (!renderer || !camera) return;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (w === 0 || h === 0) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      });
      resizeObs.observe(mountEl);

      void L1;
    })();

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (resizeObs) resizeObs.disconnect();
      for (const d of disposables) {
        try {
          d.dispose();
        } catch {
          /* noop */
        }
      }
      if (renderer) renderer.dispose();
    };
  }, [triangle, beamWidth, beamThickness, strutColors]);

  // Edge metadata for the floating HTML labels (each edge i corresponds to the
  // strut OPPOSITE vertex (i+2)%3 under the dome.ts convention).
  const edgeMeta = [0, 1, 2].map((i) => {
    const opp = (i + 2) % 3;
    return {
      type: triangle.strutTypes[opp],
      length: triangle.lengths[opp],
      color: strutColors[triangle.strutTypes[opp]] ?? FALLBACK_COLOR,
    };
  });

  return (
    <div
      className="relative overflow-hidden rounded-xl shadow-sm"
      style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
    >
      <span
        className="absolute right-3 top-3 z-10 rounded-full px-2 py-0.5 text-[11px] font-medium"
        style={{ background: 'rgba(0, 0, 0, 0.5)', color: 'var(--text-secondary)' }}
      >
        {triangle.count} {triangle.count === 1 ? 'triángulo' : 'triángulos'}
      </span>
      <div
        ref={mountRef}
        className="relative"
        style={{ height: 280 }}
        onMouseEnter={() => {
          pausedRef.current = true;
        }}
        onMouseLeave={() => {
          pausedRef.current = false;
        }}
      >
        <canvas ref={canvasRef} className="block h-full w-full" />
        {triangle.angles.map((angle, i) => (
          <div
            key={`a${i}`}
            ref={(el) => {
              angleRefs.current[i] = el;
            }}
            className="pointer-events-none absolute left-0 top-0 select-none rounded-md border px-1.5 py-0.5 text-[12px] font-bold"
            style={{
              transform: 'translate(-9999px, -9999px)',
              background: 'rgba(15, 17, 23, 0.85)',
              borderColor: 'var(--glass-border)',
              color: 'var(--text-primary)',
            }}
          >
            {angle.toFixed(1)}°
          </div>
        ))}
        {edgeMeta.map((m, i) => (
          <div
            key={`e${i}`}
            ref={(el) => {
              edgeRefs.current[i] = el;
            }}
            className="pointer-events-none absolute left-0 top-0 flex select-none flex-col items-center gap-0.5"
            style={{ transform: 'translate(-9999px, -9999px)' }}
          >
            <span
              className="rounded-md border px-1.5 py-0.5 text-[12px] font-bold"
              style={{
                background: 'rgba(15, 17, 23, 0.85)',
                borderColor: 'var(--glass-border)',
                color: m.color,
              }}
            >
              {m.type}
            </span>
            <span
              className="rounded-md px-1 py-0.5 font-mono text-[10px]"
              style={{
                background: 'rgba(15, 17, 23, 0.7)',
                color: 'var(--text-muted)',
              }}
            >
              {Math.round(m.length)} mm
            </span>
          </div>
        ))}
      </div>
      <div className="px-4 pb-3 pt-3">
        <div className="mb-2 flex items-center gap-1 text-sm">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Tipo
          </span>
          {triangle.strutTypes.map((t, i) => (
            <span key={i} className="flex items-center gap-1">
              <span
                className="font-bold"
                style={{ color: strutColors[t] ?? FALLBACK_COLOR }}
              >
                {t}
              </span>
              {i < 2 && <span style={{ color: 'var(--text-muted)' }}>·</span>}
            </span>
          ))}
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              <th className="pb-1 pr-2 font-medium">Tipo</th>
              <th className="pb-1 pr-2 font-medium">Longitud</th>
              <th className="pb-1 font-medium">Ángulo</th>
            </tr>
          </thead>
          <tbody>
            {triangle.strutTypes.map((t, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--glass-border)' }}>
                <td
                  className="py-1 pr-2 font-bold"
                  style={{ color: strutColors[t] ?? FALLBACK_COLOR }}
                >
                  {t}
                </td>
                <td className="py-1 pr-2 font-mono" style={{ color: 'var(--text-secondary)' }}>
                  {Math.round(triangle.lengths[i])} mm
                </td>
                <td className="py-1 font-mono" style={{ color: 'var(--text-secondary)' }}>
                  {triangle.angles[i].toFixed(1)}°
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function TriangleViewer({
  triangleTypes,
  beamWidth,
  beamThickness,
  strutColors,
}: TriangleViewerProps) {
  if (!triangleTypes.length) return null;

  return (
    <section
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.5rem',
      }}
    >
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: 'var(--text-primary)', margin: '0 0 0.5rem' }}>
        Vista de triángulo · paneles ensamblados
      </h2>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '0 0 1rem' }}>
        Cada panel se ensambla plano antes de levantarlo al domo.
      </p>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {triangleTypes.map((t) => (
          <TriangleCard
            key={t.id}
            triangle={t}
            beamWidth={beamWidth}
            beamThickness={beamThickness}
            strutColors={strutColors}
          />
        ))}
      </div>
    </section>
  );
}
