/**
 * Scene 00 — Hook. Dataset loss scenario LS-10: P-101A trips, standby P-101B (rotation skipped 6+ weeks) fails to
 * start, EQ tank (72 m³ free, 29.17 m³/h inflow → 2.47 h buffer) fills, LINE-VCO / LINE-DC / LINE-CW curtail,
 * ₱5,907,405 over 10 h. Beats are keyed to narration words in captions.json (fallbacks are the recorded clip's
 * approximate times).
 */
import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { AlarmRings, Chip, MotionDefs, Pipe, PumpR, clamp, useSpringAt } from './parts';
import { C, FONT, MONO, peso } from './theme';
import { wordTime } from './timing';

const LS10 = { total: 5907405, lost: 5777405, restart: 100000, overtime: 30000, outageH: 10, bufferH: 2.47, freeM3: 72, inflow: 29.17 };

const LINES = [
  { id: 'LINE-VCO', name: 'VCO + coconut flour', y: 300 },
  { id: 'LINE-DC', name: 'Desiccated coconut', y: 450 },
  { id: 'LINE-CW', name: 'Coconut water', y: 600 },
];

const TANK = { x: 620, y: 240, w: 280, h: 440 };
const PA = { x: 1080, y: 300 };
const PB = { x: 1080, y: 620 };

/** Integrated flow distance: runs at `speed` px/frame until `stop`, then decays over `decel` frames. */
function flowOffset(f: number, speed: number, stop = Infinity, decel = 14) {
  if (f <= stop) return speed * f;
  return speed * stop + speed * decel * (1 - Math.exp(-(f - stop) / decel));
}
const flowAlpha = (f: number, stop = Infinity, decel = 14) => (f <= stop ? 1 : Math.exp(-(f - stop) / decel));

export function HookScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  // ---- beats (seconds) from narration word timings
  const tTrip = wordTime('00', 'trips', 2.82);
  const tStandby = wordTime('00', 'standby', 3.9);
  const tSkipped = wordTime('00', 'skipped', 6.34);
  const tFail = wordTime('00', "doesn't start", 8.8);
  const tTen = wordTime('00', '10 hours', 10.02);
  const tLines = wordTime('00', 'three production lines', 11.26);
  // "₱5.9 M." spans 13.80–16.00 ("five point nine million pesos"); land the counter on "million", before "pesos".
  const tMillionEnd = wordTime('00', '₱5.9 M', 16.0, 'end') - 0.5;
  const tMissed = wordTime('00', 'missed check', 17.38);
  const F = (s: number) => Math.round(s * fps);
  const fTrip = F(tTrip), fFail = F(tFail), fTen = F(tTen), fMil = F(tMillionEnd), fMissed = F(tMissed);

  // ---- simulated plant hours (time-lapse between "Ten hours" and "million")
  const hours = interpolate(t, [tTen, tMillionEnd], [0, LS10.outageH], { ...clamp, easing: Easing.bezier(0.45, 0, 0.35, 1) });
  const realSec = Math.min(t, tTen);
  const curtailH = [LS10.bufferH, LS10.bufferH + 0.22, LS10.bufferH + 0.44];
  // frame at which plant-hours reach h (inverse lookup by sampling)
  const frameAtHour = (h: number) => {
    for (let f = fTen; f <= fMil; f++) {
      const hh = interpolate(f / fps, [tTen, tMillionEnd], [0, LS10.outageH], { ...clamp, easing: Easing.bezier(0.45, 0, 0.35, 1) });
      if (hh >= h) return f;
    }
    return fMil;
  };
  const fCurtail = curtailH.map(frameAtHour);
  const fBuffer = fCurtail[0];

  const level = 0.6 + 0.3 * Math.min(hours / LS10.bufferH, 1);
  const loss = hours <= LS10.bufferH ? 0 : LS10.total * Math.min(1, (hours - LS10.bufferH) / (LS10.outageH - LS10.bufferH));

  // ---- camera keyframes (world centre + scale)
  const camT = [0, tTrip - 0.2, tStandby + 0.2, tStandby + 1.1, tTen - 0.1, tTen + 1.1, tMissed - 1.3, tMissed - 0.3];
  const ease = { ...clamp, easing: Easing.bezier(0.65, 0, 0.35, 1) };
  const camX = interpolate(t, camT, [900, 1090, 1090, 1240, 1240, 960, 960, 1170], ease);
  const camY = interpolate(t, camT, [450, 360, 360, 560, 560, 430, 430, 610], ease);
  const camS = interpolate(t, camT, [0.98, 1.42, 1.42, 1.42, 1.42, 0.92, 0.92, 1.38], ease);
  const shakeAmp = 9 * Math.exp(-Math.max(0, frame - fTrip) / 6) * (frame >= fTrip ? 1 : 0)
    + 7 * Math.exp(-Math.max(0, frame - fFail) / 6) * (frame >= fFail ? 1 : 0);
  const shx = Math.sin(frame * 2.7) * shakeAmp, shy = Math.cos(frame * 3.3) * shakeAmp;

  // ---- pump states
  const aRed = frame >= fTrip;
  const bTry = frame >= fFail - 10;
  const bRed = frame >= fFail;
  const angA = flowOffset(frame, 14, fTrip, 10);
  const angB = bTry ? Math.sin((frame - (fFail - 10)) * 1.1) * 18 * Math.exp(-Math.max(0, frame - (fFail - 10)) / 14) : 0;
  const colA = aRed ? C.fault : C.running;
  const colB = bRed ? C.fault : bTry ? C.maint : C.standby;

  // ---- flows
  const offMain = flowOffset(frame, 3.2, fTrip, 16);
  const aMain = flowAlpha(frame, fTrip, 16);
  const lineOff = (i: number) => flowOffset(frame, 2.6, fCurtail[i], 10);
  const lineAlpha = (i: number) => flowAlpha(frame, fCurtail[i], 10);
  const feedOff = flowOffset(frame, 2.8, fCurtail[2], 10);
  const feedAlpha = flowAlpha(frame, fCurtail[2], 10);

  // ---- overlays
  const fadeIn = interpolate(frame, [0, 18], [0, 1], clamp);
  const redPulse = (aRed ? 0.55 * Math.exp(-(frame - fTrip) / 12) : 0) + (bRed ? 0.6 * Math.exp(-(frame - fFail) / 14) : 0)
    + (aRed ? 0.1 + 0.05 * Math.sin(frame / 5) : 0);
  const missedIn = useSpringAt(fMissed - 14, { damping: 13, stiffness: 170 });
  const dimWorld = interpolate(frame, [fMissed - 30, fMissed - 6], [1, 0.32], clamp);
  const blurPx = interpolate(frame, [fMissed - 30, fMissed - 4], [0, 7], clamp);
  const counterIn = useSpringAt(fTen + 4, { damping: 16 });
  const counterPunch = useSpringAt(fMil, { damping: 9, stiffness: 220 });
  const breakdownIn = useSpringAt(fMil + 8, { damping: 16 });
  const skipIn = useSpringAt(F(tSkipped) - 8, { damping: 15 });

  const hh = Math.floor(6 + hours), mm = Math.floor(((6 + hours) % 1) * 60);
  const clock = hours > 0 ? `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` : `06:00:${String(Math.floor(realSec)).padStart(2, '0')}`;

  const tankTop = TANK.y + TANK.h * (1 - level);
  const wave = (x: number) => tankTop + Math.sin(x / 22 + frame / 7) * 3;
  let wavePath = `M${TANK.x} ${wave(TANK.x)}`;
  for (let x = TANK.x; x <= TANK.x + TANK.w; x += 10) wavePath += ` L${x} ${wave(x)}`;
  wavePath += ` L${TANK.x + TANK.w} ${TANK.y + TANK.h} L${TANK.x} ${TANK.y + TANK.h} Z`;
  const yHH = TANK.y + TANK.h * 0.1, yNorm = TANK.y + TANK.h * 0.4;
  const bufferGone = frame >= fBuffer;

  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: FONT }}>
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, opacity: fadeIn, filter: blurPx > 0.05 ? `blur(${blurPx}px)` : undefined }}>
        <MotionDefs />
        <rect width={1920} height={1080} fill="url(#mg-grid)" />
        <g transform={`translate(${960 + shx} ${540 + shy}) scale(${camS}) translate(${-camX} ${-camY})`}>
          <g opacity={dimWorld}>
            {/* production lines */}
            {LINES.map((l, i) => {
              const cut = frame >= fCurtail[i];
              const cutIn = interpolate(frame, [fCurtail[i], fCurtail[i] + 8], [0, 1], clamp);
              return (
                <g key={l.id}>
                  <Pipe d={`M420 ${l.y} H530`} offset={lineOff(i)} flow={lineAlpha(i)} color="#5f8fa8" width={12} />
                  <g transform={`translate(90 ${l.y - 56})`}>
                    <rect width={330} height={112} rx={12} fill={C.panel} stroke={cut ? `${C.fault}aa` : C.line2} strokeWidth={cut ? 2 : 1.5} />
                    <rect x={0} y={0} width={6} height={112} rx={3} fill={cut ? C.fault : C.running} />
                    <text x={26} y={40} fill={C.text3} style={{ fontFamily: MONO, fontSize: 17, fontWeight: 600 }}>{l.id}</text>
                    <text x={26} y={72} fill={cut ? C.text3 : C.text} style={{ fontSize: 24, fontWeight: 650 }}>{l.name}</text>
                    <g transform="translate(26 84)">
                      <circle cx={5} cy={9} r={5} fill={cut ? C.fault : C.running} opacity={cut ? 1 : 0.6 + 0.4 * Math.sin(frame / 6 + i)} />
                      <text x={18} y={15} fill={cut ? C.faultSoft : C.text2} style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.08em' }}>{cut ? 'CURTAILED' : 'RUNNING'}</text>
                    </g>
                    {cut && <rect width={330} height={112} rx={12} fill={C.fault} opacity={0.12 * cutIn + 0.25 * (1 - cutIn) * cutIn * 4} />}
                  </g>
                </g>
              );
            })}
            <text x={90} y={222} fill={C.text3} style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.14em' }}>PRODUCTION LINES</text>
            <Pipe d="M530 300 V600" offset={feedOff} flow={feedAlpha} color="#5f8fa8" width={12} />
            <Pipe d={`M530 450 H${TANK.x}`} offset={feedOff} flow={feedAlpha} color="#5f8fa8" width={14} />

            {/* EQ tank */}
            <text x={TANK.x} y={TANK.y - 22} fill={C.text3} style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.14em' }}>EQ TANK · W04</text>
            <rect x={TANK.x} y={TANK.y} width={TANK.w} height={TANK.h} rx={10} fill="#0d141c" />
            <path d={wavePath} fill="url(#mg-water)" opacity={0.95} />
            <rect x={TANK.x} y={yHH} width={TANK.w} height={yNorm - yHH} fill="none" stroke={bufferGone ? C.fault : C.maint} strokeDasharray="6 6" strokeWidth={1.5} opacity={0.65} />
            <line x1={TANK.x - 10} x2={TANK.x + TANK.w + 10} y1={yHH} y2={yHH} stroke={C.fault} strokeWidth={2.5} />
            <text x={TANK.x + TANK.w - 12} y={yHH - 10} textAnchor="end" fill={C.faultSoft} style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.08em' }}>HIGH-HIGH 90 %</text>
            <text x={TANK.x + 16} y={yNorm - 14} fill={bufferGone ? C.faultSoft : '#f4c770'} style={{ fontSize: 16, fontWeight: 700 }} opacity={0.95}>
              {LS10.freeM3} m³ free buffer
            </text>
            <rect x={TANK.x} y={TANK.y} width={TANK.w} height={TANK.h} rx={10} fill="none" stroke={bufferGone ? C.fault : C.line2} strokeWidth={3} />
            <text x={TANK.x + TANK.w / 2} y={TANK.y + TANK.h - 24} textAnchor="middle" fill={C.text} style={{ fontFamily: MONO, fontSize: 30, fontWeight: 700 }}>
              {Math.round(level * 100)}%
            </text>
            {/* inflow / buffer callout (time-lapse only) */}
            <g opacity={interpolate(frame, [fTen, fTen + 10], [0, 1], clamp)}>
              <text x={TANK.x + TANK.w / 2} y={TANK.y + TANK.h + 40} textAnchor="middle" fill={C.text2} style={{ fontFamily: MONO, fontSize: 18 }}>
                in {LS10.inflow} m³/h · out 0 m³/h
              </text>
              <text x={TANK.x + TANK.w / 2} y={TANK.y + TANK.h + 68} textAnchor="middle" fill={bufferGone ? C.faultSoft : '#f4c770'} style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700 }}>
                {bufferGone ? `buffer gone at ${LS10.bufferH} h` : `buffer ${Math.max(0, LS10.bufferH - hours).toFixed(2)} h left`}
              </text>
            </g>

            {/* suction header + pumps */}
            <Pipe d={`M${TANK.x + TANK.w} 620 H980 V${PA.y} H${PA.x - 40}`} offset={offMain} flow={aMain} />
            <Pipe d={`M980 ${PB.y} H${PB.x - 40}`} offset={0} flow={0} />
            <Pipe d={`M${PA.x} ${PA.y - 58} V200 H1330 V450 H1400`} offset={offMain} flow={aMain} />
            <Pipe d={`M${PB.x} ${PB.y - 58} V520 H1330`} offset={0} flow={0} />
            <Pipe d="M1700 450 H1800" offset={offMain} flow={aMain} />

            <AlarmRings x={PA.x} y={PA.y} start={fTrip} period={26} />
            <PumpR x={PA.x} y={PA.y} angle={angA} color={colA} glow={aRed ? 1 : 0.4} label="P-101A"
              sub={<Chip text={aRed ? 'TRIPPED' : 'DUTY · RUNNING'} color={colA} w={aRed ? 120 : 170} solid={aRed} />} />
            {/* skipped rotation callout */}
            <g transform="translate(1250 600)" opacity={skipIn} >
              <g transform={`translate(0 ${(1 - skipIn) * 16})`}>
                <rect width={330} height={104} rx={12} fill={C.panel} stroke={`${C.maint}88`} strokeWidth={1.5} />
                <text x={18} y={32} fill="#f4c770" style={{ fontSize: 17, fontWeight: 700, letterSpacing: '0.04em' }}>Duty rotation skipped</text>
                {Array.from({ length: 6 }).map((_, i) => {
                  const fx = F(tSkipped) + 4 + i * 5;
                  const x = interpolate(frame, [fx, fx + 5], [0, 1], clamp);
                  return (
                    <g key={i} transform={`translate(${18 + i * 50} 48)`}>
                      <rect width={42} height={40} rx={6} fill={C.panel3} stroke={C.line2} />
                      <text x={21} y={17} textAnchor="middle" fill={C.text3} style={{ fontSize: 11, fontWeight: 700 }}>WK</text>
                      <text x={21} y={34} textAnchor="middle" fill={C.text2} style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700 }}>{i + 1}</text>
                      <path d="M8 8 L34 32 M34 8 L8 32" stroke={C.fault} strokeWidth={3.5} strokeLinecap="round" strokeDasharray={36} strokeDashoffset={36 * (1 - x)} />
                    </g>
                  );
                })}
              </g>
            </g>

            {/* treatment */}
            <g transform="translate(1400 330)">
              <rect width={300} height={240} rx={14} fill={C.panel} stroke={aRed ? `${C.fault}66` : C.line2} strokeWidth={1.5} />
              <text x={22} y={40} fill={C.text3} style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.14em' }}>W06</text>
              <text x={22} y={74} fill={C.text} style={{ fontSize: 26, fontWeight: 650 }}>Biological</text>
              <text x={22} y={106} fill={C.text} style={{ fontSize: 26, fontWeight: 650 }}>treatment</text>
              {Array.from({ length: 12 }).map((_, i) => {
                const by = 220 - ((frame * 1.6 * aMain + i * 37) % 100);
                return <circle key={i} cx={30 + (i * 23) % 250} cy={by} r={3 + (i % 3)} fill={C.accent} opacity={0.35 * aMain + 0.05} />;
              })}
              <text x={22} y={150} fill={aRed ? C.faultSoft : C.running} style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.08em' }}>
                {aRed ? 'NO FEED' : 'FEED 29.2 m³/h'}
              </text>
            </g>
          </g>
            {bRed && <AlarmRings x={PB.x} y={PB.y} start={fFail} period={26} />}
            <g>
              <PumpR x={PB.x} y={PB.y} angle={angB} color={colB} glow={bRed ? 1 : 0.35} label="P-101B"
                sub={<Chip text={bRed ? 'FAILED TO START' : bTry ? 'STARTING…' : 'STANDBY'} color={colB} w={bRed ? 190 : 130} solid={bRed} />} />
            </g>

        </g>
        <rect width={1920} height={1080} fill="url(#mg-vig)" />
      </svg>

      {/* red alarm wash */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 50%, rgba(240,82,82,0) 40%, rgba(240,82,82,${Math.min(0.6, redPulse)}) 100%)`, mixBlendMode: 'screen', pointerEvents: 'none' }} />

      {/* HUD: clock */}
      <div style={{ position: 'absolute', left: 48, top: 36, padding: '18px 26px 14px', borderRadius: 16, background: 'rgba(11,15,20,0.82)', boxShadow: '0 0 40px 20px rgba(11,15,20,0.6)', opacity: fadeIn, filter: blurPx > 0.05 ? `blur(${blurPx}px)` : undefined }}>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.16em', color: C.text3 }}>FRANKLIN BAKER – DARONG · WWTP</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginTop: 6 }}>
          <div style={{ fontFamily: MONO, fontSize: 64, fontWeight: 700, color: aRed ? C.faultSoft : C.text, fontVariantNumeric: 'tabular-nums' }}>{clock}</div>
          {hours > 0 && <div style={{ fontFamily: MONO, fontSize: 24, color: C.text2 }}>+{hours.toFixed(1)} h</div>}
        </div>
      </div>

      {/* HUD: loss counter */}
      <div style={{
        position: 'absolute', right: 72, top: 52, width: 620, padding: '22px 30px 24px', borderRadius: 16,
        background: 'rgba(18,24,33,0.92)', border: `1.5px solid ${loss > 0 ? 'rgba(240,82,82,0.55)' : C.line2}`,
        boxShadow: loss > 0 ? `0 0 ${40 + 40 * counterPunch * (frame >= fMil ? 1 : 0)}px rgba(240,82,82,0.25)` : 'none',
        opacity: counterIn * dimCounter(frame, fMissed), filter: blurPx > 0.05 ? `blur(${blurPx}px)` : undefined, transform: `translateY(${(1 - counterIn) * -24}px)`,
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.14em', color: C.text3 }}>SHUTDOWN COST · LS-10</div>
        <div style={{
          fontFamily: MONO, fontSize: 84, fontWeight: 800, color: loss > 0 ? C.faultSoft : C.text2, fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.1, marginTop: 4, paddingLeft: 10, transformOrigin: 'left center', transform: `scale(${frame >= fMil ? 1 + 0.08 * Math.sin(Math.PI * Math.min(1, (frame - fMil) / 10)) : 1})`,
        }}>{peso(loss)}</div>
        <div style={{ fontSize: 18, color: C.text2, marginTop: 6, fontFamily: MONO }}>
          {hours.toFixed(1)} h out · {Math.max(0, hours - LS10.bufferH).toFixed(1)} h past buffer · {fCurtail.filter(f => frame >= f).length}/3 lines down
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 14, opacity: breakdownIn, transform: `translateY(${(1 - breakdownIn) * 10}px)` }}>
          {[['Lost revenue', LS10.lost], ['Restart', LS10.restart], ['Overtime', LS10.overtime]].map(([k, v]) => (
            <div key={k as string} style={{ padding: '6px 12px', borderRadius: 8, background: C.panel3, fontSize: 15, color: C.text2 }}>
              {k} <b style={{ color: C.text, fontFamily: MONO }}>{peso(v as number)}</b>
            </div>
          ))}
        </div>
      </div>

      {/* "three production lines are down" stamp */}
      <LinesDownTag frame={frame} at={Math.max(F(tLines), fCurtail[2])} hide={fMissed - 20} />

      {/* missed check card */}
      <div style={{
        position: 'absolute', left: 960 - 340, top: 330, width: 680, padding: '30px 36px 34px', borderRadius: 18,
        background: C.panel, border: `2px solid rgba(240,82,82,0.6)`, boxShadow: '0 24px 60px rgba(0,0,0,0.6), 0 0 60px rgba(240,82,82,0.18)',
        opacity: missedIn, transform: `translateY(${(1 - missedIn) * 30}px) scale(${0.92 + 0.08 * missedIn})`,
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.14em', color: C.text3 }}>PM CHECKLIST · P-101A ⇄ P-101B</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 18 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 12, border: `3px solid ${C.fault}`, flex: 'none',
            boxShadow: `0 0 ${14 + 10 * Math.sin(frame / 4)}px rgba(240,82,82,0.55)`,
          }} />
          <div>
            <div style={{ fontSize: 36, fontWeight: 700, color: C.text }}>Rotate duty to standby</div>
            <div style={{ fontSize: 19, color: C.text2, marginTop: 4 }}>Last done 6 weeks ago</div>
          </div>
        </div>
        <div style={{
          position: 'absolute', right: -22, top: -26, background: C.panel, padding: '6px 16px', borderRadius: 8, border: `3px solid ${C.fault}`,
          color: C.fault, fontWeight: 900, fontSize: 26, letterSpacing: '0.12em',
          transform: `rotate(-8deg) scale(${interpolate(frame, [fMissed, fMissed + 6], [1.8, 1], clamp)})`,
          opacity: interpolate(frame, [fMissed, fMissed + 4], [0, 1], clamp),
        }}>MISSED</div>
      </div>
    </AbsoluteFill>
  );
}

function dimCounter(frame: number, fMissed: number) {
  return interpolate(frame, [fMissed - 30, fMissed - 6], [1, 0.55], clamp);
}

function LinesDownTag({ frame, at, hide }: { frame: number; at: number; hide: number }) {
  const o = interpolate(frame, [at, at + 6, hide, hide + 10], [0, 1, 1, 0], clamp);
  const s = interpolate(frame, [at, at + 8], [1.4, 1], { ...clamp, easing: Easing.out(Easing.back(2)) });
  return (
    <div style={{
      position: 'absolute', left: 100, top: 196, padding: '8px 18px', borderRadius: 10,
      background: C.fault, color: '#160606', fontWeight: 900, fontSize: 24, letterSpacing: '0.1em',
      opacity: o, transform: `scale(${s}) rotate(-2deg)`, transformOrigin: 'left center',
    }}>3 LINES DOWN</div>
  );
}
