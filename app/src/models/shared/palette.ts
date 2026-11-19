/** Restrained digital-twin palette (sRGB hex). Mirrors models-src/lib.py PALETTE for runtime-made parts. */
export const C = {
  pump: '#4d667b',      // slate steel-blue paint (pumps)
  motor: '#58616b',     // mid charcoal motor paint
  process: '#5f6d78',   // process equipment / tanks
  frame: '#363d44',     // structural steel, baseplates
  steel: '#8e979f',
  stainless: '#c4ccd3',
  galv: '#9aa3a9',
  concrete: '#8f8a82',
  concreteCap: '#a39d94',
  rubber: '#18191c',
  dark: '#0c0f12',
  safety: '#c99a2e',    // handrails, toe boards
  water: '#1d3a40',
  liquor: '#4a3e2c',
  sludge: '#3b3a2c',
} as const;

export const FAULT_RED = '#ff2a1a';
export const AMBER = '#ffb020';
export const HOVER_TINT = '#6f93b8';
export const SELECT_CYAN = '#3fb8ff';
