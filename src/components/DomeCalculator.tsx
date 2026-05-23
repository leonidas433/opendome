import { useMemo, useState } from 'react';
import type { DomeConfig, NodeCut } from '../lib/geodesic/types';
import { computeDome } from '../lib/geodesic/dome';
import { STRUT_COLORS_HEX } from '../constants/strutColors';
import InputPanel from './InputPanel';
import StrutList from './StrutList';
import DomeViewer from './DomeViewer';
import SierraAngulos from './SierraAngulos';
import BaseStats from './BaseStats';
import TriangleViewer from './TriangleViewer';

const DEFAULT_CONFIG: DomeConfig = {
  frequency: 3,
  radius: 2.2,
  partial: '7/12',
  method: 'kruschke',
  beamWidth: 120,
  beamThickness: 40,
};

const NODE_ORDER: Record<string, number> = {
  pentagonal: 0,
  hexagonal: 1,
};

function sortNodeCuts(cuts: NodeCut[]): NodeCut[] {
  return [...cuts].sort((a, b) => {
    if (a.strutType !== b.strutType) return a.strutType.localeCompare(b.strutType);
    const oa = NODE_ORDER[a.nodeType] ?? 99;
    const ob = NODE_ORDER[b.nodeType] ?? 99;
    if (oa !== ob) return oa - ob;
    return a.nodeType.localeCompare(b.nodeType);
  });
}

export default function DomeCalculator() {
  const [config, setConfig] = useState<DomeConfig>(DEFAULT_CONFIG);

  const result = useMemo(() => {
    try {
      return computeDome(config);
    } catch (err) {
      console.error('computeDome failed', err);
      return null;
    }
  }, [config]);

  if (!result) {
    return (
      <div
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--error)',
          borderRadius: 'var(--radius-md)',
          padding: '1.5rem',
          color: 'var(--error)',
          fontFamily: 'var(--font-body)',
        }}
      >
        Error de cálculo. Revisa la consola.
      </div>
    );
  }

  const sortedCuts = sortNodeCuts(result.nodeCuts);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ZONA 1 — INPUTS (primero, patrón F) */}
      <InputPanel config={config} onChange={setConfig} />

      {/* ZONA 2 — VISOR 3D (feedback inmediato tras configurar) */}
      <div className="dome-glow-wrap" data-reveal>
        <div className="dome-viewer-frame">
          <DomeViewer
            vertices={result.vertices}
            struts={result.struts}
            radius={config.radius}
            beamWidth={config.beamWidth}
            beamThickness={config.beamThickness}
          />
        </div>
      </div>

      {/* ZONA 3 — KPIs / Datos constructivos */}
      <div data-reveal>
        <BaseStats result={result} config={config} />
      </div>

      {/* ZONA 4 — Lista de barras (plano de corte) */}
      <div data-reveal>
        <StrutList result={result} />
      </div>

      {/* ZONA 5 — Diagramas de sierra */}
      <div data-reveal>
        <SierraAngulos
          nodeCuts={sortedCuts}
          strutTypes={result.strutTypes}
          beamWidth={config.beamWidth}
          beamThickness={config.beamThickness}
        />
      </div>

      {/* ZONA 6 — Triángulos ensamblados (avanzado, al final) */}
      <div data-reveal>
        <TriangleViewer
          triangleTypes={result.triangleTypes}
          beamWidth={config.beamWidth}
          beamThickness={config.beamThickness}
          strutColors={STRUT_COLORS_HEX}
        />
      </div>

    </div>
  );
}
