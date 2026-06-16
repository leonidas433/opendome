import { describe, it, expect } from 'vitest';
import { computeDome } from './dome';
import type { DomeConfig } from './types';

// =============================================================================
// Validación de strutCuts (corte por extremo de cada listón) en DomeResult.
//
// strutCuts ya lo calculaba cutAngles.ts; dome.ts lo descartaba. Este test
// fija que: (1) hay un registro por listón, (2) los valores son finitos y
// >= 0 y sin redondear, (3) son coherentes con los nodeCuts agrupados.
// =============================================================================

const CONFIG: DomeConfig = {
  frequency: 3,
  radius: 2.2,
  partial: '1/1',
  method: 'kruschke',
  beamWidth: 120,
  beamThickness: 40,
};

describe('strutCuts — corte por pieza expuesto en DomeResult', () => {
  const result = computeDome(CONFIG);

  it('un registro de corte por cada listón', () => {
    expect(result.strutCuts.length).toBe(result.struts.length);
  });

  it('cada strutId existe y los ángulos de ambos extremos son finitos y >= 0', () => {
    const strutIds = new Set(result.struts.map((s) => s.id));
    for (const sc of result.strutCuts) {
      expect(strutIds.has(sc.strutId)).toBe(true);
      for (const end of [sc.cut1, sc.cut2]) {
        expect(Number.isFinite(end.miter)).toBe(true);
        expect(Number.isFinite(end.bevel)).toBe(true);
        expect(end.miter).toBeGreaterThanOrEqual(0);
        expect(end.bevel).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('coherencia con nodeCuts: cada extremo casa con un nodeCut (mismo tipo + nudo, ≤ 1.0°)', () => {
    // tipo de listón por strutId
    const typeById = new Map<number, string>();
    for (const s of result.struts) typeById.set(s.id, s.type);

    const TOL = 1.0; // 0.5 de agrupado + 0.1 de redondeo + margen anti-flaky

    for (const sc of result.strutCuts) {
      const strutType = typeById.get(sc.strutId);
      expect(strutType).toBeDefined();

      for (const end of [sc.cut1, sc.cut2]) {
        const match = result.nodeCuts.find(
          (nc) =>
            nc.strutType === strutType &&
            nc.nodeType === end.node &&
            Math.abs(nc.miter - end.miter) <= TOL &&
            Math.abs(nc.bevel - end.bevel) <= TOL
        );
        expect(
          match,
          `sin nodeCut para strut ${sc.strutId} (${strutType}) @ ${end.node}: miter=${end.miter.toFixed(2)} bevel=${end.bevel.toFixed(2)}`
        ).toBeDefined();
      }
    }
  });
});
