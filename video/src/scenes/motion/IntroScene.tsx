/**
 * Scene 01 — Meet GearCast. Logo reveal on "GearCast", the wastewater line drawn alive on "one platform…",
 * then the cast snaps in on "supervisor" / "engineer" / "technicians".
 */
import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Avatar, AVATARS } from './Avatars';
import { GearCastLogo, MotionDefs, Pipe, clamp, useSpringAt } from './parts';
import { C, FONT, MONO } from './theme';
import { wordTime } from './timing';

const NODES = [
  { x: 260, label: 'Production', sub: 'VCO · DC · CW' },
  { x: 610, label: 'EQ tank', sub: 'W04' },
  { x: 960, label: 'Transfer pumps', sub: 'P-101A / B' },
  { x: 1310, label: 'Treatment', sub: 'W06' },
  { x: 1660, label: 'Discharge', sub: 'W08' },
];

type Member = { key: keyof typeof AVATARS; name: string; acct: string };

export function IntroScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const F = (s: number) => Math.round(s * fps);

  const tGear = wordTime('01', 'gearcast', 0.86);
  const tPlatform = wordTime('01', 'one platform', 2.62);
  const tAlive = wordTime('01', 'alive', 5.54);
  const tSup = wordTime('01', 'supervisor', 6.6);
  const tEng = wordTime('01', 'engineer', 7.6);
  const tTech = wordTime('01', 'technicians', 8.78);

  // logo: draw in, settle, then lift to the top on "one platform"
  const reveal = interpolate(t, [tGear - 0.6, tGear + 0.5], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 0.7, 0.2, 1) });
  const settle = useSpringAt(F(tGear - 0.6), { damping: 11, stiffness: 90 });
  const lift = useSpringAt(F(tPlatform - 0.15), { damping: 18, stiffness: 120 });
  const logoY = interpolate(lift, [0, 1], [460, 112]);
  const logoS = interpolate(lift, [0, 1], [1, 0.52]);
  const sweep = interpolate(t, [tGear + 0.2, tGear + 1.1], [-30, 130], clamp);

  // pipeline draws across, then sinks as the cast arrives
  const draw = interpolate(t, [tPlatform, tPlatform + 2.6], [0, 1], { ...clamp, easing: Easing.bezier(0.4, 0, 0.2, 1) });
  const sink = useSpringAt(F(tSup - 0.45), { damping: 20, stiffness: 110 });
  const pipeY = interpolate(sink, [0, 1], [560, 820]);
  const pipeS = interpolate(sink, [0, 1], [1, 0.72]);
  const alivePulse = frame >= F(tAlive) ? Math.exp(-(frame - F(tAlive)) / 10) : 0;

  // energy lift: residual red from the hook fades into teal
  const red = interpolate(frame, [0, 14], [0.35, 0], clamp);

  const sup = useSpringAt(F(tSup) - 3, { damping: 11, stiffness: 200 });
  const eng = useSpringAt(F(tEng) - 3, { damping: 11, stiffness: 200 });
  const techCfg = { damping: 11, stiffness: 210 };
  const tech0 = useSpringAt(F(tTech) - 3, techCfg);
  const tech1 = useSpringAt(F(tTech) + 1, techCfg);
  const tech2 = useSpringAt(F(tTech) + 5, techCfg);
  const techs = [tech0, tech1, tech2];

  const blinkAt = (k: number) => { const p = (frame + k * 37) % 110; return p < 4 ? 1 - Math.abs(p - 2) / 2 : 0; };

  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: FONT, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 42%, rgba(47,208,193,${0.16 * reveal}) 0%, rgba(11,15,20,0) 55%)` }} />
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <MotionDefs />
        <rect width={1920} height={1080} fill="url(#mg-grid)" opacity={0.8} />
        <g transform={`translate(960 ${pipeY}) scale(${pipeS}) translate(-960 0)`} opacity={interpolate(draw, [0, 0.05], [0, 1], clamp) * interpolate(sink, [0, 1], [1, 0.55])}>
          <g style={{ clipPath: `inset(-200px ${100 - draw * 100}% -200px 0)` }}>
            <Pipe d="M180 0 H1740" offset={frame * 3.4} flow={1} color={C.accent} width={16} />
          </g>
          {NODES.map((n, i) => {
            const at = F(tPlatform) + 8 + i * 14;
            const p = interpolate(frame, [at, at + 10], [0, 1], { ...clamp, easing: Easing.out(Easing.back(2.2)) });
            const pulse = alivePulse * interpolate(Math.abs(i - 2), [0, 2], [1, 0.6]);
            return (
              <g key={n.label} transform={`translate(${n.x} 0) scale(${p})`}>
                <circle r={40 + 26 * pulse} fill={C.running} opacity={0.18 * pulse} />
                <circle r={26} fill={C.panel} stroke={C.running} strokeWidth={4} />
                <circle r={9} fill={C.running} />
                <text y={-48} textAnchor="middle" fill={C.text} style={{ fontSize: 24, fontWeight: 700 }}>{n.label}</text>
                <text y={62} textAnchor="middle" fill={C.text3} style={{ fontFamily: MONO, fontSize: 18 }}>{n.sub}</text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* logo */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: logoY, display: 'flex', justifyContent: 'center', transform: `translateY(-50%) scale(${logoS})` }}>
        <div style={{ position: 'relative', transform: `scale(${0.85 + 0.15 * settle})` }}>
          <GearCastLogo size={170} reveal={reveal} spin={(1 - settle) * -140 + frame * 0.25} glow={1 + 0.6 * (1 - lift)} />
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'overlay',
            background: `linear-gradient(100deg, transparent ${sweep - 12}%, rgba(255,255,255,0.4) ${sweep}%, transparent ${sweep + 12}%)`,
          }} />
        </div>
      </div>
      <div style={{
        position: 'absolute', top: 640, left: 0, right: 0, textAlign: 'center', fontSize: 30, color: C.text2, letterSpacing: '0.02em',
        opacity: interpolate(t, [tGear + 0.4, tGear + 0.8], [0, 1], clamp) * (1 - lift),
      }}>Franklin Baker – Darong WWTP · Maintenance</div>

      {/* cast */}
      <div style={{ position: 'absolute', left: 150, right: 150, top: 268, display: 'flex', gap: 40, justifyContent: 'center', alignItems: 'stretch' }}>
        <RoleCard p={sup} role="Supervisor" color={C.maint} members={[{ key: 'lemuel', name: 'Lemuel', acct: 'PS-01' }]} title="Plant Supervisor" blink={blinkAt} />
        <RoleCard p={eng} role="Engineer" color={C.standby} members={[{ key: 'jun', name: 'Jun', acct: 'EN-01' }]} title="Engineer" blink={blinkAt} />
        <RoleCard p={techs[0]} ps={techs} role="Technicians" color={C.running} title="On the floor" blink={blinkAt}
          members={[{ key: 'mia', name: 'Mia', acct: 'MT-01' }, { key: 'ken', name: 'Ken', acct: 'MT-02' }, { key: 'rico', name: 'Rico', acct: 'MT-03' }]} />
      </div>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 50%, rgba(240,82,82,0) 40%, rgba(240,82,82,${red}) 100%)`, pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
}

function RoleCard({ p, ps, role, color, members, title, blink }:
  { p: number; ps?: number[]; role: string; color: string; members: Member[]; title: string; blink: (k: number) => number }) {
  const solo = members.length === 1;
  const vis = Math.min(1, p * 1.6);
  return (
    <div style={{
      width: solo ? 440 : 720, padding: '30px 30px 34px', borderRadius: 22, background: 'rgba(18,24,33,0.94)',
      border: `1.5px solid ${color}55`, boxShadow: `0 30px 70px rgba(0,0,0,0.55), 0 0 50px ${color}1f`, position: 'relative', overflow: 'hidden',
      opacity: vis, transform: `translateY(${(1 - p) * 120}px) scale(${0.8 + 0.2 * p}) rotate(${(1 - p) * (solo ? -4 : 3)}deg)`,
    }}>
      <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: 6, background: color }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '0.16em', color }}>{role.toUpperCase()}</div>
        <div style={{ fontSize: 17, color: C.text3 }}>{title}</div>
      </div>
      <div style={{ display: 'flex', gap: 34, justifyContent: 'center', marginTop: 26 }}>
        {members.map((m, i) => {
          const q = ps ? ps[i] : p;
          return (
            <div key={m.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `scale(${0.6 + 0.4 * q})`, opacity: Math.min(1, q * 1.5) }}>
              <Avatar id={m.key} spec={AVATARS[m.key]} size={solo ? 170 : 150} blink={blink(i + role.length)} />
              <div style={{ fontSize: 34, fontWeight: 800, color: C.text, marginTop: 16 }}>{m.name}</div>
              <div style={{ marginTop: 8, padding: '4px 12px', borderRadius: 8, background: `${color}1c`, border: `1px solid ${color}55`, fontFamily: MONO, fontSize: 18, fontWeight: 700, color }}>{m.acct}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
