import { useState } from 'react';
import type { NodeCut, StrutTypeSummary } from '../lib/geodesic/types';
import StrutDrawing3D from './StrutDrawing3D';
import { STRUT_COLORS_HEX, STRUT_COLOR_FALLBACK_HEX } from '../constants/strutColors';

interface SierraAngulosProps {
  nodeCuts: NodeCut[];
  strutTypes: StrutTypeSummary[];
  beamWidth: number;
  beamThickness: number;
}

// Paleta dark para los SVG de sierra (espejo del design system).
const BG = '#111a12';
const FENCE = '#3d4a3d';
const TEXT_MUTED = '#8fa88f';

const RAD = (deg: number) => (deg * Math.PI) / 180;

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

function formatNodeType(nodeType: string): string {
  const t = nodeType.toLowerCase();
  if (t.includes('pent')) return 'Pentagonal';
  if (t.includes('hex')) return 'Hexagonal';
  if (t.includes('boundary') || t.includes('base')) return 'Base';
  return nodeType;
}

// Vista frontal sierra de mesa: listón apoyado de canto sobre la mesa,
// disco inclinado al tableSawTilt desde la vertical. La viga se apoya
// contra el fence y el disco entra por la esquina superior de la cara
// ancha — no por el centro.
function tableSawSVG(
  tiltDeg: number,
  color: string,
  beamWidth: number,
  beamThickness: number
): string {
  const T = RAD(tiltDeg);
  const px = 115;
  const tableY = 158;

  // Viga de canto: ancho visual = cara estrecha (beamThickness),
  // alto visual = cara ancha (beamWidth). Escala 40×120 → 25×95.
  const vigancho = (beamThickness / 40) * 25;
  const vigalto = (beamWidth / 120) * 95;
  const vigarX_izq = px - vigancho / 2;
  const vigarX_der = px + vigancho / 2;
  const vigar_top = tableY - vigalto;

  // El disco entra por la esquina superior derecha y sale en la mesa
  // a una distancia = vigalto · tan(tilt) del mismo borde.
  const entryX = vigarX_der;
  const entryY = vigar_top;
  const desplazamiento = vigalto * Math.tan(T);
  const exitX = vigarX_der - desplazamiento;
  const exitY = tableY;

  // Disco (semicírculo): centro en (entryX, tableY), radio 30, rotado -tilt.
  const discR = 30;
  const discPath = `M ${(entryX - discR).toFixed(2)} ${tableY} A ${discR} ${discR} 0 0 1 ${(entryX + discR).toFixed(2)} ${tableY}`;
  const discTransform = `rotate(${(-tiltDeg).toFixed(2)} ${entryX.toFixed(2)} ${tableY})`;
  const discColor = darken(color, 0.6);

  // Arco del ángulo: centro en entrada, radio 28, desde la vertical-abajo
  // hasta la dirección del disco.
  const arcR = 28;
  const arcStartX = entryX;
  const arcStartY = entryY + arcR;
  const arcEndX = entryX - Math.sin(T) * arcR;
  const arcEndY = entryY + Math.cos(T) * arcR;

  // Label del ángulo: punto medio del arco + offset hacia la izquierda.
  const halfT = T / 2;
  const midX = entryX - Math.sin(halfT) * arcR;
  const midY = entryY + Math.cos(halfT) * arcR;
  const labelX = midX - 8;
  const labelY = midY + 4;

  // Fence: línea discontinua justo a la derecha del borde de la viga.
  const fenceX = vigarX_der + 6;
  const fenceTopY = vigar_top - 10;
  const fenceBotY = tableY + 4;

  return `
    <rect x="0" y="0" width="230" height="200" rx="8" fill="${BG}"/>
    <!-- Cuerpo de la sierra (debajo de la mesa) -->
    <rect x="0" y="${tableY + 4}" width="230" height="${200 - tableY - 4}"
      fill="${FENCE}" fill-opacity="0.18"/>
    <!-- Mesa (superficie) -->
    <line x1="0" y1="${tableY}" x2="230" y2="${tableY}"
      stroke="${TEXT_MUTED}" stroke-width="2" stroke-opacity="0.65"/>
    <!-- Viga apoyada de canto -->
    <rect x="${vigarX_izq.toFixed(2)}" y="${vigar_top.toFixed(2)}"
      width="${vigancho.toFixed(2)}" height="${vigalto.toFixed(2)}" rx="2"
      fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-opacity="0.6"
      stroke-width="1"/>
    <!-- Cuña eliminada (material que se retira) -->
    <path d="M ${entryX.toFixed(2)} ${entryY.toFixed(2)} L ${vigarX_der.toFixed(2)} ${exitY} L ${exitX.toFixed(2)} ${exitY} Z"
      fill="${color}" fill-opacity="0.25" stroke="none"/>
    <!-- Disco (semicírculo de la hoja, inclinado) -->
    <path d="${discPath}" transform="${discTransform}"
      fill="none" stroke="${discColor}" stroke-width="1.5"
      stroke-linecap="round"/>
    <!-- Línea de corte: entrada → salida -->
    <line x1="${entryX.toFixed(2)}" y1="${entryY.toFixed(2)}"
      x2="${exitX.toFixed(2)}" y2="${exitY}"
      stroke="${color}" stroke-width="2" stroke-linecap="round"/>
    <!-- Arco del ángulo -->
    <path d="M ${arcStartX.toFixed(2)} ${arcStartY.toFixed(2)} A ${arcR} ${arcR} 0 0 1 ${arcEndX.toFixed(2)} ${arcEndY.toFixed(2)}"
      fill="none" stroke="${color}" stroke-width="1.5"/>
    <text x="${labelX.toFixed(2)}" y="${labelY.toFixed(2)}"
      text-anchor="end" font-size="11" font-weight="600" fill="${color}"
      font-family="Work Sans, ui-sans-serif, sans-serif">${tiltDeg.toFixed(1)}°</text>
    <!-- Fence/guía vertical -->
    <line x1="${fenceX}" y1="${fenceTopY.toFixed(2)}" x2="${fenceX}" y2="${fenceBotY}"
      stroke="#888" stroke-width="1.5" stroke-dasharray="3 2"/>
    <text x="${fenceX + 2}" y="${(fenceTopY - 2).toFixed(2)}" font-size="8"
      fill="${TEXT_MUTED}" font-family="Work Sans, ui-sans-serif, sans-serif">fence</text>
    <!-- Etiquetas dimensiones -->
    <text x="${(vigarX_izq - 4).toFixed(2)}" y="${((vigar_top + tableY) / 2).toFixed(2)}"
      text-anchor="end" dominant-baseline="middle" font-size="9"
      fill="${TEXT_MUTED}" font-family="DM Mono, ui-monospace, monospace">${beamWidth} mm</text>
    <text x="${px}" y="${tableY + 14}" text-anchor="middle" font-size="9"
      fill="${TEXT_MUTED}" font-family="DM Mono, ui-monospace, monospace">${beamThickness} mm (mesa)</text>
    <text x="115" y="195" text-anchor="middle" font-size="10" fill="${TEXT_MUTED}"
      font-family="Work Sans, ui-sans-serif, sans-serif">sierra de mesa · disco inclinado</text>
  `;
}

// Vista superior de la ingletadora — solo el ángulo a1 (giro de la mesa).
// FENCE arriba, madera apoyada contra el fence, referencia 0° vertical
// hacia abajo, línea de corte rotada a1° hacia la derecha y arco/label.
function svgAngleA1(miterAngle: number, beamWidth: number, color: string): string {
  const a1 = RAD(miterAngle);
  const fmt = (n: number) => n.toFixed(2);

  const fenceY = 55;
  const beamWidthPx = Math.min((beamWidth / 120) * 85, 100);
  const woodX = 30;
  const woodH = 55;
  const pivotX = woodX + beamWidthPx;

  // Línea de corte rotada a1° desde la referencia (perpendicular al fence).
  const cutLen = 110;
  const cutEndX = pivotX + Math.sin(a1) * cutLen;
  const cutEndY = fenceY + Math.cos(a1) * cutLen;

  // Arco del ángulo (centro en pivot, radio 38, sweep clockwise).
  const arcR = 38;
  const arcStartY = fenceY + arcR;
  const arcEndX = pivotX + Math.sin(a1) * arcR;
  const arcEndY = fenceY + Math.cos(a1) * arcR;

  // Label dentro del arco con offset.
  const midAngle = a1 / 2;
  const labelX = pivotX + Math.sin(midAngle) * 58;
  const labelY = fenceY + Math.cos(midAngle) * 58;

  // Veta de la madera (3 líneas horizontales sutiles).
  const grain: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const gy = fenceY + (woodH * i) / 4;
    grain.push(
      `<line x1="${woodX + 2}" y1="${fmt(gy)}" x2="${fmt(woodX + beamWidthPx - 2)}" y2="${fmt(gy)}" stroke="#b89660" stroke-width="0.8" opacity="0.4"/>`
    );
  }

  // Flecha al final de la línea de corte.
  const dirX = Math.sin(a1);
  const dirY = Math.cos(a1);
  const perpX = -Math.cos(a1);
  const perpY = Math.sin(a1);
  const arrowLen = 7;
  const arrowHalfW = 4;
  const baseCx = cutEndX - dirX * arrowLen;
  const baseCy = cutEndY - dirY * arrowLen;
  const ah1x = baseCx + perpX * arrowHalfW;
  const ah1y = baseCy + perpY * arrowHalfW;
  const ah2x = baseCx - perpX * arrowHalfW;
  const ah2y = baseCy - perpY * arrowHalfW;

  const arcPath =
    miterAngle >= 0.05
      ? `<path d="M ${fmt(pivotX)} ${fmt(arcStartY)} A ${arcR} ${arcR} 0 0 1 ${fmt(arcEndX)} ${fmt(arcEndY)}" fill="none" stroke="${color}" stroke-width="2"/>`
      : '';

  return `
    <rect x="0" y="0" width="240" height="200" rx="8" fill="#16191f"/>
    <!-- FENCE label + línea -->
    <text x="120" y="44" text-anchor="middle" font-size="9" fill="#888"
      font-family="Work Sans, ui-sans-serif, sans-serif">FENCE</text>
    <line x1="20" y1="${fenceY}" x2="220" y2="${fenceY}"
      stroke="#aaa" stroke-width="4" stroke-linecap="round"/>
    <!-- Pieza de madera contra el fence -->
    <rect x="${woodX}" y="${fenceY}" width="${fmt(beamWidthPx)}" height="${woodH}" rx="2"
      fill="#c8a87a" stroke="#8a6a40" stroke-width="1.5"/>
    ${grain.join('\n    ')}
    <!-- Referencia 0° (perpendicular al fence) -->
    <line x1="${fmt(pivotX)}" y1="${fenceY}" x2="${fmt(pivotX)}" y2="170"
      stroke="#555" stroke-width="1" stroke-dasharray="5 4"/>
    <!-- Línea de corte rotada a1° -->
    <line x1="${fmt(pivotX)}" y1="${fenceY}" x2="${fmt(cutEndX)}" y2="${fmt(cutEndY)}"
      stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
    <polygon points="${fmt(cutEndX)},${fmt(cutEndY)} ${fmt(ah1x)},${fmt(ah1y)} ${fmt(ah2x)},${fmt(ah2y)}"
      fill="${color}"/>
    <!-- Arco del ángulo -->
    ${arcPath}
    <!-- Punto de pivot -->
    <circle cx="${fmt(pivotX)}" cy="${fenceY}" r="4" fill="${color}"/>
    <!-- Label a1 -->
    <rect x="${fmt(labelX - 22)}" y="${fmt(labelY - 14)}" width="44" height="32" rx="4"
      fill="#16191f" stroke="${color}" stroke-width="1"/>
    <text x="${fmt(labelX)}" y="${fmt(labelY - 1)}" text-anchor="middle"
      font-size="10" font-weight="700" fill="#aaa"
      font-family="Work Sans, ui-sans-serif, sans-serif">a1</text>
    <text x="${fmt(labelX)}" y="${fmt(labelY + 15)}" text-anchor="middle"
      font-size="18" font-weight="700" fill="${color}"
      font-family="Work Sans, ui-sans-serif, sans-serif">${miterAngle.toFixed(1)}°</text>
    <text x="${fmt(labelX)}" y="${fmt(labelY + 25)}" text-anchor="middle"
      font-size="8" fill="#666"
      font-family="Work Sans, ui-sans-serif, sans-serif">(escala de mesa)</text>
    <!-- Caption -->
    <text x="120" y="190" text-anchor="middle" font-size="10" fill="#666"
      font-family="Work Sans, ui-sans-serif, sans-serif">vista superior · girar la mesa</text>
  `;
}

// Vista frontal de la ingletadora — solo el ángulo b1 (inclinación de la
// hoja). Mesa abajo, sección transversal de la madera apoyada sobre la
// mesa, referencia vertical desde el pivot y hoja inclinada b1° hacia la
// izquierda. Con b1 = 0 se muestra solo la referencia + un badge claro.
function svgAngleB1(
  bevelAngle: number,
  beamWidth: number,
  beamThickness: number,
  color: string
): string {
  const b1 = RAD(bevelAngle);
  const fmt = (n: number) => n.toFixed(2);

  const tableY = 155;
  const pivotX = 120;
  const b1Zero = bevelAngle < 0.05;

  const beamWidthPx = Math.min((beamWidth / 120) * 110, 130);
  const beamThickPx = (beamThickness / 40) * 32;
  const beamX = pivotX - beamWidthPx / 2;
  const beamY = tableY - beamThickPx;

  // Línea de la hoja inclinada b1° desde la vertical hacia la izquierda.
  const bladeLen = 120;
  const bladeEndX = pivotX - Math.sin(b1) * bladeLen;
  const bladeEndY = tableY - Math.cos(b1) * bladeLen;

  // Arco del ángulo (centro en pivot, radio 42, sweep counterclockwise).
  const arcR = 42;
  const arcStartY = tableY - arcR;
  const arcEndX = pivotX - Math.sin(b1) * arcR;
  const arcEndY = tableY - Math.cos(b1) * arcR;

  const arcPath = !b1Zero
    ? `<path d="M ${pivotX} ${fmt(arcStartY)} A ${arcR} ${arcR} 0 0 0 ${fmt(arcEndX)} ${fmt(arcEndY)}" fill="none" stroke="${color}" stroke-width="2"/>`
    : '';

  let labelMarkup: string;
  if (b1Zero) {
    labelMarkup = `
    <rect x="30" y="55" width="100" height="42" rx="4"
      fill="#2a2d35" stroke="#555" stroke-width="1"/>
    <text x="80" y="74" text-anchor="middle" font-size="12" font-weight="600" fill="#888"
      font-family="Work Sans, ui-sans-serif, sans-serif">b1 = 0°</text>
    <text x="80" y="89" text-anchor="middle" font-size="9" fill="#555"
      font-family="Work Sans, ui-sans-serif, sans-serif">hoja vertical · sin bisel</text>`;
  } else {
    const midAngle = b1 / 2;
    const labelX = pivotX - Math.sin(midAngle) * 65;
    const labelY = tableY - Math.cos(midAngle) * 65;
    labelMarkup = `
    <rect x="${fmt(labelX - 22)}" y="${fmt(labelY - 14)}" width="44" height="32" rx="4"
      fill="#16191f" stroke="${color}" stroke-width="1"/>
    <text x="${fmt(labelX)}" y="${fmt(labelY - 1)}" text-anchor="middle"
      font-size="10" font-weight="700" fill="#aaa"
      font-family="Work Sans, ui-sans-serif, sans-serif">b1</text>
    <text x="${fmt(labelX)}" y="${fmt(labelY + 15)}" text-anchor="middle"
      font-size="18" font-weight="700" fill="${color}"
      font-family="Work Sans, ui-sans-serif, sans-serif">${bevelAngle.toFixed(1)}°</text>`;
  }

  return `
    <rect x="0" y="0" width="240" height="200" rx="8" fill="#16191f"/>
    <!-- Mesa: cuerpo + línea superior -->
    <rect x="20" y="${tableY}" width="200" height="12" rx="2"
      fill="#2a2d35" stroke="#555" stroke-width="1"/>
    <line x1="20" y1="${tableY}" x2="220" y2="${tableY}"
      stroke="#aaa" stroke-width="4" stroke-linecap="round"/>
    <!-- Sección transversal de la madera -->
    <rect x="${fmt(beamX)}" y="${fmt(beamY)}" width="${fmt(beamWidthPx)}"
      height="${fmt(beamThickPx)}" rx="2"
      fill="#c8a87a" stroke="#8a6a40" stroke-width="1.5"/>
    <text x="${pivotX}" y="183" text-anchor="middle" font-size="9" fill="#666"
      font-family="DM Mono, ui-monospace, monospace">← ${beamWidth} mm →</text>
    <text x="${fmt(beamX - 6)}" y="${fmt(beamY + beamThickPx / 2 + 3)}" text-anchor="end"
      font-size="9" fill="#666"
      font-family="DM Mono, ui-monospace, monospace">${beamThickness} mm</text>
    <!-- Referencia vertical 0° -->
    <line x1="${pivotX}" y1="30" x2="${pivotX}" y2="${tableY}"
      stroke="#555" stroke-width="1" stroke-dasharray="5 4"/>
    <!-- Hoja inclinada b1° -->
    <line x1="${pivotX}" y1="${tableY}" x2="${fmt(bladeEndX)}" y2="${fmt(bladeEndY)}"
      stroke="${color}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="${pivotX}" cy="${tableY}" r="4" fill="${color}"/>
    <!-- Arco -->
    ${arcPath}
    <!-- Label -->
    ${labelMarkup}
    <!-- Caption -->
    <text x="120" y="195" text-anchor="middle" font-size="10" fill="#666"
      font-family="Work Sans, ui-sans-serif, sans-serif">vista frontal · inclinar la hoja</text>
  `;
}

export default function SierraAngulos({
  nodeCuts,
  strutTypes,
  beamWidth,
  beamThickness,
}: SierraAngulosProps) {
  const [activeIdx, setActiveIdx] = useState(0);

  if (!nodeCuts.length) {
    return (
      <div className="empty-state" style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
        No hay cortes para mostrar.
      </div>
    );
  }

  const safeIdx = Math.min(activeIdx, nodeCuts.length - 1);
  const active = nodeCuts[safeIdx];
  const color = STRUT_COLORS_HEX[active.strutType] ?? STRUT_COLOR_FALLBACK_HEX;
  const summary = strutTypes.find((s) => s.type === active.strutType);
  const tableSawTilt = summary?.tableSawTilt ?? 0;
  const dihedralAngle = summary?.dihedralAngle ?? 0;
  const strutLengthMm = summary?.length ?? 0;

  return (
    <div
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.5rem',
      }}
    >
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: 'var(--text-primary)', margin: '0 0 0.5rem' }}>
        Diagrama de sierra · método 2 máquinas
      </h2>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '0 0 1.25rem', lineHeight: 1.5 }}>
        Sierra de mesa para el bisel diedro a lo largo del listón, ingletadora
        para el corte de extremo (sin bisel). Selecciona el tipo de corte.
      </p>

      <div className="mb-5 flex flex-wrap gap-2">
        {nodeCuts.map((cut, i) => {
          const c = STRUT_COLORS_HEX[cut.strutType] ?? STRUT_COLOR_FALLBACK_HEX;
          const sum = strutTypes.find((s) => s.type === cut.strutType);
          const tilt = sum?.tableSawTilt ?? 0;
          const isActive = i === safeIdx;
          return (
            <button
              key={`${cut.strutType}-${cut.nodeType}-${i}`}
              type="button"
              onClick={() => setActiveIdx(i)}
              className="rounded-lg border px-3 py-2 text-xs font-medium transition"
              style={{
                borderColor: c,
                backgroundColor: isActive ? c : 'transparent',
                color: isActive ? '#050f08' : c,
              }}
            >
              <span className="font-semibold">
                {cut.strutType} · {formatNodeType(cut.nodeType)}
              </span>
              <span className="ml-2 opacity-90">
                axial: {cut.axialAngle.toFixed(1)}° | mesa: {tilt.toFixed(1)}°
              </span>
            </button>
          );
        })}
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="kpi-card">
          <div className="kpi-value" style={{ color }}>{tableSawTilt.toFixed(1)}°</div>
          <div className="kpi-label">Sierra de mesa</div>
          <div className="kpi-hint">disco inclinado</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color }}>{active.axialAngle.toFixed(1)}°</div>
          <div className="kpi-label">Ángulo axial</div>
          <div className="kpi-hint">escuadra digital</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color }}>{active.miter.toFixed(1)}°</div>
          <div className="kpi-label">Inglete (escala)</div>
          <div className="kpi-hint">mesa de la sierra</div>
        </div>
      </div>

      {/* Vista isométrica del listón con corte en V */}
      <div className="mb-2">
        <StrutDrawing3D
          lengthMm={strutLengthMm}
          beamWidth={beamWidth}
          beamThickness={beamThickness}
          miter={active.miter}
          tableSawTilt={tableSawTilt}
          color={color}
          strutType={active.strutType}
        />
      </div>
      <p className="mb-5 text-center text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
        ← esta cara sobre la mesa de la ingletadora →
      </p>

      {/* Configuración de máquinas: 3 vistas (sierra de mesa + a1 + b1) */}
      <div className="mb-5">
        <h3
          className="mb-3"
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 700,
            fontSize: '0.875rem',
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
          }}
        >
          Configuración de máquinas
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Sierra de mesa · paso previo
            </div>
            <svg
              viewBox="0 0 230 200"
              className="w-full"
              style={{ aspectRatio: '230/200' }}
              dangerouslySetInnerHTML={{
                __html: tableSawSVG(tableSawTilt, color, beamWidth, beamThickness),
              }}
            />
            <div className="mt-1 text-center text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
              sierra de mesa · disco a {tableSawTilt.toFixed(1)}° · viga de canto
            </div>
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Ingletadora · ángulo a1 (mesa)
            </div>
            <svg
              viewBox="0 0 240 200"
              className="w-full"
              style={{ aspectRatio: '240/200' }}
              dangerouslySetInnerHTML={{
                __html: svgAngleA1(active.miter, beamWidth, color),
              }}
            />
            <div className="mt-1 text-center text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
              girar la mesa hasta {active.miter.toFixed(1)}°
            </div>
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Ingletadora · ángulo b1 (hoja)
            </div>
            <svg
              viewBox="0 0 240 200"
              className="w-full"
              style={{ aspectRatio: '240/200' }}
              dangerouslySetInnerHTML={{
                __html: svgAngleB1(active.bevel, beamWidth, beamThickness, color),
              }}
            />
            <div className="mt-1 text-center text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
              {active.bevel < 0.05
                ? 'hoja vertical · sin inclinar (Método A)'
                : `inclinar la hoja a ${active.bevel.toFixed(1)}°`}
            </div>
          </div>
        </div>
      </div>

      <div
        className="mb-4 p-4 text-sm"
        style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}
      >
        <div className="mb-1 font-medium" style={{ color: 'var(--text-primary)' }}>Aplica a:</div>
        <div>
          Nudo{' '}
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{formatNodeType(active.nodeType)}</span>,
          listón tipo{' '}
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{active.strutType}</span> ·{' '}
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{active.quantity}</span> extremos ·
          diedro <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{dihedralAngle.toFixed(1)}°</span>{' '}
          · longitud{' '}
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{Math.round(strutLengthMm)} mm</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div
          className="p-4 text-xs"
          style={{
            background: 'var(--accent-dim)',
            border: '1px solid var(--accent)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
          }}
        >
          <div className="mb-1 font-semibold uppercase tracking-wider">
            Método A · 2 máquinas (recomendado)
          </div>
          <ol className="list-decimal space-y-1 pl-4">
            <li>
              Sierra de mesa: disco a{' '}
              <span className="font-semibold">{tableSawTilt.toFixed(1)}°</span>{' '}
              · listón apoyado de canto ({beamThickness} mm).
            </li>
            <li>
              Ingletadora: ángulo axial{' '}
              <span className="font-semibold">
                {active.axialAngle.toFixed(1)}°
              </span>{' '}
              (escuadra digital sobre la hoja).
            </li>
          </ol>
          <p className="mt-2 italic">
            Sin bisel en ingletadora. Sin esquinas que sobresalgan en el nudo.
          </p>
        </div>
        <div
          className="p-4 text-xs"
          style={{
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-secondary)',
          }}
        >
          <div className="mb-1 font-semibold uppercase tracking-wider">
            Método B · 1 máquina (alternativo)
          </div>
          <ol className="list-decimal space-y-1 pl-4">
            <li>
              Ingletadora: inglete{' '}
              <span className="font-semibold">{active.miter.toFixed(1)}°</span>{' '}
              + bisel{' '}
              <span className="font-semibold">{active.bevel.toFixed(1)}°</span>.
            </li>
          </ol>
          <p className="mt-2 italic">
            Puede requerir lijar esquinas en el nudo.
          </p>
        </div>
      </div>
    </div>
  );
}
