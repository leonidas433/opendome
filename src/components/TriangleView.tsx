import type { TriangleFaceType } from '../lib/geodesic/types';

interface TriangleViewProps {
  triangleTypes: TriangleFaceType[];
  beamWidth: number;
  beamThickness: number;
  strutColors: Record<string, string>;
}

const FALLBACK_COLOR = '#475569';
const COS30 = Math.cos(Math.PI / 6);
const SIN30 = Math.sin(Math.PI / 6);
const VBW = 300;
const VBH = 220;

function darken(hex: string, factor: number): string {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const clamp = (c: number) => Math.max(0, Math.min(255, Math.round(c * factor)));
  const r = clamp((n >> 16) & 0xff);
  const g = clamp((n >> 8) & 0xff);
  const b = clamp(n & 0xff);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

interface Pt {
  x: number;
  y: number;
}

interface BeamRender {
  type: string;
  length: number;
  color: string;
  topPoints: string;
  depthPoints: string;
  labelX: number;
  labelY: number;
  lengthLabelX: number;
  lengthLabelY: number;
}

interface ArcRender {
  path: string;
  labelX: number;
  labelY: number;
  text: string;
}

function buildTriangleRender(
  triangle: TriangleFaceType,
  beamWidth: number,
  beamThickness: number,
  strutColors: Record<string, string>
): { beams: BeamRender[]; arcs: ArcRender[] } {
  const { strutTypes, lengths, angles } = triangle;
  const RAD = (d: number) => (d * Math.PI) / 180;

  // Opposite-angle convention: lengths[i] / strutTypes[i] = side opposite v_i,
  // angles[i] = angle at v_i. Side v0–v1 connects the two vertices NOT v2,
  // so its length = lengths[2].
  const v0_2d: Pt = { x: 0, y: 0 };
  const v1_2d: Pt = { x: lengths[2], y: 0 };
  const a1 = RAD(angles[1]);
  const v2_2d: Pt = {
    x: lengths[2] - lengths[0] * Math.cos(a1),
    y: lengths[0] * Math.sin(a1),
  };
  const verts2d: [Pt, Pt, Pt] = [v0_2d, v1_2d, v2_2d];

  const maxLen = Math.max(lengths[0], lengths[1], lengths[2]);
  const scale = 200 / maxLen;
  const halfW_mm = beamWidth * 0.5;
  const depthPx = beamThickness * scale * SIN30 * 3;

  const iso = (p: Pt): Pt => ({
    x: (p.x - p.y) * COS30 * scale,
    y: (p.x + p.y) * SIN30 * scale,
  });

  // Center the projected triangle (with padding for labels).
  const isoVerts = verts2d.map(iso);
  const padPx = beamWidth * scale * 0.5 + 24;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of isoVerts) {
    if (p.x - padPx < minX) minX = p.x - padPx;
    if (p.x + padPx > maxX) maxX = p.x + padPx;
    if (p.y - padPx < minY) minY = p.y - padPx;
    if (p.y + padPx + depthPx > maxY) maxY = p.y + padPx + depthPx;
  }
  const tx = (VBW - (minX + maxX)) / 2;
  const ty = (VBH - (minY + maxY)) / 2;
  const tIso = (p: Pt): Pt => {
    const i = iso(p);
    return { x: i.x + tx, y: i.y + ty };
  };
  const tV: [Pt, Pt, Pt] = [tIso(v0_2d), tIso(v1_2d), tIso(v2_2d)];
  const centroid: Pt = {
    x: (tV[0].x + tV[1].x + tV[2].x) / 3,
    y: (tV[0].y + tV[1].y + tV[2].y) / 3,
  };

  const beams: BeamRender[] = [];
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    const opp = (i + 2) % 3;
    const t = strutTypes[opp];
    const len = lengths[opp];
    const color = strutColors[t] ?? FALLBACK_COLOR;

    const vi = verts2d[i];
    const vj = verts2d[j];
    const dx = vj.x - vi.x;
    const dy = vj.y - vi.y;
    const dlen = Math.sqrt(dx * dx + dy * dy);
    const dnx = dx / dlen;
    const dny = dy / dlen;
    const px = -dny;
    const py = dnx;

    const c0_2d: Pt = { x: vi.x + px * halfW_mm, y: vi.y + py * halfW_mm };
    const c1_2d: Pt = { x: vi.x - px * halfW_mm, y: vi.y - py * halfW_mm };
    const c2_2d: Pt = { x: vj.x - px * halfW_mm, y: vj.y - py * halfW_mm };
    const c3_2d: Pt = { x: vj.x + px * halfW_mm, y: vj.y + py * halfW_mm };

    let c0 = tIso(c0_2d);
    let c1 = tIso(c1_2d);
    let c2 = tIso(c2_2d);
    let c3 = tIso(c3_2d);
    // Ensure c1, c2 are the front pair (higher screen Y) for the depth quad.
    if (c1.y + c2.y < c0.y + c3.y) {
      [c0, c1] = [c1, c0];
      [c2, c3] = [c3, c2];
    }

    const topPoints = [c0, c1, c2, c3]
      .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(' ');
    const c1F: Pt = { x: c1.x, y: c1.y + depthPx };
    const c2F: Pt = { x: c2.x, y: c2.y + depthPx };
    const depthPoints = [c1, c2, c2F, c1F]
      .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(' ');

    const ti = tV[i];
    const tj = tV[j];
    const midX = (ti.x + tj.x) / 2;
    const midY = (ti.y + tj.y) / 2;
    const edx = tj.x - ti.x;
    const edy = tj.y - ti.y;
    const elen = Math.sqrt(edx * edx + edy * edy);
    let perpX = -edy / elen;
    let perpY = edx / elen;
    if (perpX * (midX - centroid.x) + perpY * (midY - centroid.y) < 0) {
      perpX = -perpX;
      perpY = -perpY;
    }
    beams.push({
      type: t,
      length: len,
      color,
      topPoints,
      depthPoints,
      labelX: midX + perpX * 16,
      labelY: midY + perpY * 16,
      lengthLabelX: midX + perpX * 30,
      lengthLabelY: midY + perpY * 30,
    });
  }

  const arcs: ArcRender[] = [];
  for (let i = 0; i < 3; i++) {
    const tv = tV[i];
    const next = tV[(i + 1) % 3];
    const prev = tV[(i + 2) % 3];
    const u1x = next.x - tv.x;
    const u1y = next.y - tv.y;
    const u2x = prev.x - tv.x;
    const u2y = prev.y - tv.y;
    const u1l = Math.sqrt(u1x * u1x + u1y * u1y);
    const u2l = Math.sqrt(u2x * u2x + u2y * u2y);
    const n1x = u1x / u1l;
    const n1y = u1y / u1l;
    const n2x = u2x / u2l;
    const n2y = u2y / u2l;
    const arcR = 18;
    const sx = tv.x + n1x * arcR;
    const sy = tv.y + n1y * arcR;
    const ex = tv.x + n2x * arcR;
    const ey = tv.y + n2y * arcR;
    const cross = n1x * n2y - n1y * n2x;
    const sweep = cross > 0 ? 1 : 0;
    const path = `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${arcR} ${arcR} 0 0 ${sweep} ${ex.toFixed(2)} ${ey.toFixed(2)}`;

    let mx = n1x + n2x;
    let my = n1y + n2y;
    const ml = Math.sqrt(mx * mx + my * my) || 1;
    mx /= ml;
    my /= ml;
    const labelR = arcR + 11;
    arcs.push({
      path,
      labelX: tv.x + mx * labelR,
      labelY: tv.y + my * labelR,
      text: `${angles[i].toFixed(1)}°`,
    });
  }

  return { beams, arcs };
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
  const { beams, arcs } = buildTriangleRender(
    triangle,
    beamWidth,
    beamThickness,
    strutColors
  );

  return (
    <div className="relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className="absolute right-3 top-3 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
        {triangle.count} {triangle.count === 1 ? 'triángulo' : 'triángulos'}
      </span>
      <svg
        viewBox={`0 0 ${VBW} ${VBH}`}
        className="w-full"
        style={{ aspectRatio: `${VBW}/${VBH}` }}
      >
        {beams.map((b, i) => (
          <polygon
            key={`d${i}`}
            points={b.depthPoints}
            fill={darken(b.color, 0.6)}
            stroke={darken(b.color, 0.45)}
            strokeWidth={1}
          />
        ))}
        {beams.map((b, i) => (
          <polygon
            key={`t${i}`}
            points={b.topPoints}
            fill={b.color}
            fillOpacity={0.9}
            stroke={darken(b.color, 0.5)}
            strokeWidth={1.5}
          />
        ))}
        {arcs.map((a, i) => (
          <g key={`a${i}`}>
            <path d={a.path} fill="none" stroke="#334155" strokeWidth={1.2} />
            <text
              x={a.labelX}
              y={a.labelY}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={10}
              fill="#1e293b"
              fontFamily="ui-sans-serif, system-ui"
            >
              {a.text}
            </text>
          </g>
        ))}
        {beams.map((b, i) => (
          <g key={`l${i}`}>
            <text
              x={b.labelX}
              y={b.labelY}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={13}
              fontWeight={700}
              fill={b.color}
              fontFamily="ui-sans-serif, system-ui"
            >
              {b.type}
            </text>
            <text
              x={b.lengthLabelX}
              y={b.lengthLabelY}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={10}
              fill="#64748b"
              fontFamily="ui-monospace, Menlo, monospace"
            >
              {Math.round(b.length)} mm
            </text>
          </g>
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-1 text-sm">
        <span className="text-xs uppercase tracking-wider text-slate-500">Tipo</span>
        {triangle.strutTypes.map((t, i) => (
          <span key={i} className="flex items-center gap-1">
            <span
              className="font-bold"
              style={{ color: strutColors[t] ?? FALLBACK_COLOR }}
            >
              {t}
            </span>
            {i < 2 && <span className="text-slate-300">·</span>}
          </span>
        ))}
      </div>
      <table className="mt-3 w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
            <th className="pb-1 pr-2 font-medium">Tipo</th>
            <th className="pb-1 pr-2 font-medium">Longitud</th>
            <th className="pb-1 font-medium">Ángulo</th>
          </tr>
        </thead>
        <tbody>
          {triangle.strutTypes.map((t, i) => (
            <tr key={i} className="border-t border-slate-100">
              <td
                className="py-1 pr-2 font-bold"
                style={{ color: strutColors[t] ?? FALLBACK_COLOR }}
              >
                {t}
              </td>
              <td className="py-1 pr-2 font-mono text-slate-700">
                {Math.round(triangle.lengths[i])} mm
              </td>
              <td className="py-1 font-mono text-slate-700">
                {triangle.angles[i].toFixed(1)}°
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TriangleView({
  triangleTypes,
  beamWidth,
  beamThickness,
  strutColors,
}: TriangleViewProps) {
  if (!triangleTypes.length) return null;

  const n = triangleTypes.length;
  const gridClass =
    n === 1
      ? 'grid-cols-1'
      : n === 2
        ? 'grid-cols-1 sm:grid-cols-2'
        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-slate-900">
        Vista de triángulo · paneles ensamblados
      </h2>
      <p className="mb-4 text-sm text-slate-600">
        Cada panel se ensambla plano antes de levantarlo al domo.
      </p>
      <div className={`grid gap-4 ${gridClass}`}>
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
    </div>
  );
}
