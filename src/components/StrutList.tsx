import type { DomeResult, NodeCut } from '../lib/geodesic/types';
import { STRUT_COLORS_HEX, STRUT_COLOR_FALLBACK_HEX } from '../constants/strutColors';

interface Props {
  result: DomeResult;
}

function shortNodeType(nodeType: string): string {
  const t = nodeType.toLowerCase();
  if (t.includes('pent')) return 'pent';
  if (t.includes('hex')) return 'hex';
  if (t.includes('boundary') || t.includes('base')) return 'base';
  return nodeType;
}

const dataLabel: React.CSSProperties = {
  fontSize: 'var(--text-caption)',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
  marginBottom: '0.2rem',
};

export default function StrutList({ result }: Props) {
  const cutsByType = new Map<string, NodeCut[]>();
  for (const c of result.nodeCuts) {
    const arr = cutsByType.get(c.strutType) ?? [];
    arr.push(c);
    cutsByType.set(c.strutType, arr);
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: 'var(--text-primary)', margin: 0 }}>
          Lista de barras
        </h2>
        <span style={{ fontSize: 'var(--text-caption)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {result.totalBeams} barras · {result.coverArea.toFixed(2)} m²
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '0.75rem',
        }}
        className="strutlist-grid"
      >
        {result.strutTypes.map((s) => {
          const color = STRUT_COLORS_HEX[s.type] ?? STRUT_COLOR_FALLBACK_HEX;
          const cuts = cutsByType.get(s.type) ?? [];
          return (
            <div key={s.type} className="strut-card" style={{ borderLeftColor: color }}>
              {/* Cabecera */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.875rem' }}>
                <span className="strut-badge" style={{ color }}>
                  {s.type}
                </span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>
                  Listón {s.type}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 'var(--text-caption)', color: 'var(--text-muted)' }}>
                  {cuts.length} {cuts.length === 1 ? 'corte' : 'cortes'}
                </span>
              </div>

              {/* Grid 2×2 de datos */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
                <div>
                  <div style={dataLabel}>Longitud</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
                    <span className="length-value" style={{ fontSize: '1.5rem', fontWeight: 500, color }}>
                      {Math.round(s.length)}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>mm</span>
                  </div>
                </div>

                <div>
                  <div style={dataLabel}>Cantidad</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
                    <span className="length-value" style={{ fontSize: '1.5rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                      {s.count}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>barras</span>
                  </div>
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={dataLabel}>Cortes por nudo · inglete / bisel</div>
                  {cuts.length === 0 ? (
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>—</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      {cuts.map((c, i) => (
                        <div
                          key={`${c.nodeType}-${i}`}
                          style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', fontSize: '0.8125rem' }}
                        >
                          <span style={{ width: '2.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 'var(--text-caption)', letterSpacing: '0.04em' }}>
                            {shortNodeType(c.nodeType)}
                          </span>
                          <span className="angle-value" style={{ color: 'var(--text-secondary)' }}>
                            {c.miter.toFixed(1)}° / {c.bevel.toFixed(1)}°
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ marginTop: '1rem', fontSize: 'var(--text-caption)', color: 'var(--text-muted)' }}>
        Base ⌀ {(result.baseRadius * 2).toFixed(2)} m · alto {result.height.toFixed(2)} m
      </p>

      <style>{`
        @media (max-width: 639px) {
          .strutlist-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
