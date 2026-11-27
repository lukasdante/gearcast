import React, { useMemo } from 'react';
import { AbsoluteFill, Freeze, interpolate, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptureEvent, clipTimeAt, DEFAULT_VIEWPORT, DeviceKind, frameAtClipTime, frameAtOrAfterClipTime, planFrames, planSegments, Segment, SegmentPlan, useCapture } from '../lib/capture';
import { ShotClock, ShotClockContext } from '../lib/shotClock';
import { autoCamera, Camera, CameraKey } from './Camera';
import { Cursor, CursorProps } from './Cursor';
import { DeviceFrame, DeviceFrameProps, DeviceLayout, layoutDevice, LayoutOpts } from './DeviceFrame';
import { PlaceholderScreen } from './PlaceholderScreen';

export type CaptureShotProps = {
  /** capture id → public/captures/<id>.webm + <id>.json (e.g. "04-a") */
  capture?: string;
  device: DeviceKind;
  /** which parts of the clip to play (clip seconds). Default: the whole clip at 1×. */
  segments?: Segment[];
  /** camera keyframes (clip seconds), 'auto' (derived from clicks), or 'none' */
  camera?: CameraKey[] | 'auto' | 'none';
  /** zoom used by 'auto' camera */
  autoZoom?: number;
  /** camera zoom cap (default 2.2) */
  maxZoom?: number;
  /** cursor on/off or Cursor props */
  cursor?: boolean | Omit<CursorProps, 'timeline' | 'events'>;
  /** "pop" the clicked element (needs event.box): scale a clipped copy of the video briefly */
  pop?: boolean;
  /** device placement */
  layout?: Omit<LayoutOpts, 'device' | 'viewport'>;
  tilt?: DeviceFrameProps['tilt'];
  deviceTransform?: string;
  deviceOpacity?: number;
  /** label for the placeholder screen when the capture is missing */
  label?: string;
  /** extra layers inside the screen (viewport px; read the ShotClock for timing) */
  screenOverlay?: React.ReactNode;
  /** extra layers on the stage, inside the camera (stage px) */
  stageOverlay?: (layout: DeviceLayout) => React.ReactNode;
  /** test hook: provide a timeline without a file (e.g. ComponentShowcase synthetic shot) */
  events?: CaptureEvent[];
  /** custom screen content instead of the capture video (still gets cursor/camera) */
  screen?: React.ReactNode;
};

/**
 * One device shot: DeviceFrame + capture video (with trims / speed ramps) + Cursor + Camera, all on the capture's
 * clock. Missing capture → labelled placeholder screen (camera keyframes still apply, so timing can be previewed).
 */
export const CaptureShot: React.FC<CaptureShotProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cap = useCapture(p.screen ? undefined : p.capture);
  const timeline = cap.status === 'ready' ? cap.timeline : undefined;
  const viewport = timeline?.viewport ?? DEFAULT_VIEWPORT[p.device];
  const events = p.events ?? timeline?.events ?? [];
  const duration = timeline?.durationSec;
  const plan: SegmentPlan = useMemo(
    () => planSegments(p.segments ?? (duration ? [{ from: 0, to: duration }] : []), fps),
    [p.segments, duration, fps],
  );
  const layout = layoutDevice({ device: p.device, viewport, ...p.layout });

  const clock: ShotClock = {
    frame,
    fps,
    clipTime: plan.length ? clipTimeAt(plan, frame, fps) : frame / fps,
    frameOf: (t) => (plan.length ? frameAtClipTime(plan, t, fps) : t * fps),
    frameAfter: (t) => (plan.length ? frameAtOrAfterClipTime(plan, t, fps) : t * fps),
    timeline: timeline ?? (p.events ? { device: p.device, viewport, durationSec: 0, events: p.events } : undefined),
  };

  const endSec = plan.length ? plan[plan.length - 1].to : undefined;
  const keys: CameraKey[] =
    p.camera === 'none' || p.camera === undefined ? [] : p.camera === 'auto' ? autoCamera(events, { zoom: p.autoZoom, endSec, startSec: plan[0]?.from ?? 0 }) : p.camera;

  if (cap.status === 'loading') return null;

  const src = cap.status === 'ready' ? cap.video : null;
  const total = planFrames(plan);
  const vStyle: React.CSSProperties = { position: 'absolute', left: 0, top: 0, width: viewport.w, height: viewport.h, objectFit: 'cover' };

  const video = src ? (
    <>
      {plan.map((s, i) => (
        <Sequence key={i} from={s.startFrame} durationInFrames={s.frames} layout="none">
          <OffthreadVideo src={src} muted trimBefore={Math.round(s.from * fps)} playbackRate={s.rate} style={vStyle} />
        </Sequence>
      ))}
      {total > 0 && (
        <Sequence from={total} layout="none">
          <Freeze frame={0}>
            <OffthreadVideo src={src} muted trimBefore={Math.max(0, Math.round(plan[plan.length - 1].to * fps) - 2)} style={vStyle} />
          </Freeze>
        </Sequence>
      )}
      {p.pop !== false &&
        events
          .filter((e) => e.type === 'click' && e.box)
          .map((e, i) => {
            const ef = clock.frameOf(e.t);
            if (!Number.isFinite(ef)) return null;
            const seg = plan.find((s) => e.t >= s.from && e.t <= s.to)!;
            const POP = 14;
            const from = Math.floor(ef);
            return (
              <Sequence key={`pop${i}`} from={from} durationInFrames={POP} layout="none">
                <PopRegion src={src} box={e.box!} viewport={viewport} trimBefore={Math.round(e.t * fps)} rate={seg?.rate ?? 1} />
              </Sequence>
            );
          })}
    </>
  ) : p.screen ? (
    p.screen
  ) : (
    <PlaceholderScreen id={p.capture ?? '—'} label={p.label} device={p.device} viewport={viewport} />
  );

  const cursorOn = p.cursor !== false && events.length > 0;
  const cursorProps = typeof p.cursor === 'object' ? p.cursor : {};

  return (
    <ShotClockContext.Provider value={clock}>
      <AbsoluteFill>
        <Camera layout={layout} keyframes={keys} events={events} maxZoom={p.maxZoom}>
          <DeviceFrame device={p.device} viewport={viewport} {...p.layout} tilt={p.tilt} transform={p.deviceTransform} opacity={p.deviceOpacity}>
            {video}
            {p.screenOverlay}
            {cursorOn && <Cursor events={events} {...cursorProps} />}
          </DeviceFrame>
          {p.stageOverlay?.(layout)}
        </Camera>
      </AbsoluteFill>
    </ShotClockContext.Provider>
  );
};

const PopRegion: React.FC<{ src: string; box: { x: number; y: number; w: number; h: number }; viewport: { w: number; h: number }; trimBefore: number; rate: number }> = ({ src, box, viewport, trimBefore, rate }) => {
  const d = useCurrentFrame();
  const s = interpolate(d, [0, 4, 14], [1, 1.09, 1], { extrapolateRight: 'clamp' });
  const shadow = interpolate(d, [0, 4, 14], [0, 1, 0], { extrapolateRight: 'clamp' });
  const pad = 4;
  return (
    <div
      style={{
        position: 'absolute',
        left: box.x - pad,
        top: box.y - pad,
        width: box.w + 2 * pad,
        height: box.h + 2 * pad,
        overflow: 'hidden',
        borderRadius: 8,
        transform: `scale(${s})`,
        boxShadow: `0 ${10 * shadow}px ${28 * shadow}px rgba(0,0,0,${0.55 * shadow})`,
      }}
    >
      <OffthreadVideo src={src} muted trimBefore={trimBefore} playbackRate={rate} style={{ position: 'absolute', left: -(box.x - pad), top: -(box.y - pad), width: viewport.w, height: viewport.h, maxWidth: 'none' }} />
    </div>
  );
};
