import type { NodeCut } from '../lib/geodesic/types';

interface Props {
  cut: NodeCut;
  beamWidth: number;
  beamThickness: number;
}

const NODE_LABEL: Record<string, string> = {
  pentagonal: 'PENT',
  hexagonal: 'HEX',
};

const TYPE_COLOR: Record<string, string> = {
  A: 'border-rose-300',
  B: 'border-amber-300',
  C: 'border-emerald-300',
  D: 'border-sky-300',
  E: 'border-violet-300',
};

export default function CutCard({ cut, beamWidth, beamThickness }: Props) {
  const nodeLabel = NODE_LABEL[cut.nodeType] ?? cut.nodeType.slice(0, 4).toUpperCase();
  const code = `${cut.strutType}-${nodeLabel}`;
  const borderColor = TYPE_COLOR[cut.strutType] ?? 'border-slate-300';
  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border-2 bg-white p-5 shadow-sm print:break-inside-avoid ${borderColor}`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-black tracking-tight text-slate-900">
          {code}
        </span>
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {cut.quantity} {cut.quantity === 1 ? 'extremo' : 'extremos'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-slate-50 p-4 text-center">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Inglete
          </div>
          <div className="mt-1 text-4xl font-black tabular-nums text-slate-900">
            {cut.miter.toFixed(1)}°
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 p-4 text-center">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Bisel
          </div>
          <div className="mt-1 text-4xl font-black tabular-nums text-slate-900">
            {cut.bevel.toFixed(1)}°
          </div>
        </div>
      </div>

      <div className="space-y-1 text-xs text-slate-600">
        <p>
          Cara de {beamWidth} mm apoyada en la mesa, eje de la barra contra el
          tope.
        </p>
        <p className="text-[11px] text-slate-500">
          Sección {beamWidth} × {beamThickness} mm.
        </p>
      </div>
    </div>
  );
}
