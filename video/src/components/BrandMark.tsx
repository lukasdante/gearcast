import React from 'react';
import { COLORS, FONT } from '../theme';

/** The app's gear mark (from app/src/shell/TopBar.tsx). */
export const GearIcon: React.FC<{ size?: number; color?: string; rotate?: number }> = ({ size = 24, color = COLORS.accent, rotate = 0 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} style={{ transform: `rotate(${rotate}deg)` }}>
    <path
      d="M12 2.5l2 2.6 3.2-.6.6 3.2 2.7 1.9-1.4 3 1.4 3-2.7 1.9-.6 3.2-3.2-.6-2 2.6-2-2.6-3.2.6-.6-3.2L3.5 15.4l1.4-3-1.4-3 2.7-1.9.6-3.2 3.2.6z"
      fill="none"
      stroke={color}
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="3.2" fill={color} />
  </svg>
);

/** "GearCast" lockup: tile + wordmark (Gear regular, Cast bold), like the app's top bar. */
export const BrandMark: React.FC<{ size?: number; rotate?: number }> = ({ size = 28, rotate = 0 }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.34, fontFamily: FONT }}>
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        width: size * 1.55,
        height: size * 1.55,
        borderRadius: size * 0.4,
        background: COLORS.accentDim,
        border: `${Math.max(1, size * 0.05)}px solid rgba(47,208,193,0.3)`,
      }}
    >
      <GearIcon size={size} rotate={rotate} />
    </div>
    <div style={{ fontSize: size * 1.15, letterSpacing: '-0.02em', color: COLORS.text2, fontWeight: 500 }}>
      Gear<b style={{ color: COLORS.text, fontWeight: 800 }}>Cast</b>
    </div>
  </div>
);
