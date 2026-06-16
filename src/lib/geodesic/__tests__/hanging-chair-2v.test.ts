import { describe, it, expect } from 'vitest';
import { computeDome } from '../dome';
import type { DomeConfig, DomeResult } from '../types';

// =============================================================================
// Caso de validación: silla colgante geodésica 2V (OpenDome)
//
// Ancla los valores geométricos de referencia (ya verificados a mano) para una
// silla colgante hemisférica 2V y comprueba que computeDome() los reproduce.
// Es la primera red de seguridad real del motor: no toca la matemática, solo
// la fija.
//
// Parámetros del caso:
//   Poliedro:   icosaedro, Clase I        (único modo de subdivide())
//   Frecuencia: 2V
//   Porción:    hemisferio (1/2)
//   Radio:      0.5 m  (diámetro 1 m)
//   Conexión:   GoodKarma  -> NOTA: no es un parámetro del motor. "GoodKarma"
//               es solo la etiqueta del estilo de corte en V de la UI
//               (StrutDrawing3D.tsx). No afecta a la geometría calculada.
//   Sección:    45 x 20 mm -> beamWidth/beamThickness; solo afecta volumen.
//   Método:     'kruschke' (en 2V cada tipo tiene un único chord factor, así
//               que 'kruschke' y 'chord' dan idéntico resultado aquí).
//
// Convenio de unidades del motor (auditado):
//   config.radius          en metros
//   strut.length / length  en MILÍMETROS  (chordFactor * radius * 1000)
//   height / baseRadius     en metros
//   chordFactor             adimensional
// =============================================================================

const CONFIG: DomeConfig = {
  frequency: 2,
  radius: 0.5,
  partial: '1/2',
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

describe('Silla colgante 2V — geometría SÓLIDA (debe coincidir exacta)', () => {
  const result = computeDome(CONFIG);

  it('genera exactamente 65 aristas (30 tipo A + 35 tipo B)', () => {
    expect(result.struts.length).toBe(65);
    expect(result.totalBeams).toBe(65);
    expect(typeSummary(result, 'A').count).toBe(30);
    expect(typeSummary(result, 'B').count).toBe(35);
    // Solo deben existir dos tipos en un 2V hemisférico.
    expect(result.strutTypes.map((t) => t.type).sort()).toEqual(['A', 'B']);
  });

  it('factor de cuerda y longitud eje-eje del tipo A', () => {
    const a = typeSummary(result, 'A');
    expect(a.chordFactor).toBeCloseTo(0.54653, 4);
    expect(Math.abs(a.chordFactor - 0.54653)).toBeLessThanOrEqual(TOL_FACTOR);
    // length en mm; referencia 0.27327 m = 273.27 mm
    expect(Math.abs(a.length - 273.27)).toBeLessThanOrEqual(TOL_LEN_MM);
  });

  it('factor de cuerda y longitud eje-eje del tipo B', () => {
    const b = typeSummary(result, 'B');
    expect(b.chordFactor).toBeCloseTo(0.61803, 4);
    expect(Math.abs(b.chordFactor - 0.61803)).toBeLessThanOrEqual(TOL_FACTOR);
    // length en mm; referencia 0.30902 m = 309.02 mm
    expect(Math.abs(b.length - 309.02)).toBeLessThanOrEqual(TOL_LEN_MM);
  });

  it('altura del domo 0.50 m y ancho de base 1.00 m', () => {
    expect(Math.abs(result.domeHeight - 0.5)).toBeLessThanOrEqual(0.0005);
    expect(Math.abs(result.height - 0.5)).toBeLessThanOrEqual(0.0005);
    const baseWidth = result.baseRadius * 2;
    expect(Math.abs(baseWidth - 1.0)).toBeLessThanOrEqual(0.001);
  });

  it('ángulos interiores de los triángulos entre 55.6° y 68.9°', () => {
    const allAngles = result.triangleTypes.flatMap((t) => t.angles);
    expect(allAngles.length).toBeGreaterThan(0);
    for (const ang of allAngles) {
      expect(ang).toBeGreaterThanOrEqual(55.6 - 0.05);
      expect(ang).toBeLessThanOrEqual(68.9 + 0.05);
    }
  });
});

describe('Silla colgante 2V — ángulos DEPENDIENTES DE CONVENIO (comparar y reportar)', () => {
  const result = computeDome(CONFIG);

  // Referencia del brief.
  const EXPECTED = {
    A: { stripBevel: 11.2, axialEnd: 15.86 },
    B: { stripBevel: 9.0, axialEnd: 18.0 },
  } as const;

  // Volcado completo de lo que produce el motor, para reconciliar convenios
  // sin tocar la matemática.
  it('REPORTE: valores de ángulo del motor', () => {
    // eslint-disable-next-line no-console
    console.log('\n=== strutTypes (bisel de tira = tableSawTilt) ===');
    for (const t of result.strutTypes) {
      // eslint-disable-next-line no-console
      console.log(
        `  ${t.type}: tableSawTilt=${t.tableSawTilt}°  dihedral=${t.dihedralAngle}°`
      );
    }
    // eslint-disable-next-line no-console
    console.log('\n=== nodeCuts (miter / bevel / axialAngle por nudo) ===');
    for (const c of result.nodeCuts) {
      // eslint-disable-next-line no-console
      console.log(
        `  ${c.strutType} @ ${c.nodeType}: miter=${c.miter}° bevel=${c.bevel}° axial=${c.axialAngle}° (x${c.quantity})`
      );
    }
    expect(true).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // RECONCILIACIÓN DE CONVENIOS (resultado de la auditoría, no tocar el motor):
  //
  // 1) "Bisel de tira" del brief  ==  strutTypes[].tableSawTilt  -> COINCIDE.
  //
  // 2) "Ángulo axial extremo" del brief (A=15.86°, B=18.00°) es el ángulo
  //    axial geodésico clásico = SEMIÁNGULO CENTRAL = asin(chordFactor/2):
  //        asin(0.54653/2) = 15.863°   asin(0.61803/2) = 18.001°
  //    El motor SÍ lo reproduce (vía su chordFactor exacto), pero NO lo expone
  //    con ese convenio. El campo nodeCuts[].axialAngle del motor es OTRA cosa:
  //        nodeCuts.axialAngle = 90 − miter
  //    derivado de las fórmulas de inglete compuesto de carpintería (joinery en
  //    el plano de cara); da 46–61° y NO equivale al axial del brief.
  //    -> Validamos la cantidad correcta (asin(cf/2)) y dejamos constancia del
  //       choque de nomenclatura. El motor queda intacto.
  // ---------------------------------------------------------------------------
  const RAD2DEG = 180 / Math.PI;
  const axisAngleFromChordFactor = (cf: number) =>
    Math.asin(cf / 2) * RAD2DEG;

  for (const type of ['A', 'B'] as const) {
    it(`tipo ${type}: bisel de tira ≈ ${EXPECTED[type].stripBevel}° (tableSawTilt)`, () => {
      const tilt = typeSummary(result, type).tableSawTilt;
      expect(Math.abs(tilt - EXPECTED[type].stripBevel)).toBeLessThanOrEqual(
        TOL_ANGLE
      );
    });

    it(`tipo ${type}: ángulo axial extremo ≈ ${EXPECTED[type].axialEnd}° (asin(cf/2))`, () => {
      const axisAngle = axisAngleFromChordFactor(typeSummary(result, type).chordFactor);
      expect(Math.abs(axisAngle - EXPECTED[type].axialEnd)).toBeLessThanOrEqual(
        TOL_ANGLE
      );
    });

    it(`tipo ${type}: DOC — nodeCuts.axialAngle usa OTRO convenio (90−miter), no el del brief`, () => {
      const engineAxials = result.nodeCuts
        .filter((c) => c.strutType === type)
        .map((c) => c.axialAngle);
      expect(engineAxials.length).toBeGreaterThan(0);
      // Ninguno de los axialAngle del motor cae cerca del axial del brief:
      // confirma que son convenios distintos, no un bug.
      const matchesBrief = engineAxials.some(
        (a) => Math.abs(a - EXPECTED[type].axialEnd) <= TOL_ANGLE
      );
      expect(matchesBrief).toBe(false);
    });
  }
});
