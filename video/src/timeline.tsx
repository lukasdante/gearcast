/**
 * The promo's scene list. Order = play order. Each scene's length = its narration clip (public/audio/<id>.wav) +
 * tail (+ hold). Shot `at`/`until` are seconds from the scene start; `cue(scene, words, fallback)` snaps them to the
 * narration word times in captions.json. Capture beats come from the capture JSON marks (`mark()` / `ev()`), and
 * `ramp()` turns "this clip moment lands on that cue word" into speed-ramped segments (≥ 1×, cuts where noted), so a
 * re-take that moves a mark re-syncs automatically.
 *
 * Camera keys are clip seconds (the capture's own clock) in viewport px. See docs/video/promo/storyboard.md.
 */
import React from 'react';
import { Sequence } from 'remotion';
import { CloseScene, HookScene } from './scenes/motion';
import { makeIntroHandoff } from './scenes/edit/IntroHandoff';
import { SceneSpec } from './components/Scene';
import { ApprovalToast } from './components/Overlays';
import { Callout, Highlights, SnapFlash } from './components/EditOverlays';
import { cueTime as cue } from './lib/captions';
import { ev, mark, ramp } from './lib/edit';
import { COLORS, VIDEO } from './theme';

// ───────────────────────────── 02 · Dashboard (Lemuel) ─────────────────────────────
const LOGIN_CLIP = mark('02-a', 'login-page', 1.8);
const R02 = ramp(
  [
    { clip: LOGIN_CLIP, at: 0 },
    { clip: 3.4, at: 1.4 }, // Supervisor tab on "supervisor"
    { clip: mark('02-a', 'sign-in', 7.62), at: cue('02', 'dashboard', 3.12) - 0.15, cutTo: mark('02-a', 'dashboard-shown', 9.45) }, // fast-forward typing, cut the splash
    { clip: 13.0, at: cue('02', 'Every asset', 4.28) },
    { clip: mark('02-a', 'kpi-pan-done', 18.7), at: cue('02', 'one view', 7.44, 'end') },
    { clip: ev('02-a', 'Needs attention', 23.97) - 0.6, at: cue('02', 'one pump', 8.68) + 0.2 },
    { clip: ev('02-a', 'P-101A', 26.5, 'hover') + 0.1, at: cue('02', 'P-101A', 10.66) },
    { clip: ev('02-a', 'Condition watch', 29.3) + 0.3, at: 11.7 },
  ],
  { end: 12.66, endRate: 2, clipEnd: 31.6 },
);

// ───────────────────────────── 03 · QR scan (Mia) ─────────────────────────────
const R03 = ramp(
  [
    { clip: 3.0, at: 0 },
    { clip: ev('03-a', 'Scan QR', 6.44), at: 1.2 },
    { clip: mark('03-a', 'camera-on', 7.16), at: 1.7 },
    { clip: mark('03-a', 'qr-locked', 7.71), at: 2.8, rate: 0.5 }, // the one allowed slow-down: a readable scan lock
    { clip: mark('03-a', 'status', 10.38), at: cue('03', 'Status', 3.78) },
    { clip: mark('03-a', 'work-orders', 12.29), at: cue('03', 'work orders', 4.68) },
    { clip: mark('03-a', 'failures', 14.42), at: cue('03', 'past failures', 6.72) },
    { clip: mark('03-a', 'vibration', 16.34), at: 8.6 },
  ],
  { end: 12.82, endRate: 1, clipEnd: 20.4 },
);

// ───────────────────────────── 04 · Plant overview + fault (Jun) ─────────────────────────────
const C04 = { aRed: mark('04-a', 'p101a-red', 7.01), bothRed: mark('04-a', 'both-red', 14.47), cost: mark('04-a', 'cost-5.9M', 19.91) };
const R04 = ramp(
  [
    { clip: 1.0, at: 0 },
    { clip: ev('04-a', 'P-101A', 3.36), at: 2.4 },
    { clip: ev('04-a', 'Simulate fault', 6.63), at: cue('04', 'what if', 4.82) + 0.1 },
    { clip: C04.aRed, at: cue('04', 'fails', 5.22) },
    { clip: 8.6, at: 5.9 }, // standby covers it: ₱0, briefly
    { clip: C04.bothRed, at: cue('04', 'turns red', 6.74, 'end') + 0.2, rate: 3.6 },
    { clip: ev('04-a', 'Process stopped', 15.5), at: cue('04', 'which stage', 9.42) },
    { clip: 18.0, at: 10.9 },
    { clip: C04.cost, at: cue('04', 'price', 12.18) },
  ],
  { end: 15.06, endRate: 1.2, clipEnd: 23.4 },
);

// ───────────────────────────── 05 · Caster + troubleshoot (Mia) ─────────────────────────────
const T05B = cue('05', 'steps from', 10.68) - 0.3;
const R05A = ramp([
  { clip: 2.6, at: 0 },
  { clip: ev('05-a', 'Ask Caster', 5.9), at: 1.3 },
  { clip: mark('05-a', 'caster-open', 6.38), at: 1.55 },
  { clip: ev('05-a', 'Send', 13.94), at: 4.6 },
  { clip: mark('05-a', 'tool:Looking up P-101A', 15.3), at: cue('05', 'asset data', 6.6) - 0.2 },
  { clip: mark('05-a', 'tool:Checking alarms', 17.2), at: cue('05', 'spare stock', 8.88) - 0.6 },
  { clip: mark('05-a', 'answer-done', 21.34), at: T05B },
]);
const R05B = ramp(
  [
    { clip: 15.0, at: 0 },
    { clip: mark('05-b', 'steps-from-manuals', 16.3), at: cue('05', 'manuals', 11.74) - T05B },
    { clip: mark('05-b', 'materials', 18.62), at: cue('05', 'parts needed', 12.68) - T05B },
  ],
  { end: 15.06 - T05B, endRate: 1, clipEnd: 21.4 },
);

// ───────────────────────────── 06 · Spares + approval (Mia → Lemuel) ─────────────────────────────
const T06B = cue('06', 'That goes', 6.04) - 0.2;
const C06 = { deployed: mark('06-a', 'deployed', 17.43), sent: mark('06-a', 'sent-for-approval', 29.63) };
const R06A = ramp(
  [
    { clip: 9.9, at: 0 },
    { clip: 12.2, at: 0.8, cutTo: 15.9 }, // grease details → Deploy (skip filling the form)
    { clip: C06.deployed + 0.07, at: cue('06', 'deploys', 2.1) + 0.3 },
    { clip: 18.3, at: 3.2, cutTo: 22.0 }, // → bearing search result
    { clip: 24.4, at: cue('06', 'bearing kit', 3.98), cutTo: 28.0 }, // details → Deploy (skip the form)
    { clip: C06.sent + 0.07, at: cue('06', 'major spare', 4.74) + 0.4 },
  ],
  { end: T06B, endRate: 1, clipEnd: 31.5 },
);
const R06B = ramp(
  [
    { clip: 4.3, at: 0 },
    { clip: ev('06-b', 'Approve', 6.76), at: cue('06', 'approved', 7.22) - T06B },
  ],
  { end: 9.06 - T06B, endRate: 1.5, clipEnd: 9.65 },
);

// ───────────────────────────── 07 · Incident report (Mia) ─────────────────────────────
const T07B = cue('07', 'Seconds later', 3.46) - 0.2;
const R07A = ramp([
  { clip: 7.0, at: 0 },
  { clip: mark('07-a', 'photo-attached', 9.53) + 0.07, at: cue('07', 'photo', 0.92) },
  { clip: ev('07-a', 'Send', 14.98) + 0.12, at: cue('07', 'write it up', 2.28) - 0.25, rate: 5, cutTo: mark('07-a', 'op-card', 18.24) + 3.1 }, // typing fast-forward; cut the thinking
  { clip: mark('07-a', 'confirmed', 22.59) + 0.11, at: T07B },
]);
const R07B = ramp(
  [
    { clip: 2.4, at: 0 },
    { clip: mark('07-b', 'photo-beside-summary', 4.27), at: 1.3 },
    { clip: ev('07-b', 'Photo 1', 6.78), at: cue('07', 'photo sits', 7.38) - T07B },
    { clip: mark('07-b', 'field3', 9.62), at: cue('07', 'trend', 9.34) - T07B },
    { clip: mark('07-b', 'range-1w', 10.93), at: cue('07', 'from one week', 11.68) - T07B - 0.4 },
    { clip: mark('07-b', 'range-1m', 13.26), at: cue('07', 'week', 12.12) - T07B },
    { clip: mark('07-b', 'range-1y', 15.58), at: cue('07', 'year', 12.84) - T07B + 0.1 },
    { clip: mark('07-b', 'failure-marker', 16.6), at: cue('07', 'failure date', 13.86) - T07B - 0.1 },
  ],
  { end: 15.46 - T07B, endRate: 1.6, clipEnd: 20.6 },
);

// ───────────────────────────── 08 · Repair or replace (Jun) ─────────────────────────────
const C08 = { brand: mark('08-a', 'brand', 14.7), supplier: mark('08-a', 'supplier', 16.24), lead: mark('08-a', 'lead-time', 18.49) };
const R08 = ramp(
  [
    { clip: 1.6, at: 0 },
    { clip: ev('08-a', 'Run model', 6.23), at: 1.9 },
    { clip: mark('08-a', 'verdict', 6.62), at: 2.3 },
    { clip: 8.06, at: 3.0 },
    { clip: mark('08-a', 'model-name', 11.56), at: cue('08', 'costs', 6.66) },
    { clip: mark('08-a', 'if-replaced', 13.14), at: cue('08', 'replace,', 8.0) },
    { clip: C08.brand, at: cue('08', 'brand', 9.3) },
    { clip: C08.supplier, at: cue('08', 'supplier', 10.06) },
    { clip: C08.lead, at: cue('08', 'lead time', 11.12) },
  ],
  { end: 12.34, endRate: 1.3, clipEnd: 20.0 },
);

// ───────────────────────────── 09 · Knowledge base (Jun) ─────────────────────────────
const R09 = ramp(
  [
    { clip: 2.6, at: 0 },
    { clip: ev('09-a', 'Search', 6.33, 'click'), at: cue('09', 'searches', 1.98) + 0.3 },
    { clip: ev('09-a', 'Open p.17', 10.61), at: cue('09', 'opens', 3.32) + 0.2, rate: 3.4 },
    { clip: mark('09-a', 'manual-page', 13.8), at: cue('09', 'manual page', 4.3) + 0.2, rate: 3.2 },
  ],
  { end: 6.82, endRate: 1.1, clipEnd: 16.3 },
);

// ───────────────────────────── 10 · Layout approval (Jun → Lemuel) ─────────────────────────────
const T10B = cue('10', 'supervisors', 3.78) - 0.2;
const C10A = { edit: mark('10-a', 'edit-mode', 8.34), place: ev('10-a', 'Place pump', 11.38), submitFor: ev('10-a', 'Submit for approval', 16.09), sent: mark('10-a', 'sent-to-supervisor', 20.39) };
const R10A = ramp(
  [
    { clip: C10A.edit + 0.5, at: 0 },
    { clip: C10A.place + 0.2, at: 0.9 }, // place the pump
    { clip: mark('10-a', 'item-added', 13.0), at: 1.4, cutTo: C10A.submitFor - 0.1 },
    { clip: C10A.submitFor + 0.4, at: 1.9, cutTo: C10A.sent - 0.5 }, // Submit for approval → (skip typing) → Submit
    { clip: C10A.sent + 0.1, at: cue('10', 'propose', 2.72) },
  ],
  { end: T10B, endRate: 1.5, clipEnd: C10A.sent + 1.4 },
);
const C10B = { approve: ev('10-b', 'Approve', 11.27), toast: mark('10-b', 'toast-approved', 11.65) };
const R10B = ramp(
  [
    { clip: mark('10-b', 'queue-layout-change', 3.69) - 1.1, at: 0 },
    { clip: mark('10-b', 'queue-layout-change', 3.69) + 0.2, at: 0.5, cutTo: mark('10-b', 'preview-on', 7.11) - 0.6 },
    { clip: ev('10-b', 'Proposed pump', 8.67) + 0.1, at: 1.3, cutTo: C10B.approve - 0.4 },
    { clip: C10B.approve, at: cue('10', 'Lemuel', 5.26) - T10B },
    { clip: mark('10-b', 'layout-published', 12.46), at: 2.5 },
  ],
  { end: 6.98 - T10B, endRate: 1.2, clipEnd: 13.8 },
);

// ───────────────────────────── 11 · PM findings (Ken → Jun) ─────────────────────────────
const T11B = cue('11', 'Jun approves', 8.54) - 1.0;
const R11A = ramp([
  { clip: 6.6, at: 0 },
  { clip: ev('11-a', 'Record findings', 9.44), at: 1.6 },
  { clip: ev('11-a', 'Check 1', 11.24), at: 3.4 },
  { clip: mark('11-a', 'checklist', 13.79), at: cue('11', 'checklist', 4.14) + 0.4 },
  { clip: mark('11-a', 'reading', 15.36), at: cue('11', 'readings', 5.42) },
  { clip: mark('11-a', 'photos', 17.46), at: cue('11', 'photos', 6.4) },
  { clip: 18.3, at: 6.7, cutTo: 30.2 },
  { clip: mark('11-a', 'filed', 30.98), at: Math.min(cue('11', 'files', 7.34), T11B) },
]);
const C11B = { approve: ev('11-b', 'Approve', 8.1), toast: mark('11-b', 'toast-approved', 8.48), lastDone: mark('11-b', 'last-done-today', 13.0) };
const R11B = ramp(
  [
    { clip: C11B.approve - 2.4, at: 0 },
    { clip: C11B.approve, at: cue('11', 'approves', 8.64) + 0.1 - T11B },
    { clip: ev('11-b', 'Search PM-09', 10.24, 'click'), at: 1.5 },
    { clip: C11B.lastDone, at: cue('11', 'updates', 10.46) - T11B },
  ],
  { end: 12.02 - T11B, endRate: 1.2, clipEnd: 15.2 },
);

// ───────────────────────────── 12 · Emergency access (Lemuel → Rico) ─────────────────────────────
const C12 = { granted: mark('12-a', 'access-granted', 15.25) };
const R12 = ramp(
  [
    { clip: 2.6, at: 0 },
    { clip: mark('12-a', 'access-modal', 5.25), at: 1.6 },
    { clip: ev('12-a', 'Person', 6.39), at: cue('12', 'Rico', 3.48) },
    { clip: mark('12-a', 'expiry-picked', 10.86), at: cue('12', 'expiry', 5.44) },
    { clip: 11.3, at: 5.8, cutTo: 14.5 }, // skip typing the reason
    { clip: C12.granted, at: cue('12', 'so it closes', 6.04) + 0.5 },
  ],
  { end: 8.26, endRate: 2, clipEnd: 18.7 },
);

// ───────────────────────────── 13 · Close montage ─────────────────────────────
const PHONE = { screenWidth: 380, cy: 468 };
const FULL = { screenWidth: VIDEO.width, cx: VIDEO.width / 2, cy: VIDEO.height / 2 };
const T13 = { b: cue('13', 'caught', 0.52) - 0.05, a: cue('13', 'early', 0.94) - 0.05, end: cue('13', '₱5.9', 1.88) - 0.3 };
const push = (t: number, x: number, y: number, z0: number, z1: number) => [
  { t, x, y, zoom: z0, duration: 0.01 },
  { t: t + 0.02, x, y, zoom: z1, duration: 1.2 },
];

const hl = (...items: Parameters<typeof Highlights>[0]['items']) => <Highlights items={items} />;

export const SCENES: SceneSpec[] = [
  {
    id: '00', name: 'Hook', estSec: 18.2, background: 'dark', component: HookScene,
    captions: { accent: COLORS.fault },
    // breath at 18.02–18.12: fade the clip out from 18.0 s
    volume: (s) => (s < 17.98 ? 1 : Math.max(0, 1 - (s - 17.98) / 0.12)),
  },
  {
    id: '01', name: 'Meet GearCast', estSec: 10.2, component: makeIntroHandoff({ capture: '02-a', clipSec: LOGIN_CLIP }),
  },
  {
    id: '02', name: 'Dashboard · Lemuel', estSec: 12.4,
    chips: [{ at: 0.3, label: 'Dashboard' }],
    badges: [{ who: 'lemuel', at: cue('02', 'Lemuel', 0.1) }],
    shots: [{
      at: 0, capture: '02-a', device: 'laptop', segments: R02.segments, label: 'Login → Dashboard, P-101A flagged',
      camera: [
        { t: LOGIN_CLIP, x: 960, y: 640, zoom: 2.2, duration: 1.0 },
        { t: 6.9, wide: true, duration: 0.6 },
        { t: 12.2, x: 359, y: 150, zoom: 1.9, duration: 0.8 },
        { t: 14.6, x: 1198, y: 150, zoom: 1.9, duration: 1.0 },
        { t: 17.0, x: 1757, y: 150, zoom: 1.9, duration: 1.0 },
        { t: 19.6, x: 1058, y: 230, zoom: 1.25, duration: 0.6 },
        { t: 22.8, region: { x: 239, y: 271, w: 604, h: 800 }, duration: 0.8 },
        { t: 26.0, region: { x: 239, y: 640, w: 1130, h: 450 }, duration: 0.8 },
        { t: 30.6, wide: true, duration: 0.6 },
      ],
      screenOverlay: hl(
        { t: ev('02-a', 'Needs attention', 23.97), until: 26.3, box: { x: 239, y: 271, w: 604, h: 772 }, color: COLORS.maint },
        { t: 27.0, box: { x: 883, y: 751, w: 477, h: 32 }, color: COLORS.maint },
      ),
    }],
  },
  {
    id: '03', name: 'QR scan · Mia', estSec: 12.3,
    chips: [{ at: 0.5, label: 'QR scan' }],
    badges: [{ who: 'mia', at: cue('03', 'Mia', 1.42) }],
    shots: [{
      at: 0, capture: '03-a', device: 'phone', layout: PHONE, swapFrom: 'laptop', swapFromCapture: '02-a', swapFromAt: R02.endClip, segments: R03.segments, maxZoom: 2.6,
      label: 'Scan P-101A tag → quick view',
      camera: [
        { t: 3.0, wide: true, duration: 0.01 },
        { t: 5.7, wide: true, duration: 0.6 },
        { t: 6.8, x: 195, y: 400, zoom: 1.2, duration: 0.6 },
        { t: 8.0, wide: true, duration: 0.8 },
                { t: 18.0, region: { x: 12, y: 92, w: 366, h: 76 }, zoom: 2.5, duration: 0.8 },
        { t: 19.75, wide: true, duration: 0.5 },
      ],
      screenOverlay: hl({ t: 18.2, box: { x: 17, y: 100, w: 173, h: 57 }, color: COLORS.fault, pad: 4 }),
    }],
  },
  {
    id: '04', name: 'Plant overview + fault · Jun', estSec: 14.6,
    chips: [{ at: 0.4, label: '3D Plant Overview' }, { at: cue('04', 'what if', 4.82), label: 'Fault simulation' }],
    badges: [{ who: 'jun', at: cue('04', 'Jun', 0.1) }],
    shots: [{
      at: 0, capture: '04-a', device: 'laptop', swapFrom: 'phone', swapFromCapture: '03-a', swapFromLayout: PHONE, swapFromAt: R03.endClip, segments: R04.segments, maxZoom: 3.6,
      label: 'Inspect P-101A → simulate fault → shutdown cost',
      camera: [
        { t: 1.0, wide: true, duration: 0.01 },
        { t: 1.2, x: 1000, y: 640, zoom: 1.5, duration: 0.9 },
        { t: 3.5, region: { x: 560, y: 260, w: 1360, h: 800 }, duration: 0.7 },
        { t: 4.2, region: { x: 640, y: 560, w: 1270, h: 560 }, duration: 0.8 },
        { t: 7.6, region: { x: 640, y: 600, w: 1270, h: 600 }, duration: 0.5 },
        { t: 10.4, region: { x: 640, y: 600, w: 1270, h: 360 }, duration: 0.5 },
        { t: 14.3, region: { x: 180, y: 120, w: 1240, h: 760 }, duration: 0.6 },
        { t: 17.3, region: { x: 1480, y: 880, w: 430, h: 320 }, zoom: 2.3, duration: 0.8 },
        { t: 19.7, x: 1726, y: 1160, zoom: 3.5, duration: 0.8 },
        { t: 22.3, wide: true, duration: 0.8 },
      ],
      screenOverlay: hl(
        { t: C04.aRed + 0.6, until: 8.9, box: { x: 1562, y: 1167, w: 327, h: 33 }, color: COLORS.running, pad: 5 },
        { t: C04.bothRed + 0.2, until: 17.2, box: { x: 210, y: 136, w: 342, h: 56 }, color: COLORS.fault },
        { t: C04.cost, until: 22.6, box: { x: 1562, y: 1167, w: 327, h: 33 }, color: COLORS.fault, pad: 5 },
      ),
    }],
  },
  {
    id: '05', name: 'Caster AI + troubleshoot · Mia', estSec: 14.6,
    chips: [{ at: 0.4, label: 'Caster AI · tools' }, { at: T05B + 0.3, label: 'Troubleshoot' }],
    badges: [{ who: 'mia', at: cue('05', 'Mia', 1.38) }],
    shots: [
      {
        at: 0, capture: '05-a', device: 'phone', layout: PHONE, swapFrom: 'laptop', swapFromCapture: '04-a', swapFromAt: R04.endClip, segments: R05A.segments, maxZoom: 2.4,
        label: 'Caster: tool calls → answer',
        camera: [
          { t: 2.6, wide: true, duration: 0.01 },
          { t: 5.4, wide: true, duration: 0.6 },
          { t: 6.6, x: 195, y: 600, zoom: 1.25, duration: 0.7 },
          { t: 14.2, x: 195, y: 330, zoom: 1.8, duration: 0.7 },
          { t: 18.6, wide: true, duration: 0.8 },
        ],
        screenOverlay: hl({ t: mark('05-a', 'tool-done:Checking spare stock', 15.65), until: 18.4, box: { x: 22, y: 290, w: 260, h: 74 }, pad: 4 }),
      },
      {
        at: T05B, capture: '05-b', device: 'tablet', swapFrom: 'phone', swapFromCapture: '05-a', swapFromLayout: PHONE, swapFromAt: R05A.endClip, segments: R05B.segments,
        label: 'Troubleshoot: steps, parts, location',
        camera: [
          { t: 15.0, x: 640, y: 380, zoom: 1.4, duration: 0.7 },
          { t: 17.9, region: { x: 264, y: 68, w: 628, h: 433 }, duration: 0.7 },
        ],
        screenOverlay: hl({ t: mark('05-b', 'materials', 18.62), box: { x: 264, y: 68, w: 628, h: 433 } }),
      },
    ],
  },
  {
    id: '06', name: 'Spares + approval · Mia → Lemuel', estSec: 8.6,
    chips: [{ at: 0.3, label: 'Spares · approvals' }],
    badges: [
      { who: 'mia', at: cue('06', 'Mia', 1.88), until: T06B },
      { who: 'lemuel', at: cue('06', 'Lemuel', 6.58) },
    ],
    toasts: [{ by: 'Lemuel', role: 'Supervisor', detail: 'Bearing kit SPP-003 · major spare', at: T06B + R06B.local(mark('06-b', 'toast-approved', 7.15)), hold: 1.6 }],
    overlays: (
      <>
        <Callout at={R06A.local(C06.deployed)} until={T06B + 0.5} text="Accessory · deployed instantly" sub="Grease SPP-018 → motor M-101A" color={COLORS.running} icon="bolt" />
        <Callout at={R06A.local(C06.sent)} until={T06B + 0.5} text="Major spare · sent for approval" sub="Bearing kit SPP-003 → P-101A" color={COLORS.maint} icon="clock" offsetY={196} />
      </>
    ),
    shots: [
      {
        at: 0, capture: '06-a', device: 'tablet', enter: 'swipe-left', segments: R06A.segments, label: 'Deploy grease (instant) · bearing kit → approval',
        camera: [
          { t: 9.9, region: { x: 380, y: 400, w: 520, h: 310 }, zoom: 1.8, duration: 0.01 },
          { t: 15.9, region: { x: 400, y: 400, w: 480, h: 200 }, zoom: 1.9, duration: 0.01 },
          { t: 16.6, x: 640, y: 330, zoom: 1.45, duration: 0.6 },
          { t: 22.0, region: { x: 380, y: 400, w: 520, h: 330 }, zoom: 1.8, duration: 0.01 },
          { t: 28.0, region: { x: 400, y: 410, w: 480, h: 200 }, zoom: 1.9, duration: 0.01 },
          { t: 28.8, x: 640, y: 330, zoom: 1.45, duration: 0.6 },
          { t: R06A.endClip - 0.45, wide: true, duration: 0.4 },
        ],
      },
      {
        at: T06B, capture: '06-b', device: 'laptop', swapFrom: 'tablet', swapFromCapture: '06-a', swapFromAt: R06A.endClip, segments: R06B.segments, maxZoom: 2.4,
        label: 'Lemuel: Approvals → Approve',
        camera: [
          { t: 4.3, wide: true, duration: 0.01 },
          { t: 5.0, region: { x: 230, y: 170, w: 760, h: 150 }, zoom: 2.3, duration: 0.7 },
          { t: R06B.endClip - 0.75, wide: true, duration: 0.45 },
        ],
        screenOverlay: hl({ t: 5.1, until: ev('06-b', 'Approve', 6.76) + 0.25, box: { x: 236, y: 196, w: 720, h: 112 }, color: COLORS.maint }),
      },
    ],
  },
  {
    id: '07', name: 'Incident report · Mia', estSec: 15.0,
    chips: [{ at: 0.3, label: 'Caster → incident report' }, { at: cue('07', 'with a trend', 9.04), label: 'Field 3 trends' }],
    badges: [{ who: 'mia', at: cue('07', 'Mia', 0.12) }],
    shots: [
      {
        at: 0, capture: '07-a', device: 'phone', layout: PHONE, swapFrom: 'laptop', swapFromCapture: '06-b', swapFromAt: R06B.endClip, segments: R07A.segments, maxZoom: 2.2,
        label: 'Photo → "write an incident report" → Confirm',
        camera: [
          { t: 7.0, x: 195, y: 600, zoom: 1.2, duration: 0.6 },
          { t: 21.0, x: 195, y: 560, zoom: 1.2, duration: 0.5 },
          { t: R07A.endClip - 0.35, wide: true, duration: 0.3 },
        ],
        screenOverlay: <SnapFlash t={mark('07-a', 'photo-attached', 9.53) - 0.15} />,
      },
      {
        at: T07B, capture: '07-b', device: 'laptop', swapFrom: 'phone', swapFromCapture: '07-a', swapFromLayout: PHONE, swapFromAt: R07A.endClip, segments: R07B.segments, maxZoom: 2.9,
        label: 'Incident report: Photo 1, Field 3 trend',
        camera: [
          { t: 2.4, wide: true, duration: 0.01 },
          { t: 3.5, region: { x: 1470, y: 150, w: 440, h: 380 }, zoom: 2.2, duration: 0.9 },
          { t: 8.7, region: { x: 1470, y: 590, w: 440, h: 400 }, zoom: 2.2, duration: 0.8 },
          { t: 16.2, x: 1790, y: 900, zoom: 2.9, duration: 0.8 },
          { t: 18.4, wide: true, duration: 0.8 },
        ],
        screenOverlay: hl(
          { t: ev('07-b', 'Photo 1', 6.78) - 0.2, until: 9.0, box: { x: 1764, y: 156, w: 140, h: 106 }, color: COLORS.accent },
          { t: mark('07-b', 'failure-marker', 16.6), box: { x: 1846, y: 861, w: 12, h: 111 }, color: COLORS.fault, pad: 6 },
        ),
      },
    ],
  },
  {
    id: '08', name: 'Repair or replace · Jun', estSec: 11.8,
    chips: [{ at: 0.3, label: 'Repair / Replace · ML' }],
    badges: [{ who: 'jun', at: 0.4 }],
    shots: [{
      at: 0, capture: '08-a', device: 'laptop', enter: 'swipe-left', segments: R08.segments, maxZoom: 3.2, label: 'Verdict → brand, supplier, lead time',
      camera: [
        { t: 1.6, wide: true, duration: 0.01 },
        { t: 1.7, x: 760, y: 560, zoom: 2.0, duration: 0.8 },
        { t: 5.2, x: 1500, y: 560, zoom: 2.0, duration: 0.6 },
        { t: 6.3, region: { x: 250, y: 110, w: 1660, h: 180 }, duration: 0.7 },
        { t: 8.2, region: { x: 1470, y: 110, w: 440, h: 460 }, duration: 0.8 },
        { t: 12.2, x: 1605, y: 252, zoom: 3.1, duration: 0.9 },
      ],
      screenOverlay: hl(
        { t: C08.brand - 0.2, until: C08.supplier - 0.2, box: { x: 1490, y: 240, w: 230, h: 19 }, pad: 4, radius: 6 },
        { t: C08.supplier - 0.2, until: C08.lead - 0.2, box: { x: 1519, y: 262, w: 115, h: 14 }, pad: 4, radius: 6 },
        { t: C08.lead - 0.2, box: { x: 1644, y: 262, w: 82, h: 14 }, pad: 4, radius: 6 },
      ),
    }],
  },
  {
    id: '09', name: 'Knowledge base · Jun', estSec: 6.3,
    chips: [{ at: 0.3, label: 'Knowledge base' }],
    badges: [{ who: 'jun', at: cue('09', 'Jun', 1.78) }],
    shots: [{
      at: 0, capture: '09-a', device: 'laptop', enter: 'swipe-left', segments: R09.segments, maxZoom: 2.8, label: 'Search → open the cited manual page',
      camera: [
        { t: 2.6, x: 1130, y: 300, zoom: 2.6, duration: 0.01 },
        { t: 7.4, region: { x: 840, y: 190, w: 600, h: 340 }, zoom: 2.7, duration: 0.6 },
        { t: 13.5, x: 1040, y: 330, zoom: 2.4, duration: 0.9 },
      ],
      screenOverlay: hl(
        { t: ev('09-a', 'WWTP Maintenance Manual', 8.84) - 0.3, until: 11.0, box: { x: 917, y: 389, w: 440, h: 38 } },
        { t: mark('09-a', 'manual-page', 13.8) + 0.3, box: { x: 752, y: 96, w: 580, h: 32 }, pad: 6 },
      ),
    }],
  },
  {
    id: '10', name: 'Layout approval · Jun → Lemuel', estSec: 6.5,
    chips: [{ at: 0.3, label: 'Layout · approval' }],
    badges: [
      { who: 'jun', at: cue('10', 'Jun', 0.12), until: T10B },
      { who: 'lemuel', at: cue('10', 'Lemuel', 5.26) },
    ],
    toasts: [{ by: 'Lemuel', role: 'Supervisor', detail: 'Pump area layout · W05', at: T10B + R10B.local(C10B.toast), hold: 1.6 }],
    shots: [
      {
        at: 0, capture: '10-a', device: 'laptop', enter: 'swipe-left', segments: R10A.segments, label: 'Jun: edit layout → Submit',
        camera: [
          { t: C10A.edit + 0.5, x: 1000, y: 700, zoom: 1.4, duration: 0.6 },
          { t: C10A.submitFor - 0.1, x: 1150, y: 300, zoom: 1.5, duration: 0.4 },
          { t: C10A.sent - 0.5, x: 1000, y: 400, zoom: 1.55, duration: 0.4 },
        ],
        screenOverlay: hl({ t: C10A.sent, box: { x: 772, y: 112, w: 572, h: 42 }, color: COLORS.running }),
      },
      {
        at: T10B, capture: '10-b', device: 'laptop', enter: 'swipe-left', segments: R10B.segments, label: 'Lemuel: approve layout',
        camera: [
          { t: 0, x: 520, y: 300, zoom: 2.2, duration: 0.01 },
          { t: mark('10-b', 'preview-on', 7.03) - 0.7, x: 1150, y: 800, zoom: 1.7, duration: 0.01 },
          { t: C10B.approve - 0.45, x: 520, y: 320, zoom: 2.2, duration: 0.01 },
          { t: mark('10-b', 'layout-published', 12.33) - 0.05, x: 1150, y: 800, zoom: 1.8, duration: 0.5 },
          { t: R10B.endClip - 0.5, wide: true, duration: 0.4 },
        ],
        screenOverlay: hl({ t: mark('10-b', 'layout-published', 12.46), box: { x: 1195, y: 895, w: 133, h: 24 }, color: COLORS.running }),
      },
    ],
  },
  {
    id: '11', name: 'PM findings · Ken → Jun', estSec: 11.5,
    chips: [{ at: 0.3, label: 'PM findings (tablet)' }, { at: T11B + 0.3, label: 'Approval' }],
    badges: [
      { who: 'ken', at: cue('11', 'Ken', 1.58), until: T11B },
      { who: 'jun', at: cue('11', 'Jun approves', 8.54) },
    ],
    toasts: [{ by: 'Jun', role: 'Engineer', detail: 'PM findings · P-101A', at: T11B + R11B.local(C11B.toast), hold: 2.2 }],
    shots: [
      {
        at: 0, capture: '11-a', device: 'tablet', swapFrom: 'laptop', swapFromCapture: '10-b', swapFromAt: R10B.endClip, segments: R11A.segments,
        label: 'Ken: checklist, readings, photos → File',
        camera: [
          { t: 6.6, wide: true, duration: 0.01 },
          { t: 7.0, x: 640, y: 420, zoom: 1.35, duration: 0.7 },
          { t: 8.7, x: 1000, y: 620, zoom: 1.7, duration: 0.6 },
          { t: 10.6, region: { x: 280, y: 270, w: 720, h: 220 }, zoom: 1.9, duration: 0.6 },
          { t: 14.0, x: 560, y: 300, zoom: 1.7, duration: 0.6 },
          { t: 30.2, x: 880, y: 650, zoom: 1.6, duration: 0.4 },
          { t: R11A.endClip - 0.25, wide: true, duration: 0.35 },
        ],
      },
      {
        at: T11B, capture: '11-b', device: 'laptop', swapFrom: 'tablet', swapFromCapture: '11-a', swapFromAt: R11A.endClip, segments: R11B.segments, maxZoom: 2.8,
        label: 'Jun: approve → PM record updates',
        camera: [
          { t: C11B.approve - 2.4, region: { x: 120, y: 60, w: 900, h: 430 }, duration: 0.01 },
          { t: C11B.approve + 0.5, x: 760, y: 600, zoom: 1.9, duration: 0.5 },
          { t: 10.9, x: 925, y: 652, zoom: 2.7, duration: 0.7 },
        ],
        screenOverlay: hl({ t: C11B.lastDone, box: { x: 866, y: 627, w: 118, h: 51 }, color: COLORS.running, pad: 5 }),
      },
    ],
  },
  {
    id: '12', name: 'Emergency access · Lemuel → Rico', estSec: 7.8,
    chips: [{ at: 0.3, label: 'Emergency plant access' }],
    badges: [
      { who: 'lemuel', at: cue('12', 'Lemuel', 2.84) },
      { who: 'rico', at: cue('12', 'Rico', 3.48), offsetY: 80 },
    ],
    toasts: [{ by: 'Lemuel', verb: 'Access granted', role: 'Supervisor', detail: 'Rico · MT-03 → Plant 2 · with expiry', at: R12.local(C12.granted), corner: 'bottom-right', offsetY: 0 }],
    shots: [{
      at: 0, capture: '12-a', device: 'laptop', enter: 'swipe-left', exit: 'zoom-through', segments: R12.segments, maxZoom: 2.8,
      label: 'Plant access → grant MT-03, expiry',
      camera: [
        { t: 2.6, wide: true, duration: 0.01 },
        { t: 3.0, x: 1600, y: 220, zoom: 1.8, duration: 0.6 },
        { t: 5.2, region: { x: 650, y: 400, w: 620, h: 360 }, zoom: 2.3, duration: 0.7 },
        { t: 15.2, region: { x: 690, y: 660, w: 540, h: 100 }, zoom: 2.7, duration: 0.7 },
      ],
      screenOverlay: hl({ t: C12.granted + 0.2, box: { x: 699, y: 692, w: 522, h: 47 }, color: COLORS.running }),
    }],
  },
  {
    id: '13', name: 'Close', estSec: 7.4, holdSec: 1.2, component: CloseScene,
    // the end card already shows the tagline — stop captions when it's spoken
    captions: { until: cue('13', 'GearCast', 5.26) },
    // clip 13 has no lead-in (speech at 0.04 s): a 2-frame ramp avoids a click at the cut
    volume: (s) => Math.min(1, s / 0.066),
    overlays: (
      <Sequence from={Math.round(T13.b * VIDEO.fps)} durationInFrames={Math.round((T13.a - T13.b) * VIDEO.fps)} layout="none">
        <ApprovalToast by="Lemuel" role="Supervisor" detail="Bearing kit · P-101A" at={0.05} hold={10} />
      </Sequence>
    ),
    shots: [
      { at: 0, until: T13.b, capture: '13-b', device: 'laptop', layout: FULL, cursor: false, pop: false, segments: [{ from: 1.0, to: 2.0, rate: 2 }], camera: push(1.0, 1000, 560, 1.2, 1.35) },
      { at: T13.b, until: T13.a, capture: '13-c', device: 'laptop', layout: FULL, pop: false, segments: [{ from: 1.15, to: 1.75, rate: 1.4 }], camera: push(1.15, 640, 330, 1.5, 1.6) },
      { at: T13.a, until: T13.end, capture: '13-a', device: 'laptop', layout: FULL, cursor: false, pop: false, exit: 'zoom-through', segments: [{ from: 0.6, to: 1.6, rate: 1 }], camera: push(0.6, 960, 560, 1.0, 1.08) },
    ],
  },
];
