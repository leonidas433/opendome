import type { DomeConfig, Frequency, PartialDome, DomeMethod } from '../lib/geodesic/types';

interface Props {
  config: DomeConfig;
  onChange: (next: DomeConfig) => void;
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--text-caption)',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  color: 'var(--text-muted)',
  marginBottom: '0.5rem',
};

const fieldGroupStyle: React.CSSProperties = { marginBottom: '1.25rem' };

const suffixStyle: React.CSSProperties = {
  position: 'absolute',
  right: '0.75rem',
  top: '50%',
  transform: 'translateY(-50%)',
  fontSize: '0.8125rem',
  fontFamily: 'var(--font-mono)',
  color: 'var(--text-muted)',
  pointerEvents: 'none',
};

export default function InputPanel({ config, onChange }: Props) {
  const update = <K extends keyof DomeConfig>(key: K, value: DomeConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  const updateNumber = <K extends 'radius' | 'beamWidth' | 'beamThickness'>(
    key: K,
    raw: string
  ) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    onChange({ ...config, [key]: parsed });
  };

  return (
    <div
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.5rem',
      }}
    >
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.25rem',
          color: 'var(--text-primary)',
          margin: '0 0 1.25rem',
        }}
      >
        Parámetros
      </h2>

      {/* Frecuencia */}
      <div style={fieldGroupStyle}>
        <label style={labelStyle}>Frecuencia</label>
        <div className="pill-group">
          {([2, 3, 4] as Frequency[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => update('frequency', f)}
              className={`pill-btn${config.frequency === f ? ' active' : ''}`}
              aria-pressed={config.frequency === f}
            >
              {f}V
            </button>
          ))}
        </div>
      </div>

      {/* Radio */}
      <div style={fieldGroupStyle}>
        <label style={labelStyle}>Radio</label>
        <div style={{ position: 'relative' }}>
          <input
            type="number"
            min={1}
            max={20}
            step={0.1}
            value={config.radius}
            onChange={(e) => updateNumber('radius', e.target.value)}
            className="tech-input"
            style={{ paddingRight: '2.25rem' }}
            aria-label="Radio en metros"
          />
          <span style={suffixStyle}>m</span>
        </div>
      </div>

      {/* Fracción de esfera */}
      <div style={fieldGroupStyle}>
        <label style={labelStyle}>Fracción de esfera</label>
        <div className="pill-group">
          {(['1/2', '3/8', '5/8', '7/12'] as PartialDome[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => update('partial', p)}
              className={`pill-btn${config.partial === p ? ' active' : ''}`}
              aria-pressed={config.partial === p}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Método */}
      <div style={fieldGroupStyle}>
        <label style={labelStyle}>Método</label>
        <div className="pill-group">
          {(['kruschke', 'chord'] as DomeMethod[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => update('method', m)}
              className={`pill-btn${config.method === m ? ' active' : ''}`}
              aria-pressed={config.method === m}
            >
              {m === 'kruschke' ? 'Kruschke' : 'Chord'}
            </button>
          ))}
        </div>
      </div>

      {/* Ancho / Grosor listón */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: 0 }}>
        <div>
          <label style={labelStyle}>Ancho listón</label>
          <div style={{ position: 'relative' }}>
            <input
              type="number"
              min={20}
              max={400}
              step={1}
              value={config.beamWidth}
              onChange={(e) => updateNumber('beamWidth', e.target.value)}
              className="tech-input"
              style={{ paddingRight: '2.75rem' }}
              aria-label="Ancho del listón en milímetros"
            />
            <span style={suffixStyle}>mm</span>
          </div>
        </div>
        <div>
          <label style={labelStyle}>Grosor listón</label>
          <div style={{ position: 'relative' }}>
            <input
              type="number"
              min={10}
              max={200}
              step={1}
              value={config.beamThickness}
              onChange={(e) => updateNumber('beamThickness', e.target.value)}
              className="tech-input"
              style={{ paddingRight: '2.75rem' }}
              aria-label="Grosor del listón en milímetros"
            />
            <span style={suffixStyle}>mm</span>
          </div>
        </div>
      </div>
    </div>
  );
}
