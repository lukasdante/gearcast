/** Tablet PM photos (1600×1200) for Ken's follow-up PM on P-101A:
 *  1 — bearing housing just greased (grease gun coupler on the nipple, fresh bead, wiped casting);
 *  2 — vibration pen held on the DE bearing housing reading 2.1 mm/s RMS (below the 2.8 mm/s "good" line). */
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { GloveFinger, PhotoDefs, PhotoFinish } from './photoKit';

const W = 1600, H = 1200;

function Backdrop({ p }: { p: string }) {
  return (
    <g filter={`url(#${p}-dof)`}>
      <rect width={W} height={H} fill={`url(#${p}-wall)`} />
      <rect y={200} width={W} height={40} fill="#6f8a7a" />
      <rect x={1300} width={46} height={800} fill="#8d9aa2" />
      <rect y={820} width={W} height={H - 820} fill={`url(#${p}-floor)`} />
      <rect x={80} y={380} width={300} height={170} rx={12} fill="#41525f" />
    </g>
  );
}

/** Painted bearing-housing casting filling most of the frame. */
function Housing({ p }: { p: string }) {
  return (
    <g>
      <path d="M140 1200 C 120 900, 150 520, 300 360 C 420 240, 620 200, 860 210 C 1120 220, 1330 330, 1420 560 C 1480 720, 1470 980, 1450 1200 Z" fill={`url(#${p}-paint)`} />
      <path d="M300 360 C 420 240, 620 200, 860 210 C 1120 220, 1330 330, 1420 560" stroke="#6d8db3" strokeWidth={8} fill="none" opacity={0.55} />
      <path d="M260 1200 C 250 900, 280 640, 400 500" stroke="#132238" strokeWidth={40} fill="none" opacity={0.35} />
      {/* cast rib */}
      <path d="M760 220 C 770 500, 780 800, 790 1200" stroke="#1c3049" strokeWidth={60} fill="none" opacity={0.5} />
      <path d="M735 220 C 745 500, 755 800, 765 1200" stroke="#5a7aa1" strokeWidth={6} fill="none" opacity={0.4} />
      {/* bearing end cover with bolt circle, lower left */}
      <circle cx={420} cy={860} r={250} fill="#2c4566" stroke="#5f7fa6" strokeWidth={5} />
      <circle cx={420} cy={860} r={190} fill="#26405f" stroke="#18293f" strokeWidth={8} />
      <circle cx={420} cy={860} r={96} fill={`url(#${p}-steelDark)`} />
      <circle cx={420} cy={860} r={60} fill={`url(#${p}-steel)`} />
      {[0, 60, 120, 180, 240, 300].map(a => {
        const x = 420 + Math.cos((a + 15) * Math.PI / 180) * 222, y = 860 + Math.sin((a + 15) * Math.PI / 180) * 222;
        return <g key={a}><polygon points={[0, 60, 120, 180, 240, 300].map(b => `${x + Math.cos(b * Math.PI / 180) * 20},${y + Math.sin(b * Math.PI / 180) * 20}`).join(' ')} fill={`url(#${p}-steel)`} stroke="#4e555c" strokeWidth={2} /><circle cx={x} cy={y} r={8} fill="#6f777f" /></g>;
      })}
    </g>
  );
}

export function PmFindings1() {
  const p = 'pm1';
  return (
    <AbsoluteFill style={{ background: '#222' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <PhotoDefs p={p} />
        <Backdrop p={p} />
        <Housing p={p} />
        {/* wiped area around the nipple */}
        <ellipse cx={980} cy={560} rx={230} ry={170} fill="#456891" opacity={0.45} />
        {/* boss + grease nipple */}
        <ellipse cx={980} cy={600} rx={120} ry={60} fill="#2a4466" />
        <ellipse cx={980} cy={590} rx={110} ry={52} fill="#3c5f88" />
        <path d="M925 590 L 925 520 L 1035 520 L 1035 590 Z" fill="#b8892e" />
        <path d="M925 520 L 955 500 L 1005 500 L 1035 520 Z" fill="#e0b450" />
        <rect x={952} y={520} width={8} height={70} fill="#f0cf7a" opacity={0.6} />
        <rect x={958} y={440} width={44} height={66} rx={6} fill="#c79a3a" />
        <ellipse cx={980} cy={440} rx={26} ry={12} fill="#e8c46a" />
        {/* fresh grease bead squeezing out */}
        <path d="M920 596 C 930 640, 1030 645, 1042 596 C 1060 612, 1040 668, 980 672 C 918 670, 900 620, 920 596 Z" fill="#c8641e" />
        <path d="M934 620 C 960 640, 1000 642, 1030 622" stroke="#f0a060" strokeWidth={8} fill="none" opacity={0.8} strokeLinecap="round" />
        <ellipse cx={1046} cy={680} rx={20} ry={12} fill="#b5571a" />
        {/* grease gun coupler + hose */}
        <g>
          <rect x={950} y={330} width={60} height={120} rx={10} fill={`url(#${p}-steel)`} />
          <rect x={940} y={300} width={80} height={44} rx={8} fill={`url(#${p}-steelDark)`} />
          <path d="M980 300 C 980 200, 1060 120, 1220 90 C 1380 60, 1500 100, 1620 60" stroke="#141414" strokeWidth={40} fill="none" strokeLinecap="round" />
          <path d="M980 300 C 980 200, 1060 120, 1220 90 C 1380 60, 1500 100, 1620 60" stroke="#3a3a3a" strokeWidth={10} fill="none" strokeLinecap="round" opacity={0.7} />
        </g>
        {/* rag on the casting edge */}
        <path d="M200 900 C 300 860, 420 880, 520 940 C 560 1000, 520 1100, 440 1200 L 160 1200 C 150 1080, 160 960, 200 900 Z" fill="#c9c2b2" />
        <path d="M230 940 C 320 920, 420 940, 490 990" stroke="#a89f8c" strokeWidth={8} fill="none" />
        <path d="M260 1040 C 330 1000, 420 1010, 470 1060" stroke="#c8641e" strokeWidth={10} fill="none" opacity={0.6} />
        {/* glove holding the coupler */}
        <g transform="translate(1030 410) rotate(-20) scale(0.9)">
          <GloveFinger p={p} />
        </g>
        <PhotoFinish p={p} w={W} h={H} grain={0.07} />
      </svg>
    </AbsoluteFill>
  );
}

export function PmFindings2() {
  const p = 'pm2';
  return (
    <AbsoluteFill style={{ background: '#222' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <PhotoDefs p={p} />
        <Backdrop p={p} />
        <Housing p={p} />
        {/* vibration pen: body angled from lower right, tip on the housing */}
        <g transform="translate(700 600) rotate(-32)">
          <g transform="translate(250 58) scale(0.82)"><GloveFinger p={p} /></g>
          <rect x={-8} y={-14} width={60} height={28} rx={6} fill={`url(#${p}-steel)`} />
          <rect x={50} y={-46} width={150} height={92} rx={14} fill="#262a2e" />
          <rect x={196} y={-62} width={620} height={124} rx={38} fill="#f2c230" />
          <rect x={196} y={-62} width={620} height={30} rx={20} fill="#ffe27a" opacity={0.55} />
          <rect x={196} y={32} width={620} height={30} rx={20} fill="#b38a12" opacity={0.55} />
          {/* LCD */}
          <rect x={300} y={-44} width={300} height={88} rx={10} fill="#1d2420" />
          <rect x={312} y={-34} width={276} height={68} rx={6} fill="#b9c9a6" />
          <text x={326} y={18} fill="#1d2a1a" style={{ fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 54 }}>2.1</text>
          <text x={448} y={2} fill="#1d2a1a" style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 20 }}>mm/s</text>
          <text x={448} y={24} fill="#1d2a1a" style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 15 }}>RMS · DE</text>
          {/* button + brand strip */}
          <circle cx={680} cy={0} r={26} fill="#2a2e33" />
          <circle cx={680} cy={0} r={18} fill="#3ccf73" opacity={0.85} />
          <text x={740} y={8} fill="#5b4708" style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: 22 }}>VIB</text>
        </g>
        {/* contact point highlight on the housing */}
        <ellipse cx={696} cy={606} rx={30} ry={14} fill="#000" opacity={0.3} />
        <PhotoFinish p={p} w={W} h={H} grain={0.07} />
      </svg>
    </AbsoluteFill>
  );
}
