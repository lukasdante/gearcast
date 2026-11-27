/** Motion-graphics palette: the engine's visual system (src/theme.ts, mirrored from app/src/index.css). */
import { COLORS } from '../../theme';

export { FONT, MONO, CAPTION_SAFE, CAST, ROLE_COLORS } from '../../theme';
export const C = { ...COLORS, faultSoft: '#ff8b8b', maintSoft: '#f4c770' } as const;
export const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-US')}`;
