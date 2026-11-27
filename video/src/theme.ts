/**
 * GearCast visual system for the promo. Palette mirrors app/src/index.css (:root tokens) so the edit reads as the
 * same product as the captured footage. Fonts (Inter + JetBrains Mono) are bundled in public/fonts (see fonts.ts).
 */
export const COLORS = {
  bg: '#0b0f14',
  bg2: '#0e131a',
  panel: '#121821',
  panel2: '#161e29',
  panel3: '#1b2431',
  line: 'rgba(160, 180, 205, 0.12)',
  line2: 'rgba(160, 180, 205, 0.2)',
  text: '#e6ebf2',
  text2: '#a7b2c1',
  text3: '#6f7c8e',
  accent: '#2fd0c1',
  accentDim: 'rgba(47, 208, 193, 0.14)',
  accentGlow: 'rgba(47, 208, 193, 0.35)',
  running: '#3ccf73',
  standby: '#4b9dff',
  maint: '#f2b53b',
  fault: '#f05252',
  stored: '#8b95a3',
  stopped: '#7d8794',
} as const;

export const FONT = "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
export const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export const VIDEO = { width: 1920, height: 1080, fps: 30 } as const;

/** Bottom band reserved for kinetic captions (device shots are laid out above it). */
export const CAPTION_SAFE = 230;
/** Title-safe inset for chips / badges / toasts. */
export const SAFE = { x: 72, y: 56 } as const;

export type Role = 'Supervisor' | 'Engineer' | 'Technician';
export const ROLE_COLORS: Record<Role, string> = {
  Supervisor: '#f2b53b',
  Engineer: '#4b9dff',
  Technician: '#3ccf73',
};

export type Person = { name: string; role: Role; account: string; title?: string };
export const CAST = {
  lemuel: { name: 'Lemuel', role: 'Supervisor', account: 'PS-01', title: 'Plant Supervisor' },
  jun: { name: 'Jun', role: 'Engineer', account: 'EN-01' },
  mia: { name: 'Mia', role: 'Technician', account: 'MT-01' },
  ken: { name: 'Ken', role: 'Technician', account: 'MT-02' },
  rico: { name: 'Rico', role: 'Technician', account: 'MT-03' },
} as const satisfies Record<string, Person>;
export type CastKey = keyof typeof CAST;

export const SHADOW_DEEP = '0 50px 120px rgba(0,0,0,0.55), 0 18px 40px rgba(0,0,0,0.45)';
