/** Stylised flat avatars for the cast (no photoreal faces): bust, uniform, hair, hard hat, simple features. */
import React from 'react';

type Hair = 'short' | 'side' | 'ponytail' | 'buzz' | 'wavy';
export type AvatarSpec = {
  skin: string; hair: string; hairStyle: Hair; uniform: string; collar: string;
  hat?: string; glasses?: boolean; beard?: boolean; bg: string;
};

export const AVATARS: Record<'lemuel' | 'jun' | 'mia' | 'ken' | 'rico', AvatarSpec> = {
  lemuel: { skin: '#c98d62', hair: '#1d1a18', hairStyle: 'side', uniform: '#3a3f4a', collar: '#e9e4da', bg: '#f2b53b' },
  jun: { skin: '#e0ad84', hair: '#16181c', hairStyle: 'short', uniform: '#2b4a78', collar: '#dfe7f3', hat: '#f4f6f8', glasses: true, bg: '#4b9dff' },
  mia: { skin: '#d79c74', hair: '#2a1c16', hairStyle: 'ponytail', uniform: '#1f6b4a', collar: '#f2b53b', hat: '#f2b53b', bg: '#3ccf73' },
  ken: { skin: '#b97d56', hair: '#141414', hairStyle: 'buzz', uniform: '#245c48', collar: '#f2b53b', hat: '#f2b53b', bg: '#3ccf73' },
  rico: { skin: '#9e6a48', hair: '#1a1513', hairStyle: 'wavy', uniform: '#2a5f50', collar: '#f2b53b', hat: '#f2b53b', beard: true, bg: '#3ccf73' },
};

const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
};

/** Round avatar, `size` px. `blink` 0..1 closes the eyes (for a tiny idle life). */
export function Avatar({ spec, size = 160, blink = 0, id }: { spec: AvatarSpec; size?: number; blink?: number; id: string }) {
  const s = spec;
  const eyeRy = 4.2 * (1 - 0.9 * blink);
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} style={{ display: 'block' }}>
      <defs>
        <clipPath id={`av-${id}`}><circle cx={100} cy={100} r={100} /></clipPath>
        <radialGradient id={`avbg-${id}`} cx="50%" cy="30%" r="80%">
          <stop offset="0" stopColor={s.bg} stopOpacity={0.55} />
          <stop offset="1" stopColor={s.bg} stopOpacity={0.12} />
        </radialGradient>
      </defs>
      <g clipPath={`url(#av-${id})`}>
        <rect width={200} height={200} fill="#121821" />
        <rect width={200} height={200} fill={`url(#avbg-${id})`} />
        {/* ponytail behind the head */}
        {s.hairStyle === 'ponytail' && <path d="M128 78 C150 90 152 128 136 150 C128 132 124 112 120 96 Z" fill={s.hair} />}
        {/* shoulders */}
        <path d="M22 210 C24 162 56 142 100 142 C144 142 176 162 178 210 Z" fill={s.uniform} />
        <path d="M22 210 C24 162 56 142 100 142 C144 142 176 162 178 210 Z" fill="none" stroke={shade(s.uniform, 0.7)} strokeWidth={2} />
        {/* neck */}
        <path d="M86 118 H114 V148 C108 156 92 156 86 148 Z" fill={shade(s.skin, 0.86)} />
        {/* collar / reflective strip */}
        <path d="M76 146 L100 170 L124 146 L132 150 L100 182 L68 150 Z" fill={s.collar} />
        {s.collar === '#f2b53b' && <rect x={30} y={186} width={140} height={8} fill="#e8edf2" opacity={0.75} />}
        {/* ears */}
        <ellipse cx={65} cy={96} rx={7} ry={10} fill={shade(s.skin, 0.92)} />
        <ellipse cx={135} cy={96} rx={7} ry={10} fill={shade(s.skin, 0.92)} />
        {/* head */}
        <ellipse cx={100} cy={92} rx={35} ry={41} fill={s.skin} />
        {/* hair */}
        {s.hairStyle === 'side' && <path d="M64 92 C60 58 82 46 104 48 C126 50 140 64 136 92 C132 76 120 66 98 68 C84 70 74 64 64 92 Z" fill={s.hair} />}
        {s.hairStyle === 'short' && <path d="M66 86 C64 60 84 50 100 50 C118 50 136 60 134 86 C126 72 112 66 100 66 C88 66 74 72 66 86 Z" fill={s.hair} />}
        {s.hairStyle === 'ponytail' && <path d="M64 96 C58 62 80 48 102 48 C126 48 142 66 136 96 C128 76 116 68 104 66 C92 72 76 78 64 96 Z" fill={s.hair} />}
        {s.hairStyle === 'buzz' && <path d="M67 82 C68 62 84 52 100 52 C116 52 132 62 133 82 C122 70 78 70 67 82 Z" fill={s.hair} opacity={0.9} />}
        {s.hairStyle === 'wavy' && <path d="M64 90 C58 60 78 46 100 46 C124 46 142 60 136 90 C130 78 124 70 114 70 C108 74 100 70 94 72 C86 68 76 74 64 90 Z" fill={s.hair} />}
        {/* hard hat */}
        {s.hat && (
          <g>
            <path d="M60 74 C60 42 80 30 100 30 C120 30 140 42 140 74 Z" fill={s.hat} />
            <path d="M94 31 H106 V74 H94 Z" fill={shade(s.hat, 0.88)} />
            <rect x={52} y={70} width={96} height={10} rx={5} fill={shade(s.hat, 0.85)} />
            <path d="M70 52 C74 42 84 36 92 35" stroke="#fff" strokeWidth={4} strokeLinecap="round" fill="none" opacity={0.35} />
          </g>
        )}
        {/* brows + eyes */}
        <path d="M78 84 Q86 80 93 84" stroke={shade(s.hair, 1.4)} strokeWidth={3.2} strokeLinecap="round" fill="none" />
        <path d="M107 84 Q114 80 122 84" stroke={shade(s.hair, 1.4)} strokeWidth={3.2} strokeLinecap="round" fill="none" />
        <ellipse cx={86} cy={96} rx={3.8} ry={eyeRy} fill="#1b1512" />
        <ellipse cx={114} cy={96} rx={3.8} ry={eyeRy} fill="#1b1512" />
        {s.glasses && (
          <g fill="none" stroke="#222831" strokeWidth={3}>
            <rect x={73} y={86} width={24} height={19} rx={6} />
            <rect x={103} y={86} width={24} height={19} rx={6} />
            <path d="M97 94 H103" />
          </g>
        )}
        {/* nose hint + smile */}
        <path d="M100 100 Q97 110 101 112" stroke={shade(s.skin, 0.75)} strokeWidth={2.4} strokeLinecap="round" fill="none" />
        {s.beard && <path d="M70 104 C72 128 86 136 100 136 C114 136 128 128 130 104 C124 120 112 124 100 124 C88 124 76 120 70 104 Z" fill={s.hair} opacity={0.85} />}
        <path d="M89 118 Q100 126 111 118" stroke={s.beard ? '#e9d7c8' : shade(s.skin, 0.6)} strokeWidth={3} strokeLinecap="round" fill="none" />
        <ellipse cx={78} cy={110} rx={6} ry={3.5} fill="#e0705a" opacity={0.18} />
        <ellipse cx={122} cy={110} rx={6} ry={3.5} fill="#e0705a" opacity={0.18} />
      </g>
      <circle cx={100} cy={100} r={98} fill="none" stroke={s.bg} strokeWidth={4} opacity={0.9} />
    </svg>
  );
}
