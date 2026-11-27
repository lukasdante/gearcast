/**
 * Scene 13 — Close + end card. "One pump, caught early." P-101A healthy and green; ₱5,907,405 kept in the plant
 * (LS-10 loss vs the LS-11 counterfactual: same trip, standby ready, ₱0 loss); then the GearCast end card with the
 * tagline and URL, held to the end of the composition.
 */
import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Chip, GearCastLogo, MotionDefs, PumpR, clamp, useSpringAt } from './parts';
import { C, FONT, MONO, peso } from './theme';
import { wordTime } from './timing';

const SAVED = 5907405;
const TAGLINE = ['Maintenance', 'that', 'sees', 'it', 'coming.'];

export function CloseScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const F = (s: number) => Math.round(s * fps);

  const tCaught = wordTime('13', 'caught early', 0.52);
  const tFive = wordTime('13', '₱5.9', 1.88);
  const tMil = wordTime('13', '₱5.9 M', 3.76, 'end') - 0.4;
  const tStayed = wordTime('13', 'stayed in the plant', 3.9);
  const tGear = wordTime('13', 'gearcast', 5.26);
  const tTag = wordTime('13', 'maintenance', 6.1);
  // start of tagline word i = end of the phrase up to word i-1 ("that" also occurs earlier, in "that stayed")
  const tagWords = TAGLINE.map((_, i) => (i === 0 ? tTag
    : wordTime('13', TAGLINE.slice(0, i).join(' ').replace('.', ''), tTag + i * 0.28, 'end')));

  const pumpIn = useSpringAt(0, { damping: 14, stiffness: 140 });
  const check = useSpringAt(F(tCaught) - 4, { damping: 9, stiffness: 220 });
  const counterIn = useSpringAt(F(tFive) - 8, { damping: 15 });
  const count = interpolate(t, [tFive - 0.1, tMil], [0, SAVED], { ...clamp, easing: Easing.bezier(0.3, 0, 0.2, 1) });
  const land = frame >= F(tMil) ? Math.exp(-(frame - F(tMil)) / 8) : 0;
  const compare = useSpringAt(F(tStayed) - 4, { damping: 16 });
  const out = useSpringAt(F(tGear) - 10, { damping: 20, stiffness: 120 });
  const logo = interpolate(t, [tGear - 0.25, tGear + 0.6], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 0.7, 0.2, 1) });
  const logoPop = useSpringAt(F(tGear) - 8, { damping: 12, stiffness: 120 });
  const urlIn = useSpringAt(F(tagWords[tagWords.length - 1]) + 4, { damping: 15 });

  const angle = frame * 9;
  const sceneOut = 1 - out;

  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: FONT, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 30% 45%, rgba(60,207,115,${0.16 * sceneOut}) 0%, rgba(11,15,20,0) 55%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 45%, rgba(47,208,193,${0.18 * logo}) 0%, rgba(11,15,20,0) 60%)` }} />
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <MotionDefs />
        <rect width={1920} height={1080} fill="url(#mg-grid)" />
        {/* healthy pump, caught early */}
        <g opacity={sceneOut} transform={`translate(${interpolate(out, [0, 1], [0, -120])} 0)`}>
          <g transform={`translate(520 440) scale(${1.9 * (0.85 + 0.15 * pumpIn)}) translate(-40 0)`} opacity={pumpIn}>
            <circle cx={40} r={120} fill={C.running} opacity={0.12} filter="url(#mg-blur)" />
            <PumpR x={0} y={0} angle={angle} color={C.running} glow={0.6} label="P-101A"
              sub={<Chip text="RUNNING" color={C.running} w={120} />} />
            <g transform={`translate(122 -58) scale(${check})`}>
              <circle r={30} fill={C.running} />
              <path d="M-13 1 L-4 10 L14 -9" fill="none" stroke="#06210f" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          </g>
        </g>
      </svg>

      <div style={{
        position: 'absolute', left: 300, top: 750, width: 440, textAlign: 'center', opacity: check * sceneOut,
        transform: `translateY(${(1 - check) * 16}px)`, fontSize: 30, fontWeight: 800, letterSpacing: '0.12em', color: C.running,
      }}>CAUGHT EARLY</div>

      {/* saved counter */}
      <div style={{
        position: 'absolute', left: 900, top: 250, width: 860, opacity: counterIn * sceneOut,
        transform: `translateX(${(1 - counterIn) * 60 + out * 120}px)`,
      }}>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.16em', color: C.text3 }}>KEPT IN THE PLANT</div>
        <div style={{
          fontFamily: MONO, fontSize: 132, fontWeight: 800, color: C.running, lineHeight: 1.05, marginTop: 8, fontVariantNumeric: 'tabular-nums',
          textShadow: `0 0 ${30 + 50 * land}px rgba(60,207,115,${0.35 + 0.4 * land})`, transformOrigin: 'left center', transform: `scale(${1 + 0.06 * land})`,
        }}>{peso(count)}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 30, opacity: compare, transform: `translateY(${(1 - compare) * 14}px)` }}>
          <Row tag="LS-10" text="Standby skipped rotation" value={peso(SAVED)} color={C.fault} strike />
          <Row tag="LS-11" text="Standby ready, caught early" value={peso(0)} color={C.running} />
        </div>
      </div>

      {/* end card */}
      <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingBottom: 120, pointerEvents: 'none' }}>
        <div style={{ opacity: Math.min(1, logo * 2), transform: `scale(${0.8 + 0.2 * logoPop})` }}>
          <GearCastLogo size={150} reveal={logo} spin={(1 - logoPop) * -120 + frame * 0.3} glow={1.2} />
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 44, fontSize: 56, fontWeight: 700, letterSpacing: '-0.01em' }}>
          {TAGLINE.map((w, i) => {
            const at = F(tagWords[i]) - 2;
            const p = interpolate(frame, [at, at + 8], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.8)) });
            const hi = i >= 2;
            return (
              <span key={i} style={{ opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * 28}px)`, display: 'inline-block', color: hi ? C.accent : C.text }}>{w}</span>
            );
          })}
        </div>
        <div style={{
          marginTop: 40, padding: '12px 26px', borderRadius: 999, border: `1.5px solid rgba(47,208,193,0.45)`, background: C.accentDim,
          fontFamily: MONO, fontSize: 30, fontWeight: 700, color: C.text, opacity: urlIn, transform: `translateY(${(1 - urlIn) * 18}px)`,
        }}>gearcast.engrlouis.dev</div>
        <div style={{ marginTop: 22, fontSize: 20, color: C.text3, opacity: urlIn }}>Franklin Baker – Darong WWTP · MVP</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function Row({ tag, text, value, color, strike = false }: { tag: string; text: string; value: string; color: string; strike?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '14px 20px', borderRadius: 14, background: 'rgba(18,24,33,0.92)', border: `1px solid ${C.line2}`, width: 760 }}>
      <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color, padding: '3px 10px', borderRadius: 7, background: `${color}1f` }}>{tag}</span>
      <span style={{ fontSize: 24, color: C.text2, flex: 1 }}>{text}</span>
      <span style={{ fontFamily: MONO, fontSize: 28, fontWeight: 700, color, textDecoration: strike ? 'line-through' : 'none' }}>{value} loss</span>
    </div>
  );
}
