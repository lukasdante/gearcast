/** "Field photo" (1600×1200): P-101A drive-end bearing (6309) exposed with the end cover off — spalled outer
 *  raceway, heat tint, dirty grease — a gloved finger pointing at the damage, shop floor behind. */
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { GloveFinger, PhotoDefs, PhotoFinish } from './photoKit';

const P = 'wb';
const W = 1600, H = 1200;
const CX = 760, CY = 610;

/** Annular sector (degrees, clockwise from +x) as a polygon path. */
function sector(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  const pts: string[] = [];
  for (let i = 0; i <= 40; i++) { const a = (a0 + (a1 - a0) * i / 40) * Math.PI / 180; pts.push(`${cx + Math.cos(a) * r1} ${cy + Math.sin(a) * r1}`); }
  for (let i = 40; i >= 0; i--) { const a = (a0 + (a1 - a0) * i / 40) * Math.PI / 180; pts.push(`${cx + Math.cos(a) * r0} ${cy + Math.sin(a) * r0}`); }
  return `M${pts.join(' L')} Z`;
}

function seeded(n: number) { let s = n; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

export function WornBearing() {
  const rnd = seeded(42);
  const pits = Array.from({ length: 70 }, () => {
    const a = (-10 + rnd() * 70) * Math.PI / 180; const r = 262 + rnd() * 30;
    return { x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r, r: 1.5 + rnd() * 5, o: 0.4 + rnd() * 0.5 };
  });
  const balls = Array.from({ length: 9 }, (_, i) => i * 40 + 8);
  return (
    <AbsoluteFill style={{ background: '#222' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <PhotoDefs p={P} />
        {/* background: wall, pipe rack, yellow rail, floor — out of focus */}
        <g filter={`url(#${P}-dof)`}>
          <rect width={W} height={H} fill={`url(#${P}-wall)`} />
          <rect y={140} width={W} height={46} fill="#6f8a7a" />
          <rect y={150} width={W} height={10} fill="#9fb6a8" opacity={0.5} />
          <rect y={240} width={W} height={30} fill="#7d8b93" />
          <rect x={1180} y={0} width={60} height={760} fill="#8d9aa2" />
          <rect x={1320} y={0} width={34} height={760} fill="#c49a2c" />
          <rect x={1240} y={420} width={360} height={26} fill="#e0b532" />
          <rect x={1240} y={560} width={360} height={22} fill="#e0b532" />
          <rect y={760} width={W} height={H - 760} fill={`url(#${P}-floor)`} />
          <ellipse cx={1250} cy={980} rx={260} ry={40} fill="#8f8d86" opacity={0.35} />
          <rect x={60} y={300} width={240} height={180} rx={10} fill="#3e5060" />
          <rect x={90} y={330} width={120} height={18} fill="#c9d3da" opacity={0.6} />
        </g>
        {/* bearing bracket casting (painted) */}
        <path d={`M120 1200 L 160 300 C 180 210, 300 170, 420 180 L 1100 220 C 1210 230, 1280 300, 1290 420 L 1300 1200 Z`}
          fill={`url(#${P}-paint)`} />
        <path d="M160 300 C 180 210, 300 170, 420 180 L 1100 220" stroke="#5f7fa6" strokeWidth={6} fill="none" opacity={0.6} />
        {/* worn paint / rust streaks on the casting */}
        <g filter={`url(#${P}-rough)`} opacity={0.75}>
          <path d="M260 900 C 300 980, 290 1080, 320 1200 L 360 1200 C 330 1080, 340 980, 300 890 Z" fill="#7a4a24" opacity={0.55} />
          <path d="M1180 820 C 1200 900, 1190 1000, 1220 1200 L 1250 1200 C 1230 1000, 1240 900, 1210 810 Z" fill="#6b3f1e" opacity={0.5} />
          <circle cx={240} cy={420} r={34} fill="#8a5a30" opacity={0.4} />
        </g>
        {/* bolt holes of the removed end cover */}
        {[0, 60, 120, 180, 240, 300].map(a => {
          const r = 395, x = CX + Math.cos((a + 30) * Math.PI / 180) * r, y = CY + Math.sin((a + 30) * Math.PI / 180) * r;
          return <g key={a}><circle cx={x} cy={y} r={24} fill="#121820" /><circle cx={x} cy={y} r={24} fill="none" stroke="#7d93ad" strokeWidth={3} /></g>;
        })}
        {/* housing bore */}
        <circle cx={CX} cy={CY} r={350} fill="#1a2230" />
        <circle cx={CX} cy={CY} r={350} fill="none" stroke="#8796a6" strokeWidth={8} />
        <circle cx={CX} cy={CY} r={336} fill="none" stroke="#2c3644" strokeWidth={14} />
        {/* old grease packed in the housing */}
        <path d={`M${CX - 330} ${CY + 60} C ${CX - 300} ${CY + 260}, ${CX - 120} ${CY + 350}, ${CX + 60} ${CY + 330} C ${CX - 80} ${CY + 300}, ${CX - 260} ${CY + 220}, ${CX - 330} ${CY + 60} Z`} fill="#6b5131" />
        <path d={`M${CX - 310} ${CY + 90} C ${CX - 270} ${CY + 230}, ${CX - 150} ${CY + 300}, ${CX - 20} ${CY + 312}`} stroke="#9c7a48" strokeWidth={10} fill="none" opacity={0.7} strokeLinecap="round" />
        {/* outer race */}
        <circle cx={CX} cy={CY} r={318} fill={`url(#${P}-steel)`} />
        <circle cx={CX} cy={CY} r={318} fill="none" stroke="#5b636b" strokeWidth={3} />
        {/* heat tint (straw → blue) on the loaded zone of the race face */}
        <g style={{ mixBlendMode: 'multiply' }} filter={`url(#${P}-soft)`}>
          {Array.from({ length: 26 }, (_, i) => { const a = (-30 + i * 4) * Math.PI / 180; return <circle key={i} cx={CX + Math.cos(a) * 290} cy={CY + Math.sin(a) * 290} r={24} fill="#d09040" opacity={0.16} />; })}
          {Array.from({ length: 12 }, (_, i) => { const a = (2 + i * 4) * Math.PI / 180; return <circle key={i} cx={CX + Math.cos(a) * 292} cy={CY + Math.sin(a) * 292} r={20} fill="#5a6fc0" opacity={0.16} />; })}
        </g>
        {/* raceway groove */}
        <circle cx={CX} cy={CY} r={262} fill="#5f676f" />
        <circle cx={CX} cy={CY} r={262} fill="none" stroke="#c9ced3" strokeWidth={4} opacity={0.6} />
        {/* engraving on the outer race face */}
        <text x={CX} y={CY - 282} textAnchor="middle" fill="#3b4148" opacity={0.75} style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 22, letterSpacing: '0.3em' }}>6309 · 2Z</text>
        {/* spalling: flaked pits on the raceway at ~4 o'clock */}
        <g filter={`url(#${P}-rough)`}>
          <path d={`M${CX + 262} ${CY - 20} C ${CX + 292} ${CY + 50}, ${CX + 280} ${CY + 140}, ${CX + 226} ${CY + 196} C ${CX + 196} ${CY + 172}, ${CX + 224} ${CY + 96}, ${CX + 236} ${CY + 10} Z`} fill="#2a2420" />
          <path d={`M${CX + 258} ${CY - 6} C ${CX + 282} ${CY + 56}, ${CX + 270} ${CY + 132}, ${CX + 228} ${CY + 180}`} stroke="#b9b2a6" strokeWidth={3} fill="none" opacity={0.55} />
          <path d={`M${CX + 236} ${CY + 52} C ${CX + 254} ${CY + 80}, ${CX + 246} ${CY + 118}, ${CX + 222} ${CY + 148}`} stroke="#8f8a82" strokeWidth={4} fill="none" opacity={0.6} />
        </g>
        {pits.map((q, i) => <circle key={i} cx={q.x} cy={q.y} r={q.r} fill="#2b2622" opacity={q.o} />)}
        {/* cage + balls */}
        <circle cx={CX} cy={CY} r={212} fill="none" stroke="#a0763a" strokeWidth={30} />
        <circle cx={CX} cy={CY} r={212} fill="none" stroke="#6d4c22" strokeWidth={4} opacity={0.6} />
        {balls.map((a, i) => {
          const x = CX + Math.cos(a * Math.PI / 180) * 212, y = CY + Math.sin(a * Math.PI / 180) * 212;
          const worn = i === 1;
          return (
            <g key={a}>
              <circle cx={x} cy={y} r={44} fill={`url(#${P}-ball)`} />
              {worn && <circle cx={x} cy={y} r={44} fill="#5a4630" opacity={0.55} />}
              {worn && <ellipse cx={x + 10} cy={y + 8} rx={18} ry={10} fill="#2a2420" opacity={0.6} transform={`rotate(40 ${x} ${y})`} />}
              <ellipse cx={x - 14} cy={y - 16} rx={10} ry={6} fill="#fff" opacity={worn ? 0.3 : 0.75} />
            </g>
          );
        })}
        {/* dirty grease smeared on balls / cage (lower left) */}
        <g filter={`url(#${P}-soft)`} opacity={0.82}>
        {Array.from({ length: 60 }, (_, i) => {
          const a = (102 + rnd() * 58) * Math.PI / 180, r = 190 + rnd() * 100;
          return <ellipse key={i} cx={CX + Math.cos(a) * r} cy={CY + Math.sin(a) * r} rx={14 + rnd() * 26} ry={10 + rnd() * 16}
            transform={`rotate(${(a * 180) / Math.PI + 90} ${CX + Math.cos(a) * r} ${CY + Math.sin(a) * r})`}
            fill={i % 3 ? '#5e4526' : '#7a5a30'} />;
        })}
        </g>
        {/* inner race + shaft */}
        <circle cx={CX} cy={CY} r={160} fill={`url(#${P}-steel)`} />
        <circle cx={CX} cy={CY} r={160} fill="none" stroke="#5b636b" strokeWidth={3} />
        <circle cx={CX} cy={CY} r={118} fill={`url(#${P}-steelDark)`} />
        <circle cx={CX} cy={CY} r={104} fill="none" stroke="#9aa2aa" strokeWidth={3} opacity={0.6} />
        <rect x={CX - 14} y={CY - 118} width={28} height={40} fill="#2a2f35" />
        <circle cx={CX} cy={CY} r={22} fill="#2a2f35" />
        {/* rust bloom on the shaft end */}
        <g filter={`url(#${P}-rough)`}><circle cx={CX + 40} cy={CY + 50} r={34} fill="#8a4f22" opacity={0.45} /></g>
        {/* metal debris flakes in the grease */}
        {Array.from({ length: 26 }, (_, i) => {
          const x = CX - 270 + rnd() * 260, y = CY + 140 + rnd() * 130;
          return <rect key={i} x={x} y={y} width={3 + rnd() * 6} height={2 + rnd() * 3} fill="#d9dde0" opacity={0.75} transform={`rotate(${rnd() * 180} ${x} ${y})`} />;
        })}
        {/* SS316 asset tag riveted on the bracket top */}
        <g transform="translate(940 236) rotate(3)">
          <rect width={250} height={86} rx={8} fill="#c5cbd0" />
          <rect width={250} height={86} rx={8} fill="none" stroke="#868e95" strokeWidth={2} />
          <rect x={12} y={12} width={62} height={62} fill="#2b3036" />
          <rect x={20} y={20} width={20} height={20} fill="#c5cbd0" /><rect x={46} y={20} width={20} height={20} fill="#c5cbd0" /><rect x={20} y={46} width={20} height={20} fill="#c5cbd0" />
          <text x={88} y={44} fill="#2b3036" style={{ fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 28 }}>P-101A</text>
          <text x={88} y={68} fill="#4b535b" style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 14 }}>GearCast · scan</text>
          <circle cx={238} cy={14} r={5} fill="#7c848b" /><circle cx={238} cy={72} r={5} fill="#7c848b" />
        </g>
        {/* gloved finger pointing at the spall */}
        <g transform={`translate(${CX + 285} ${CY + 150}) rotate(32)`}>
          <ellipse cx={330} cy={140} rx={340} ry={70} fill="#000" opacity={0.3} filter={`url(#${P}-dof)`} />
          <GloveFinger p={P} />
        </g>
        <PhotoFinish p={P} w={W} h={H} grain={0.09} />
      </svg>
    </AbsoluteFill>
  );
}
