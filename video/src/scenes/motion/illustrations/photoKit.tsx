/** Shared SVG bits for the "field photo" illustrations: metal gradients, grain, phone-camera vignette, glove. */
import React from 'react';

/** Defs: brushed/turned steel, painted casting, grease, grain, depth-of-field blur. Prefix ids per illustration. */
export function PhotoDefs({ p }: { p: string }) {
  return (
    <defs>
      <linearGradient id={`${p}-steel`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#d9dee3" />
        <stop offset="0.35" stopColor="#9aa3ab" />
        <stop offset="0.55" stopColor="#eef1f4" />
        <stop offset="0.8" stopColor="#7d868f" />
        <stop offset="1" stopColor="#b9c0c7" />
      </linearGradient>
      <linearGradient id={`${p}-steelDark`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#8c949c" />
        <stop offset="0.5" stopColor="#4e555c" />
        <stop offset="1" stopColor="#6f777f" />
      </linearGradient>
      <radialGradient id={`${p}-ball`} cx="35%" cy="30%" r="70%">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.25" stopColor="#d4d9de" />
        <stop offset="0.7" stopColor="#6a7279" />
        <stop offset="1" stopColor="#3b4147" />
      </radialGradient>
      <linearGradient id={`${p}-paint`} x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stopColor="#3f5f86" />
        <stop offset="0.5" stopColor="#2b4566" />
        <stop offset="1" stopColor="#1b2d44" />
      </linearGradient>
      <linearGradient id={`${p}-floor`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#6b6a64" />
        <stop offset="1" stopColor="#3d3c38" />
      </linearGradient>
      <linearGradient id={`${p}-wall`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#53626a" />
        <stop offset="1" stopColor="#2f3a40" />
      </linearGradient>
      <linearGradient id={`${p}-glove`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#3a8fd6" />
        <stop offset="0.6" stopColor="#1f63a8" />
        <stop offset="1" stopColor="#174a80" />
      </linearGradient>
      <radialGradient id={`${p}-vig`} cx="50%" cy="50%" r="72%">
        <stop offset="0.6" stopColor="#000" stopOpacity={0} />
        <stop offset="1" stopColor="#000" stopOpacity={0.55} />
      </radialGradient>
      <filter id={`${p}-dof`} x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation={9} /></filter>
      <filter id={`${p}-soft`} x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation={2.2} /></filter>
      <filter id={`${p}-grain`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={7} result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.9 0" />
      </filter>
      <filter id={`${p}-rough`} x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves={3} seed={3} />
        <feDisplacementMap in="SourceGraphic" scale={14} />
      </filter>
    </defs>
  );
}

/** Grain + vignette + faint warm cast on top of a photo. */
export function PhotoFinish({ p, w, h, grain = 0.07 }: { p: string; w: number; h: number; grain?: number }) {
  return (
    <g pointerEvents="none">
      <rect width={w} height={h} fill="#ffb070" opacity={0.04} />
      <rect width={w} height={h} filter={`url(#${p}-grain)`} opacity={grain} style={{ mixBlendMode: 'overlay' }} />
      <rect width={w} height={h} fill={`url(#${p}-vig)`} />
    </g>
  );
}

/** Blue nitrile gloved hand, index finger extended with its tip at (0,0) pointing toward -x; hand toward +x.
 *  Wrap in translate/rotate to aim it. */
export function GloveFinger({ p }: { p: string }) {
  const edge = '#123f6e';
  return (
    <g>
      {/* cuff + back of hand */}
      <rect x={560} y={-70} width={260} height={270} rx={60} fill="#1a5a98" />
      <rect x={250} y={-80} width={380} height={290} rx={110} fill={`url(#${p}-glove)`} stroke={edge} strokeWidth={3} />
      {/* curled fingers under the pointer */}
      {[0, 1, 2].map(i => (
        <rect key={i} x={200 + i * 14} y={30 + i * 56} width={190} height={66} rx={33} fill={`url(#${p}-glove)`} stroke={edge} strokeWidth={3} />
      ))}
      {/* thumb */}
      <g transform="translate(330 -50) rotate(-28)">
        <rect x={-190} y={-34} width={230} height={68} rx={34} fill={`url(#${p}-glove)`} stroke={edge} strokeWidth={3} />
        <path d="M-150 -14 C -120 -24, -80 -24, -50 -18" stroke="#8fcaf5" strokeWidth={8} fill="none" opacity={0.35} strokeLinecap="round" />
      </g>
      {/* index finger */}
      <rect x={0} y={-36} width={330} height={72} rx={36} fill={`url(#${p}-glove)`} stroke={edge} strokeWidth={3} />
      <path d="M26 -20 C 90 -30, 200 -30, 300 -24" stroke="#9ad2f8" strokeWidth={9} fill="none" opacity={0.4} strokeLinecap="round" />
      <path d="M110 -30 C 104 -10, 104 10, 110 30" stroke={edge} strokeWidth={4} fill="none" opacity={0.55} />
      <path d="M205 -32 C 198 -10, 198 12, 205 32" stroke={edge} strokeWidth={4} fill="none" opacity={0.55} />
      <ellipse cx={30} cy={-6} rx={18} ry={14} fill="#7fc1f2" opacity={0.25} />
      {/* wrinkles on the back of the hand */}
      <path d="M380 -40 C 420 -10, 440 40, 430 100" stroke={edge} strokeWidth={4} fill="none" opacity={0.35} />
      <path d="M470 -50 C 510 -10, 520 50, 500 120" stroke={edge} strokeWidth={4} fill="none" opacity={0.3} />
    </g>
  );
}
