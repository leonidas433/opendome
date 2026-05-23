// src/constants/strutColors.ts

/** Color hex por tipo de listón. Fuente única de verdad para toda la app.
 *  Importar desde aquí en DomeCalculator, DomeViewer, SierraAngulos,
 *  StrutList, StrutDrawing3D y cualquier componente que pinte por tipo. */
export const STRUT_COLORS_HEX: Record<string, string> = {
  A: '#10b981', // emerald  — principal
  B: '#f59e0b', // amber
  C: '#8b5cf6', // violet
  D: '#06b6d4', // cyan
  E: '#f43f5e', // rose
  F: '#3db8b0', // teal
} as const;

/** Mismos colores en formato numérico para Three.js */
export const STRUT_COLORS_THREE: Record<string, number> = {
  A: 0x10b981,
  B: 0xf59e0b,
  C: 0x8b5cf6,
  D: 0x06b6d4,
  E: 0xf43f5e,
  F: 0x3db8b0,
} as const;

export const STRUT_COLOR_FALLBACK_HEX = '#64748b';
export const STRUT_COLOR_FALLBACK_THREE = 0x64748b;
