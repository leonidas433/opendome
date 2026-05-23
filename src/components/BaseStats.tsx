import type { DomeConfig, DomeResult } from '../lib/geodesic/types';

interface BaseStatsProps {
  result: DomeResult;
  config: DomeConfig;
}

interface MetricProps {
  label: string;
  value: string;
  unit: string;
  hint?: string;
}

function Metric({ label, value, unit, hint }: MetricProps) {
  return (
    <div className="kpi-card">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
        <span className="kpi-value">{value}</span>
        <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
          {unit}
        </span>
      </div>
      <div className="kpi-label">{label}</div>
      {hint ? <div className="kpi-hint">{hint}</div> : null}
    </div>
  );
}

function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

const sectionLabel: React.CSSProperties = {
  fontSize: 'var(--text-caption)',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  color: 'var(--text-muted)',
  marginBottom: '0.75rem',
};

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: '0.75rem',
};

export default function BaseStats({ result, config }: BaseStatsProps) {
  return (
    <div
      style={{
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.25rem 1.5rem 1.5rem',
        border: '1px solid var(--glass-border)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1.25rem',
          flexWrap: 'wrap',
        }}
      >
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: 'var(--text-primary)', margin: 0 }}>
          Datos constructivos
        </h2>
        <span
          style={{
            background: 'var(--accent-dim)',
            color: 'var(--accent)',
            borderRadius: 'var(--radius-full)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-caption)',
            padding: '0.2rem 0.7rem',
            whiteSpace: 'nowrap',
          }}
        >
          {config.frequency}V · {config.partial} · R = {config.radius.toFixed(2)} m
        </span>
      </div>

      <div style={sectionLabel}>Geometría</div>
      <div
        style={grid}
        className="basestats-grid"
      >
        <Metric label="Radio base" value={fmt(result.baseRadius)} unit="m" hint={`⌀ ${fmt(result.baseRadius * 2)} m`} />
        <Metric label="Altura cúpula" value={fmt(result.domeHeight)} unit="m" />
        <Metric label="Perímetro base" value={fmt(result.basePerimeter)} unit="m" />
        <Metric label="Área base" value={fmt(result.baseArea)} unit="m²" />
      </div>

      <div style={{ borderTop: '1px solid var(--glass-border)', margin: '1.25rem 0' }} />

      <div style={sectionLabel}>Cobertura y materiales</div>
      <div style={grid} className="basestats-grid">
        <Metric label="Área cobertura" value={fmt(result.coverArea)} unit="m²" hint="superficie esférica" />
        <Metric label="Listones" value={String(result.totalBeams)} unit="uds" />
        <Metric label="Metros lineales" value={fmt(result.totalLinearMeters, 1)} unit="m" />
        <Metric
          label="Volumen madera"
          value={fmt(result.totalWoodVolume, 3)}
          unit="m³"
          hint={`${config.beamWidth} × ${config.beamThickness} mm`}
        />
      </div>

      <style>{`
        @media (min-width: 640px) {
          .basestats-grid { grid-template-columns: repeat(4, 1fr); }
        }
      `}</style>
    </div>
  );
}
