interface StrutDrawing3DProps {
  lengthMm: number;
  beamWidth: number;
  beamThickness: number;
  miter: number;
  tableSawTilt: number;
  color: string;
  strutType: string;
}

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;

function darkenHex(hex: string, factor: number): string {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return hex;
  const r = Math.max(0, Math.min(255, Math.floor(parseInt(m[1], 16) * factor)));
  const g = Math.max(0, Math.min(255, Math.floor(parseInt(m[2], 16) * factor)));
  const b = Math.max(0, Math.min(255, Math.floor(parseInt(m[3], 16) * factor)));
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Vec2 {
  x: number;
  y: number;
}

function project(p: Vec3): Vec2 {
  // Isometric: X → (cos30, -sin30), Y → (0, 1), Z → (-cos30, -sin30)
  return {
    x: p.x * COS30 - p.z * COS30,
    y: -p.x * SIN30 + p.y - p.z * SIN30,
  };
}

function path(points: Vec3[]): string {
  return (
    points
      .map((p, i) => {
        const s = project(p);
        return `${i === 0 ? 'M' : 'L'} ${s.x.toFixed(2)} ${s.y.toFixed(2)}`;
      })
      .join(' ') + ' Z'
  );
}

export default function StrutDrawing3D({
  lengthMm,
  beamWidth,
  beamThickness,
  miter,
  tableSawTilt,
  color,
  strutType,
}: StrutDrawing3DProps) {
  // Visual scale (px): length fixed at 320; width 60 max; thickness keeps real ratio.
  const L = 320;
  const W = 60;
  const T = Math.max(8, Math.min(48, W * (beamThickness / Math.max(beamWidth, 1))));

  const miterRad = (miter * Math.PI) / 180;
  // V-cut depth on top face: lateral edges recede by W/2 · tan(miter).
  const delta = Math.min(L * 0.45, (W / 2) * Math.tan(miterRad));

  // 3D coordinates of vertices we need.
  const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

  // Top face (pentagon: V-cut on right end)
  const topPentagon = [
    v(0, 0, 0),
    v(L - delta, 0, 0),
    v(L, 0, W / 2),
    v(L - delta, 0, W),
    v(0, 0, W),
  ];
  // Front long side (rect: shortened on the right by V-cut)
  const frontRect = [
    v(0, 0, 0),
    v(L - delta, 0, 0),
    v(L - delta, T, 0),
    v(0, T, 0),
  ];
  // Front V-cut face (visible cut face — diagonal toward the V tip)
  const frontCutFace = [
    v(L - delta, 0, 0),
    v(L, 0, W / 2),
    v(L, T, W / 2),
    v(L - delta, T, 0),
  ];

  const colorTop = color;
  const colorFront = darkenHex(color, 0.7);
  const colorCut = darkenHex(color, 0.45);
  const stroke = darkenHex(color, 0.4);

  // ViewBox sized to fit the projected beam plus label margins.
  // Project the extreme corners to find the bounding box.
  const allPts: Vec3[] = [
    v(0, 0, 0),
    v(L, 0, 0),
    v(L, 0, W),
    v(0, 0, W),
    v(0, T, 0),
    v(L, T, 0),
    v(L, T, W),
    v(0, T, W),
  ];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of allPts) {
    const s = project(p);
    if (s.x < minX) minX = s.x;
    if (s.x > maxX) maxX = s.x;
    if (s.y < minY) minY = s.y;
    if (s.y > maxY) maxY = s.y;
  }
  const padX = 70;
  const padTop = 50;
  // vbW is horizontal-only (independent of the cota); vbH is derived further
  // down, once the real length-cota position is known, to stack the bottom
  // bands without overlap.
  const vbW = maxX - minX + padX * 2;
  const ox = -minX + padX;
  const oy = -minY + padTop;

  const transform = `translate(${ox.toFixed(2)} ${oy.toFixed(2)})`;

  // Project specific points for labels and cotas.
  const tl = project(v(0, 0, 0));        // top-front-left
  const trCutTop = project(v(L - delta, 0, 0));
  const vTipTop = project(v(L, 0, W / 2));
  const tlBack = project(v(0, 0, W));
  const blFront = project(v(0, T, 0));   // bottom-front-left
  const blFrontRight = project(v(L - delta, T, 0));
  const vTipBottom = project(v(L, T, W / 2));

  // Length cota: along the bottom-front edge (from blFront to blFrontRight),
  // shifted slightly down.
  const cotaY = Math.max(blFront.y, blFrontRight.y) + 28;
  const cotaX1 = blFront.x;
  const cotaX2 = blFrontRight.x;

  // Width cota: across the top (tl to tlBack).
  const widthCotaPad = 18;
  const widthCotaY = Math.min(tl.y, tlBack.y) - widthCotaPad;

  // Thickness cota: on the front face left edge.
  const thickCotaX = tl.x - 18;

  // --- Bottom band layout ----------------------------------------------------
  // Three stacked bands share the lower canvas: (1) length cota, (2) section
  // orientation box, (3) bottom caption. They used unrelated references (cota
  // vs. canvas bottom) and overlapped. Derive the section inset and the canvas
  // height from the real cota position so the bands never collide.
  //
  // Cross-section box size (used to render the inset AND to size vbH).
  const sectMaxW = 70;
  const sectMaxH = 30;
  const sectRatio = beamThickness / Math.max(beamWidth, 1);
  const sW = sectMaxW;
  const sH = Math.max(8, Math.min(sectMaxH, sectMaxW * sectRatio));
  // Section inset internal vertical offsets (shared with the render below).
  const sectBoxDy = 22; // box top below insetTop
  const sectTableGap = 4; // gap from box bottom to the table line
  const sectMesaDy = 12; // MESA baseline below the table line
  // Bottom of the length-cota text in viewBox coords (baseline + descender).
  const cotaTextBottom = oy + cotaY + 16 + 4;
  // Section box starts a clear margin below the cota.
  const sectionGap = 18;
  const insetTop = cotaTextBottom + sectionGap;
  // Lowest section element is the MESA label under the table line.
  const sectionBlockBottom =
    insetTop + sectBoxDy + sH + sectTableGap + sectMesaDy + 4;
  // Canvas height: leave room for the bottom caption (drawn at vbH - 12).
  const captionGap = 18;
  const vbH = sectionBlockBottom + captionGap + 12;

  return (
    <svg
      viewBox={`0 0 ${vbW.toFixed(0)} ${vbH.toFixed(0)}`}
      className="w-full"
      style={{ aspectRatio: `${vbW.toFixed(0)}/${vbH.toFixed(0)}` }}
      role="img"
      aria-label={`Listón tipo ${strutType} con corte en V`}
    >
      <rect
        x="0"
        y="0"
        width={vbW.toFixed(0)}
        height={vbH.toFixed(0)}
        fill="var(--card-bg, #111a12)"
        rx="8"
      />

      <g transform={transform}>
        {/* Front long side */}
        <path
          d={path(frontRect)}
          fill={colorFront}
          stroke={stroke}
          strokeWidth="1"
          strokeLinejoin="round"
        />
        {/* V-cut face on the right end */}
        <path
          d={path(frontCutFace)}
          fill={colorCut}
          stroke={stroke}
          strokeWidth="1"
          strokeLinejoin="round"
        />
        {/* Top wide face with V-cut */}
        <path
          d={path(topPentagon)}
          fill={colorTop}
          stroke={stroke}
          strokeWidth="1"
          strokeLinejoin="round"
        />
        {/* Highlight the V-tip ridge (top to bottom along the V axis) */}
        <line
          x1={vTipTop.x.toFixed(2)}
          y1={vTipTop.y.toFixed(2)}
          x2={vTipBottom.x.toFixed(2)}
          y2={vTipBottom.y.toFixed(2)}
          stroke={darkenHex(color, 0.3)}
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* === Cotas y labels === */}

        {/* Length cota along bottom-front edge */}
        <line
          x1={cotaX1.toFixed(2)}
          y1={cotaY.toFixed(2)}
          x2={cotaX2.toFixed(2)}
          y2={cotaY.toFixed(2)}
          stroke="var(--text-secondary)"
          strokeWidth="1"
        />
        <line
          x1={cotaX1.toFixed(2)}
          y1={(cotaY - 4).toFixed(2)}
          x2={cotaX1.toFixed(2)}
          y2={(cotaY + 4).toFixed(2)}
          stroke="var(--text-secondary)"
          strokeWidth="1"
        />
        <line
          x1={cotaX2.toFixed(2)}
          y1={(cotaY - 4).toFixed(2)}
          x2={cotaX2.toFixed(2)}
          y2={(cotaY + 4).toFixed(2)}
          stroke="var(--text-secondary)"
          strokeWidth="1"
        />
        <text
          x={((cotaX1 + cotaX2) / 2).toFixed(2)}
          y={(cotaY + 16).toFixed(2)}
          textAnchor="middle"
          fontSize="11"
          fill="var(--text-primary)"
          fontFamily="DM Mono, ui-monospace, monospace"
        >
          longitud: {Math.round(lengthMm)} mm
        </text>

        {/* Width cota across the top of the beam */}
        <line
          x1={tl.x.toFixed(2)}
          y1={widthCotaY.toFixed(2)}
          x2={tlBack.x.toFixed(2)}
          y2={widthCotaY.toFixed(2)}
          stroke="var(--text-muted)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <text
          x={((tl.x + tlBack.x) / 2).toFixed(2)}
          y={(widthCotaY - 6).toFixed(2)}
          textAnchor="middle"
          fontSize="10"
          fill="var(--text-secondary)"
          fontFamily="DM Mono, ui-monospace, monospace"
        >
          ← {beamWidth} mm →
        </text>

        {/* Thickness label on the front face left edge */}
        <text
          x={thickCotaX.toFixed(2)}
          y={((tl.y + blFront.y) / 2 + 4).toFixed(2)}
          textAnchor="end"
          fontSize="10"
          fill="var(--text-secondary)"
          fontFamily="DM Mono, ui-monospace, monospace"
        >
          {beamThickness} mm
        </text>

        {/* Miter callout pointing at the V tip */}
        <line
          x1={(vTipTop.x + 30).toFixed(2)}
          y1={(vTipTop.y - 30).toFixed(2)}
          x2={vTipTop.x.toFixed(2)}
          y2={vTipTop.y.toFixed(2)}
          stroke={stroke}
          strokeWidth="1"
        />
        <text
          x={(vTipTop.x + 32).toFixed(2)}
          y={(vTipTop.y - 32).toFixed(2)}
          textAnchor="start"
          fontSize="11"
          fontWeight="600"
          fill={stroke}
          fontFamily="Work Sans, ui-sans-serif, sans-serif"
        >
          ∠ {miter.toFixed(1)}°
        </text>
        <text
          x={(vTipTop.x + 32).toFixed(2)}
          y={(vTipTop.y - 20).toFixed(2)}
          textAnchor="start"
          fontSize="9"
          fill="var(--text-muted)"
          fontFamily="Work Sans, ui-sans-serif, sans-serif"
        >
          inglete
        </text>

        {/* Table saw tilt callout, on the V-cut face */}
        <text
          x={((trCutTop.x + vTipTop.x) / 2 - 10).toFixed(2)}
          y={((trCutTop.y + vTipTop.y) / 2 + (T + 24)).toFixed(2)}
          textAnchor="middle"
          fontSize="10"
          fill={darkenHex(color, 0.5)}
          fontFamily="Work Sans, ui-sans-serif, sans-serif"
        >
          disco: {tableSawTilt.toFixed(1)}°
        </text>

        {/* Subtle reference axis at the V tip */}
        <circle
          cx={vTipTop.x.toFixed(2)}
          cy={vTipTop.y.toFixed(2)}
          r="2.5"
          fill={stroke}
        />

      </g>

      {/* Cross-section orientation indicator — bottom-left inset.
          Shows the beam end-on with the wide face down against the table. */}
      {(() => {
        const insetX = 18;
        // insetTop, sW, sH and the section vertical offsets are derived above
        // from the real cota position (see "Bottom band layout").
        const sectX = insetX + 8;
        const sectY = insetTop + sectBoxDy;
        const tableY = sectY + sH + sectTableGap;

        return (
          <g>
            <text
              x={(insetX + 4).toFixed(2)}
              y={(insetTop + 12).toFixed(2)}
              fontSize="9"
              fontWeight="600"
              fill="var(--text-muted)"
              fontFamily="Work Sans, ui-sans-serif, sans-serif"
            >
              sección · posición sobre mesa
            </text>
            {/* The beam cross-section */}
            <rect
              x={sectX}
              y={sectY}
              width={sW}
              height={sH}
              rx="2"
              fill={colorTop}
              stroke={stroke}
              strokeWidth="1"
            />
            {/* Width label above the rect */}
            <text
              x={(sectX + sW / 2).toFixed(2)}
              y={(sectY - 4).toFixed(2)}
              textAnchor="middle"
              fontSize="9"
              fill="var(--text-secondary)"
              fontFamily="DM Mono, ui-monospace, monospace"
            >
              {beamWidth} mm
            </text>
            {/* Thickness label on the side */}
            <text
              x={(sectX + sW + 6).toFixed(2)}
              y={(sectY + sH / 2 + 3).toFixed(2)}
              fontSize="9"
              fill="var(--text-secondary)"
              fontFamily="DM Mono, ui-monospace, monospace"
            >
              {beamThickness} mm
            </text>
            {/* Saw table line */}
            <line
              x1={(sectX - 6).toFixed(2)}
              y1={tableY.toFixed(2)}
              x2={(sectX + sW + 6).toFixed(2)}
              y2={tableY.toFixed(2)}
              stroke="var(--text-muted)"
              strokeWidth="2"
            />
            {/* Arrow pointing down to the table */}
            <line
              x1={(sectX + sW / 2).toFixed(2)}
              y1={(sectY + sH + 1).toFixed(2)}
              x2={(sectX + sW / 2).toFixed(2)}
              y2={(tableY - 1).toFixed(2)}
              stroke="var(--text-secondary)"
              strokeWidth="1"
            />
            <polygon
              points={`${sectX + sW / 2 - 3},${tableY - 4} ${sectX + sW / 2 + 3},${tableY - 4} ${sectX + sW / 2},${tableY - 0.5}`}
              fill="var(--text-secondary)"
            />
            <text
              x={(sectX + sW / 2).toFixed(2)}
              y={(tableY + sectMesaDy).toFixed(2)}
              textAnchor="middle"
              fontSize="9"
              fontWeight="600"
              fill="var(--text-primary)"
              fontFamily="Work Sans, ui-sans-serif, sans-serif"
            >
              MESA
            </text>
            {/* "apoya aquí" callout above the rect */}
            <text
              x={(sectX + sW / 2).toFixed(2)}
              y={(sectY + sH / 2 + 3).toFixed(2)}
              textAnchor="middle"
              fontSize="9"
              fontWeight="600"
              fill={darkenHex(color, 0.45)}
              fontFamily="Work Sans, ui-sans-serif, sans-serif"
            >
              apoya aquí ↓
            </text>
            {/* Side explanation */}
            <text
              x={(sectX + sW + 50).toFixed(2)}
              y={(sectY + sH / 2 - 4).toFixed(2)}
              fontSize="10"
              fill="var(--text-primary)"
              fontFamily="Work Sans, ui-sans-serif, sans-serif"
            >
              La cara de
            </text>
            <text
              x={(sectX + sW + 50).toFixed(2)}
              y={(sectY + sH / 2 + 8).toFixed(2)}
              fontSize="10"
              fontWeight="600"
              fill="var(--text-primary)"
              fontFamily="Work Sans, ui-sans-serif, sans-serif"
            >
              {beamWidth} mm
            </text>
            <text
              x={(sectX + sW + 50).toFixed(2)}
              y={(sectY + sH / 2 + 20).toFixed(2)}
              fontSize="10"
              fill="var(--text-primary)"
              fontFamily="Work Sans, ui-sans-serif, sans-serif"
            >
              apoya sobre la mesa
            </text>
          </g>
        );
      })()}

      <text
        x={(vbW / 2).toFixed(0)}
        y={(vbH - 12).toFixed(0)}
        textAnchor="middle"
        fontSize="10"
        fill="var(--text-muted)"
        fontFamily="Work Sans, ui-sans-serif, sans-serif"
      >
        listón tipo {strutType} · vista isométrica · corte en V (GoodKarma)
      </text>
    </svg>
  );
}
