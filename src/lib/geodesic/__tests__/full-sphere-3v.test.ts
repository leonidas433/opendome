import { describe, it, expect } from 'vitest';
import { computeDome } from '../dome';
import type { DomeConfig, DomeResult } from '../types';

// =============================================================================
// Caso de validación: 3V esfera completa (OpenDome)
//
// Segundo caso de validación. Ejercita la geometría 3V completa que el 2V no
// cubría: tipo C, nudos hexagonales completos (valencia 6) y pentagonales
// (valencia 5). Es esfera completa a propósito (porción '1/1', sin recorte de
// borde) para que un fallo solo pueda significar un bug real del motor, no un
// desacuerdo sobre cómo se define el recorte. No toca la matemática; la fija.
//
// Parámetros:
//   Poliedro:   icosaedro, Clase I        (único modo de subdivide())
//   Frecuencia: 3V
//   Porción:    esfera completa ('1/1')   (tipada desde el commit ddd8d39)
//   Radio:      1.0 m  (diámetro 2 m)
//   Método:     'kruschke' (en geodesia Clase I cada tipo tiene un único chord
//               factor por grupo; 'kruschke' promedia el grupo).
//
// Convenio de unidades del motor (auditado):
//   config.radius          en metros
//   strut.length / length  en MILÍMETROS  (chordFactor * radius * 1000)
//   height                 en metros
//   chordFactor            adimensional
// =============================================================================

const CONFIG: DomeConfig = {
  frequency: 3,
  radius: 1.0,
  partial: '1/1',
  method: 'kruschke',
  beamWidth: 45,
  beamThickness: 20,
};

// Tolerancias del brief.
const TOL_LEN_MM = 0.5; // longitudes ±0.5 mm
const TOL_FACTOR = 0.0001; // factores de cuerda ±0.0001
const TOL_ANGLE = 0.3; // ángulos dependientes de convenio ±0.3°

function typeSummary(result: DomeResult, type: string) {
  const s = result.strutTypes.find((t) => t.type === type);
  if (!s) throw new Error(`No existe el tipo de listón "${type}" en el resultado`);
  return s;
}

describe('3V esfera completa — geometría SÓLIDA (debe coincidir exacta)', () => {
  const result = computeDome(CONFIG);

  it('topología: 92 vértices, 270 aristas, 180 caras (Euler V−E+F = 2)', () => {
    expect(result.vertices.length).toBe(92);
    expect(result.struts.length).toBe(270);
    expect(result.totalBeams).toBe(270);
    expect(result.faces.length).toBe(180);
    expect(
      result.vertices.length - result.struts.length + result.faces.length
    ).toBe(2);
  });

  it('recuento por tipo: A×60 + B×90 + C×120 = 270', () => {
    expect(typeSummary(result, 'A').count).toBe(60);
    expect(typeSummary(result, 'B').count).toBe(90);
    expect(typeSummary(result, 'C').count).toBe(120);
    expect(result.strutTypes.map((t) => t.type).sort()).toEqual(['A', 'B', 'C']);
    const sum = result.strutTypes.reduce((acc, t) => acc + t.count, 0);
    expect(sum).toBe(270);
  });

  it('factor de cuerda y longitud eje-eje del tipo A', () => {
    const a = typeSummary(result, 'A');
    expect(Math.abs(a.chordFactor - 0.34862)).toBeLessThanOrEqual(TOL_FACTOR);
    // length en mm; referencia 348.62 mm @ R=1m
    expect(Math.abs(a.length - 348.62)).toBeLessThanOrEqual(TOL_LEN_MM);
  });

  it('factor de cuerda y longitud eje-eje del tipo B', () => {
    const b = typeSummary(result, 'B');
    expect(Math.abs(b.chordFactor - 0.40355)).toBeLessThanOrEqual(TOL_FACTOR);
    expect(Math.abs(b.length - 403.55)).toBeLessThanOrEqual(TOL_LEN_MM);
  });

  it('factor de cuerda y longitud eje-eje del tipo C', () => {
    const c = typeSummary(result, 'C');
    expect(Math.abs(c.chordFactor - 0.41241)).toBeLessThanOrEqual(TOL_FACTOR);
    expect(Math.abs(c.length - 412.41)).toBeLessThanOrEqual(TOL_LEN_MM);
  });

  it('nudos: 12 pentagonales (valencia 5) + 80 hexagonales (valencia 6)', () => {
    const pent = result.vertices.filter((v) => v.valence === 5).length;
    const hex = result.vertices.filter((v) => v.valence === 6).length;
    expect(pent).toBe(12);
    expect(hex).toBe(80);
    // Toda la esfera: sin nudos de borde. 12 + 80 = 92.
    expect(pent + hex).toBe(result.vertices.length);
  });

  it('altura = 2.0 m (diámetro; ancla el arreglo del commit ddd8d39)', () => {
    expect(Math.abs(result.height - 2.0)).toBeLessThanOrEqual(0.0005);
    expect(Math.abs(result.domeHeight - 2.0)).toBeLessThanOrEqual(0.0005);
  });

  it('ángulos interiores de los triángulos entre 54.63° y 70.73°', () => {
    const allAngles = result.triangleTypes.flatMap((t) => t.angles);
    expect(allAngles.length).toBeGreaterThan(0);
    for (const ang of allAngles) {
      expect(ang).toBeGreaterThanOrEqual(54.63 - 0.05);
      expect(ang).toBeLessThanOrEqual(70.73 + 0.05);
    }
  });
});

describe('3V esfera completa — ángulos DEPENDIENTES DE CONVENIO (comparar y reportar)', () => {
  const result = computeDome(CONFIG);

  // Referencia del brief: bisel de tira por tipo (tableSawTilt).
  const EXPECTED_TILT = { A: 7.2, B: 6.2, C: 6.8 } as const;

  // Ángulo axial geodésico clásico = semiángulo central = asin(chordFactor/2).
  // Para 3V cae en 10–12°; documentamos que NO equivale a nodeCuts.axialAngle.
  const RAD2DEG = 180 / Math.PI;
  const axisAngleFromChordFactor = (cf: number) => Math.asin(cf / 2) * RAD2DEG;

  it('REPORTE: valores de ángulo del motor', () => {
    // eslint-disable-next-line no-console
    console.log('\n=== 3V strutTypes (bisel de tira = tableSawTilt) ===');
    for (const t of result.strutTypes) {
      // eslint-disable-next-line no-console
      console.log(
        `  ${t.type}: tableSawTilt=${t.tableSawTilt}°  dihedral=${t.dihedralAngle}°  axisGeo(asin cf/2)=${axisAngleFromChordFactor(t.chordFactor).toFixed(2)}°`
      );
    }
    // eslint-disable-next-line no-console
    console.log('\n=== 3V nodeCuts (miter / bevel / axialAngle por nudo) ===');
    for (const c of result.nodeCuts) {
      // eslint-disable-next-line no-console
      console.log(
        `  ${c.strutType} @ ${c.nodeType}: miter=${c.miter}° bevel=${c.bevel}° axial=${c.axialAngle}° (x${c.quantity})`
      );
    }
    expect(true).toBe(true);
  });

  for (const type of ['A', 'B', 'C'] as const) {
    it(`tipo ${type}: bisel de tira ≈ ${EXPECTED_TILT[type]}° (tableSawTilt)`, () => {
      const tilt = typeSummary(result, type).tableSawTilt;
      expect(Math.abs(tilt - EXPECTED_TILT[type])).toBeLessThanOrEqual(TOL_ANGLE);
    });
  }

  // Predicción del brief sobre nodeCuts: miter ~30° en hexagonal, ~36° en
  // pentagonal. Se verifica con tolerancia holgada (es predicción, no verdad
  // de referencia exacta). El motor NO se ajusta si discrepa.
  it('miter por tipo de nudo: ~30° hexagonal, ~36° pentagonal', () => {
    const hexMiters = result.nodeCuts
      .filter((c) => c.nodeType === 'hexagonal')
      .map((c) => c.miter);
    const pentMiters = result.nodeCuts
      .filter((c) => c.nodeType === 'pentagonal')
      .map((c) => c.miter);
    expect(hexMiters.length).toBeGreaterThan(0);
    expect(pentMiters.length).toBeGreaterThan(0);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(Math.abs(avg(hexMiters) - 30)).toBeLessThanOrEqual(3);
    expect(Math.abs(avg(pentMiters) - 36)).toBeLessThanOrEqual(3);
  });

  // Caso DOC (igual que en el 2V): el campo nodeCuts.axialAngle (= 90 − miter,
  // inglete de carpintería) NO cae cerca del axial geodésico (10–12°). Confirma
  // el choque de nomenclatura, anclado en el suite, no oculto.
  it('DOC — nodeCuts.axialAngle (90−miter) NO equivale al axial geodésico (10–12°)', () => {
    const allEngineAxials = result.nodeCuts.map((c) => c.axialAngle);
    const nearGeodesic = allEngineAxials.some((a) => a >= 9 && a <= 13);
    expect(nearGeodesic).toBe(false);
  });
});
