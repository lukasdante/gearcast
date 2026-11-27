import React from 'react';
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from 'remotion';
import { Background } from '../components/Background';
import { BrandMark } from '../components/BrandMark';
import { Captions } from '../components/Captions';
import { CaptureShot } from '../components/CaptureShot';
import { ApprovalToast, RoleBadge, SceneTitle } from '../components/Overlays';
import { DeviceSwap, Transition } from '../components/Transition';
import { makePhrases } from '../lib/captions';
import { CaptureEvent } from '../lib/capture';
import { ensureFonts } from '../fonts';
import { COLORS } from '../theme';

export const SHOWCASE_FRAMES = 32 * 30;

const tabletEvents: CaptureEvent[] = [
  { t: 1.0, x: 640, y: 300, type: 'click', box: { x: 560, y: 276, w: 160, h: 48 } },
  { t: 2.2, x: 900, y: 520, type: 'click' },
  { t: 3.2, x: 640, y: 560, type: 'scroll', dy: 500 },
  { t: 4.3, x: 300, y: 200, type: 'click' },
];
const phoneEvents: CaptureEvent[] = [
  { t: 0.9, x: 195, y: 760, type: 'click', label: 'Scan QR' },
  { t: 2.0, x: 195, y: 520, type: 'scroll', dy: 600 },
  { t: 3.1, x: 120, y: 330, type: 'click' },
];

/** Demonstrates every engine component: laptop capture with cursor+camera, tablet/phone touch, overlays, captions. */
export const ComponentShowcase: React.FC = () => {
  ensureFonts();
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <Background />

      {/* A · laptop + real Playwright capture (_demo) + cursor + auto camera + pop — 0–14 s */}
      <Sequence from={0} durationInFrames={14 * 30} name="laptop · _demo capture">
        <Transition enter="zoom-through" exit="swipe-left" durationInFrames={14 * 30}>
          <CaptureShot
            capture="_demo"
            device="laptop"
            segments={[{ from: 1.2, to: 13.2 }]}
            camera={[
              { t: 1.2, wide: true, duration: 0.01 },
              { t: 2.3, x: 345, y: 303, zoom: 1.7 },
              { t: 4.0, region: { x: 822, y: 160, w: 487, h: 140 }, zoom: 1.9 },
              { t: 5.8, follow: true, zoom: 1.6 },
              { t: 9.0, wide: true },
              { t: 10.6, x: 1100, y: 330, zoom: 1.45 },
              { t: 12.0, wide: true },
            ]}
          />
        </Transition>
        <SceneTitle labels={[{ at: 0.4, label: 'Cursor + Camera · _demo capture' }, { at: 6.5, label: 'Camera follow' }]} />
        <RoleBadge who="jun" at={0.8} until={13.4} />
        <ApprovalToast by="Lemuel" role="Supervisor" detail="Bearing kit · major spare" at={9.5} />
        <Captions
          phrases={makePhrases([
            { start: 0.6, end: 2.2, text: 'The cursor glides to each control' },
            { start: 2.3, end: 4.0, text: '**squish**, **bounce**, ripple.' },
            { start: 4.4, end: 6.2, text: 'The camera fits a **region**' },
            { start: 6.4, end: 8.8, text: 'then **follows** the cursor.' },
            { start: 9.5, end: 12.5, text: 'Approved by **Lemuel**, in one tap.' },
          ])}
        />
      </Sequence>

      {/* B · tablet, touch, device swap from laptop — 14–20 s */}
      <Sequence from={14 * 30} durationInFrames={6 * 30} name="tablet · touch">
        <DeviceSwap from="laptop">
          <CaptureShot device="tablet" capture="_none-tablet" label="Tablet · touch ripple" events={tabletEvents} camera={[{ t: 0, wide: true }, { t: 1.9, x: 900, y: 520, zoom: 1.4 }, { t: 4.6, wide: true }]} />
        </DeviceSwap>
        <SceneTitle label="Tablet · 1280×800" at={0.3} />
        <RoleBadge who="ken" at={0.6} />
        <Captions phrases={makePhrases([{ start: 0.6, end: 2.6, text: 'Field moments get a **finger** dot' }, { start: 2.8, end: 5.4, text: 'with taps and **drags**.' }])} />
      </Sequence>

      {/* C · phone with animated 3D tilt — 20–26 s */}
      <Sequence from={20 * 30} durationInFrames={6 * 30} name="phone · tilt">
        <DeviceSwap from="tablet">
          <PhoneTilt />
        </DeviceSwap>
        <SceneTitle label="Phone · 390×844 @3x" at={0.3} />
        <RoleBadge who="mia" at={0.6} corner="top-right" />
        <Captions phrases={makePhrases([{ start: 0.6, end: 2.6, text: 'Scan the **P-101B** tag' }, { start: 2.8, end: 5.4, text: 'and save **₱5.9 M**.' }])} />
      </Sequence>

      {/* D · overlays + centre captions on the brand background — 26–32 s */}
      <Sequence from={26 * 30} durationInFrames={6 * 30} name="overlays">
        <Transition enter="swipe-up" durationInFrames={6 * 30}>
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingBottom: 260 }}>
            <div style={{ transform: `scale(${interpolate(f - 26 * 30, [0, 20], [0.8, 1.6], { extrapolateRight: 'clamp' })})` }}>
              <BrandMark size={56} rotate={(f - 26 * 30) * 1.5} />
            </div>
          </AbsoluteFill>
        </Transition>
        <RoleBadge who="lemuel" corner="top-left" at={0.3} />
        <RoleBadge who="jun" corner="top-left" at={0.5} offsetY={84} />
        <RoleBadge who="mia" corner="top-left" at={0.7} offsetY={168} />
        <RoleBadge who="rico" corner="top-left" at={0.9} offsetY={252} compact />
        <ApprovalToast by="Lemuel" verb="Access granted" role="Supervisor" detail="Rico · MT-03 → Plant 2 · expires in 12 h" at={1.2} hold={4.5} offsetY={0} />
        <Captions position="center" accent={COLORS.fault} phrases={makePhrases([{ start: 0.8, end: 2.6, text: 'Standby **fails to start.**' }, { start: 2.9, end: 5.6, text: '**10 hours.** **₱5.9 M** lost.' }])} />
      </Sequence>
    </AbsoluteFill>
  );
};

const PhoneTilt: React.FC = () => {
  const f = useCurrentFrame();
  const y = interpolate(f, [0, 180], [-14, 10]);
  return <CaptureShot device="phone" capture="_none-phone" label="Phone · QR quick view" events={phoneEvents} tilt={{ x: 6, y }} camera={[{ t: 0, wide: true }, { t: 2.6, x: 120, y: 330, zoom: 1.3 }, { t: 4.6, wide: true }]} />;
};
