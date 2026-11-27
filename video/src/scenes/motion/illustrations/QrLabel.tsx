/** P-101A asset tag (1400×1000): SS316 laser-etched plate riveted on the painted bearing bracket. The QR is real
 *  (qrcode, ECC Q) and encodes https://gearcast.engrlouis.dev/asset/P-101A — see qrP101A.json. */
import React from 'react';
import { AbsoluteFill } from 'remotion';
import qr from './qrP101A.json';
import { PhotoDefs, PhotoFinish } from './photoKit';

const P = 'qr';
const W = 1400, H = 1000;

export function QrLabel() {
  const n = qr.size, quiet = 4, mod = 13;
  const qrPx = (n + quiet * 2) * mod;
  const tagX = 200, tagY = 180, tagW = 1000, tagH = 640;
  const qx = tagX + 40, qy = tagY + (tagH - qrPx) / 2;
  const lines = Array.from({ length: 160 }, (_, i) => ({ y: tagY + 4 + i * 4, o: ((i * 7919) % 13) / 13 }));
  return (
    <AbsoluteFill style={{ background: '#1b2d44' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <PhotoDefs p={P} />
        <defs>
          <linearGradient id="qr-ss" x1="0" y1="0" x2="1" y2="0.6">
            <stop offset="0" stopColor="#cfd5da" />
            <stop offset="0.45" stopColor="#e7ebee" />
            <stop offset="0.7" stopColor="#c3cacf" />
            <stop offset="1" stopColor="#d8dde1" />
          </linearGradient>
          <clipPath id="qr-tagclip"><rect x={tagX} y={tagY} width={tagW} height={tagH} rx={26} /></clipPath>
        </defs>
        {/* painted casting behind */}
        <rect width={W} height={H} fill={`url(#${P}-paint)`} />
        <g filter={`url(#${P}-dof)`} opacity={0.8}>
          <path d="M0 880 C 400 840, 1000 860, 1400 900 L 1400 1000 L 0 1000 Z" fill="#14233a" />
          <path d="M0 120 C 500 90, 900 100, 1400 130" stroke="#5f7fa6" strokeWidth={14} fill="none" opacity={0.5} />
          <circle cx={120} cy={500} r={60} fill="#6b3f1e" opacity={0.35} />
        </g>
        {/* tag shadow + plate */}
        <rect x={tagX + 10} y={tagY + 18} width={tagW} height={tagH} rx={26} fill="#000" opacity={0.45} filter={`url(#${P}-soft)`} />
        <rect x={tagX} y={tagY} width={tagW} height={tagH} rx={26} fill="url(#qr-ss)" />
        <g clipPath="url(#qr-tagclip)">
          {lines.map((l, i) => <rect key={i} x={tagX} y={l.y} width={tagW} height={1.4} fill={l.o > 0.5 ? '#ffffff' : '#9aa3aa'} opacity={0.12 + 0.1 * l.o} />)}
          <path d={`M${tagX} ${tagY} L ${tagX + 420} ${tagY} L ${tagX + 160} ${tagY + tagH} L ${tagX} ${tagY + tagH} Z`} fill="#fff" opacity={0.12} />
        </g>
        <rect x={tagX} y={tagY} width={tagW} height={tagH} rx={26} fill="none" stroke="#8b949b" strokeWidth={3} />
        <rect x={tagX + 8} y={tagY + 8} width={tagW - 16} height={tagH - 16} rx={20} fill="none" stroke="#f7f9fa" strokeWidth={2} opacity={0.6} />
        {/* rivets */}
        {[[tagX + 36, tagY + 36], [tagX + tagW - 36, tagY + 36], [tagX + 36, tagY + tagH - 36], [tagX + tagW - 36, tagY + tagH - 36]].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={15} fill="#7f878e" />
            <circle cx={x} cy={y} r={15} fill={`url(#${P}-ball)`} opacity={0.8} />
          </g>
        ))}
        {/* QR (etched modules; quiet zone is the plate itself) */}
        <g transform={`translate(${qx + quiet * mod} ${qy + quiet * mod})`}>
          {qr.rows.map((row, y) => row.split('').map((b, x) => (b === '1'
            ? <rect key={`${x}-${y}`} x={x * mod} y={y * mod} width={mod + 0.6} height={mod + 0.6} fill="#1f2428" />
            : null)))}
        </g>
        {/* etched text */}
        <g transform={`translate(${qx + qrPx + 20} ${tagY + 150})`} fill="#1f2428">
          <text style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 26 }}>
            <tspan>Gear</tspan><tspan style={{ fontWeight: 800 }}>Cast</tspan><tspan fill="#4a5258" style={{ fontWeight: 500 }}> · scan for history</tspan>
          </text>
          <text y={118} style={{ fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 96, letterSpacing: '-0.02em' }}>P-101A</text>
          <text y={176} fill="#2f363b" style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 27 }}>EQ transfer pump A</text>
          <text y={214} fill="#4a5258" style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: 23 }}>KSB Sewatec K 080-250</text>
          <line x1={0} x2={380} y1={252} y2={252} stroke="#4a5258" strokeWidth={2} />
          <text y={292} fill="#3a4146" style={{ fontFamily: 'JetBrains Mono', fontWeight: 500, fontSize: 22 }}>QR-P-101A · W05</text>
          <text y={326} fill="#3a4146" style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: 21 }}>EQ transfer pumping · SS316</text>
        </g>
        <PhotoFinish p={P} w={W} h={H} grain={0.05} />
      </svg>
    </AbsoluteFill>
  );
}
