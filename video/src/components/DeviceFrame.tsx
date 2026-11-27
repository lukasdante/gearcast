import React, { createContext, useContext } from 'react';
import { AbsoluteFill } from 'remotion';
import { DEFAULT_VIEWPORT, DeviceKind } from '../lib/capture';
import { CAPTION_SAFE, VIDEO } from '../theme';

/**
 * Device geometry. All numbers are output px for a given screen width; `layoutDevice` is the single source of truth
 * shared by DeviceFrame (drawing) and Camera/Cursor (mapping viewport px → stage px).
 */
type Spec = {
  viewport: { w: number; h: number };
  /** default on-stage screen width (output px) */
  defaultScreenW: number;
  /** bezel thickness as a fraction of screen width */
  bezel: number;
  /** outer corner radius / screen corner radius as fractions of screen width */
  outerR: number;
  screenR: number;
};

export const DEVICE_SPECS: Record<DeviceKind, Spec> = {
  laptop: { viewport: DEFAULT_VIEWPORT.laptop, defaultScreenW: 1120, bezel: 0.018, outerR: 0.022, screenR: 0.006 },
  tablet: { viewport: DEFAULT_VIEWPORT.tablet, defaultScreenW: 1060, bezel: 0.045, outerR: 0.06, screenR: 0.022 },
  phone: { viewport: DEFAULT_VIEWPORT.phone, defaultScreenW: 336, bezel: 0.045, outerR: 0.165, screenR: 0.135 },
};

export type Rect = { x: number; y: number; w: number; h: number };
export type DeviceLayout = {
  device: DeviceKind;
  /** screen rect in stage px */
  screen: Rect;
  /** whole device bounding box in stage px (incl. laptop base) */
  outer: Rect;
  /** viewport px → stage px */
  scale: number;
  viewport: { w: number; h: number };
};

export type LayoutOpts = {
  device: DeviceKind;
  /** screen width in output px (default per device) */
  screenWidth?: number;
  /** stage-px centre of the screen; default: centred horizontally in the area above the caption band */
  cx?: number;
  cy?: number;
  viewport?: { w: number; h: number };
};

export function layoutDevice(o: LayoutOpts): DeviceLayout {
  const spec = DEVICE_SPECS[o.device];
  const viewport = o.viewport ?? spec.viewport;
  const sw = o.screenWidth ?? spec.defaultScreenW;
  const sh = (sw * viewport.h) / viewport.w;
  const cx = o.cx ?? VIDEO.width / 2;
  const baseH = o.device === 'laptop' ? sw * 0.045 : 0;
  const b = sw * spec.bezel;
  // Default: centre the whole device (incl. laptop base) in the band between the chips (top) and the captions.
  const bandTop = 84;
  const bandBottom = VIDEO.height - CAPTION_SAFE + 50;
  const above = o.device === 'laptop' ? b * 1.6 : b; // outer top → screen top
  const outerH = o.device === 'laptop' ? sh + b * 2.6 + baseH : sh + 2 * b;
  const cy = o.cy ?? bandTop + Math.max(0, (bandBottom - bandTop - outerH) / 2) + above + sh / 2;
  const screen = { x: cx - sw / 2, y: cy - sh / 2, w: sw, h: sh };
  const outer =
    o.device === 'laptop'
      ? { x: screen.x - b - sw * 0.09, y: screen.y - b * 1.6, w: sw + 2 * b + sw * 0.18, h: sh + b * 2.6 + baseH }
      : { x: screen.x - b, y: screen.y - b, w: sw + 2 * b, h: sh + 2 * b };
  return { device: o.device, screen, outer, scale: sw / viewport.w, viewport };
}

/** Lets anything inside the screen slot know the viewport → output scale (Cursor sizes itself with it). */
export const ScreenContext = createContext<{ scale: number; viewport: { w: number; h: number }; device: DeviceKind }>({
  scale: 1,
  viewport: DEFAULT_VIEWPORT.laptop,
  device: 'laptop',
});
export const useScreen = () => useContext(ScreenContext);

export type DeviceFrameProps = LayoutOpts & {
  /** screen content, laid out at viewport size (e.g. 1920×1200) and scaled in */
  children?: React.ReactNode;
  /** 3D tilt in degrees (animate it from the caller); perspective is applied around the device centre */
  tilt?: { x?: number; y?: number; z?: number };
  /** extra scale/translate applied to the whole device (for transitions) */
  transform?: string;
  opacity?: number;
  /** screen glare overlay (default true) */
  glare?: boolean;
  /** frame colour: 'graphite' (default) | 'silver' */
  finish?: 'graphite' | 'silver';
  shadow?: boolean;
  /** overlay rendered above the screen but clipped to it, in stage coordinates of the screen (e.g. toasts) */
  screenOverlay?: React.ReactNode;
};

const FINISH = {
  graphite: { body: 'linear-gradient(160deg,#3a4250 0%,#22272f 45%,#171b21 100%)', edge: '#4a5361', bezel: '#07090c', base: 'linear-gradient(180deg,#4b5463 0%,#2b313b 55%,#181c22 100%)' },
  silver: { body: 'linear-gradient(160deg,#d9dde3 0%,#a9b0ba 50%,#8a919b 100%)', edge: '#e8ebef', bezel: '#0a0c10', base: 'linear-gradient(180deg,#e3e6ea 0%,#b4bac3 55%,#8d949d 100%)' },
};

export const DeviceFrame: React.FC<DeviceFrameProps> = ({ children, tilt, transform, opacity = 1, glare = true, finish = 'graphite', shadow = true, screenOverlay, ...layoutOpts }) => {
  const L = layoutDevice(layoutOpts);
  const spec = DEVICE_SPECS[L.device];
  const { screen, outer } = L;
  const sw = screen.w;
  const b = sw * spec.bezel;
  const F = FINISH[finish];
  const ocx = outer.x + outer.w / 2;
  const ocy = outer.y + outer.h / 2;
  const tiltT = tilt ? `perspective(2400px) rotateX(${tilt.x ?? 0}deg) rotateY(${tilt.y ?? 0}deg) rotateZ(${tilt.z ?? 0}deg)` : '';

  const screenEl = (
    <div
      style={{
        position: 'absolute',
        left: screen.x,
        top: screen.y,
        width: screen.w,
        height: screen.h,
        borderRadius: sw * spec.screenR,
        overflow: 'hidden',
        background: '#000',
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, width: L.viewport.w, height: L.viewport.h, transform: `scale(${L.scale})`, transformOrigin: '0 0' }}>
        <ScreenContext.Provider value={{ scale: L.scale, viewport: L.viewport, device: L.device }}>{children}</ScreenContext.Provider>
      </div>
      {screenOverlay}
      {glare && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: 'linear-gradient(115deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 28%, rgba(255,255,255,0) 42%)',
          }}
        />
      )}
    </div>
  );

  let body: React.ReactNode;
  if (L.device === 'laptop') {
    const lid = { x: screen.x - b, y: screen.y - b * 1.6, w: sw + 2 * b, h: screen.h + b * 2.6 };
    const baseY = lid.y + lid.h;
    const baseH = sw * 0.045;
    body = (
      <>
        {shadow && (
          <div style={{ position: 'absolute', left: outer.x + outer.w * 0.06, top: baseY + baseH * 0.55, width: outer.w * 0.88, height: baseH * 1.2, borderRadius: '50%', background: 'rgba(0,0,0,0.65)', filter: `blur(${baseH * 0.7}px)` }} />
        )}
        {/* lid */}
        <div
          style={{
            position: 'absolute', left: lid.x - 3, top: lid.y - 3, width: lid.w + 6, height: lid.h + 6,
            borderRadius: sw * spec.outerR + 3, background: F.body, boxShadow: shadow ? '0 40px 90px rgba(0,0,0,0.5)' : undefined,
          }}
        />
        <div style={{ position: 'absolute', left: lid.x, top: lid.y, width: lid.w, height: lid.h, borderRadius: sw * spec.outerR, background: F.bezel, boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.06)` }} />
        {/* camera */}
        <div style={{ position: 'absolute', left: screen.x + sw / 2 - b * 0.18, top: lid.y + b * 0.62, width: b * 0.36, height: b * 0.36, borderRadius: '50%', background: '#1a2230', boxShadow: 'inset 0 0 0 1.5px #2a3444' }} />
        {screenEl}
        {/* hinge */}
        <div style={{ position: 'absolute', left: lid.x + lid.w * 0.03, top: baseY - 2, width: lid.w * 0.94, height: baseH * 0.28, background: 'linear-gradient(180deg,#0d1014,#2a3039)', borderRadius: '0 0 4px 4px' }} />
        {/* base deck */}
        <div
          style={{
            position: 'absolute', left: outer.x, top: baseY + baseH * 0.22, width: outer.w, height: baseH * 0.62,
            background: F.base, borderRadius: `${baseH * 0.12}px ${baseH * 0.12}px ${baseH * 0.5}px ${baseH * 0.5}px / ${baseH * 0.12}px ${baseH * 0.12}px ${baseH * 0.45}px ${baseH * 0.45}px`,
            boxShadow: `inset 0 1px 0 ${F.edge}, 0 6px 14px rgba(0,0,0,0.45)`,
          }}
        />
        {/* thumb notch */}
        <div style={{ position: 'absolute', left: ocx - sw * 0.07, top: baseY + baseH * 0.22, width: sw * 0.14, height: baseH * 0.2, borderRadius: `0 0 ${baseH * 0.2}px ${baseH * 0.2}px`, background: 'rgba(0,0,0,0.28)' }} />
      </>
    );
  } else {
    const isPhone = L.device === 'phone';
    const R = sw * spec.outerR;
    body = (
      <>
        {shadow && (
          <div style={{ position: 'absolute', left: outer.x + outer.w * 0.08, top: outer.y + outer.h * 0.9, width: outer.w * 0.84, height: outer.h * 0.12, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', filter: `blur(${outer.w * 0.05}px)` }} />
        )}
        {/* side buttons */}
        {isPhone ? (
          <>
            <div style={{ position: 'absolute', left: outer.x - 3, top: outer.y + outer.h * 0.2, width: 5, height: outer.h * 0.05, borderRadius: 3, background: F.edge }} />
            <div style={{ position: 'absolute', left: outer.x - 3, top: outer.y + outer.h * 0.28, width: 5, height: outer.h * 0.08, borderRadius: 3, background: F.edge }} />
            <div style={{ position: 'absolute', left: outer.x - 3, top: outer.y + outer.h * 0.38, width: 5, height: outer.h * 0.08, borderRadius: 3, background: F.edge }} />
            <div style={{ position: 'absolute', left: outer.x + outer.w - 2, top: outer.y + outer.h * 0.3, width: 5, height: outer.h * 0.12, borderRadius: 3, background: F.edge }} />
          </>
        ) : (
          <>
            <div style={{ position: 'absolute', left: outer.x + outer.w * 0.08, top: outer.y - 3, width: outer.w * 0.06, height: 5, borderRadius: 3, background: F.edge }} />
            <div style={{ position: 'absolute', left: outer.x + outer.w * 0.82, top: outer.y - 3, width: outer.w * 0.1, height: 5, borderRadius: 3, background: F.edge }} />
          </>
        )}
        <div style={{ position: 'absolute', left: outer.x - 3, top: outer.y - 3, width: outer.w + 6, height: outer.h + 6, borderRadius: R + 3, background: F.body, boxShadow: shadow ? '0 40px 90px rgba(0,0,0,0.5), 0 12px 30px rgba(0,0,0,0.4)' : undefined }} />
        <div style={{ position: 'absolute', left: outer.x, top: outer.y, width: outer.w, height: outer.h, borderRadius: R, background: F.bezel, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.07)' }} />
        {screenEl}
        {isPhone ? (
          /* dynamic island */
          <div style={{ position: 'absolute', left: screen.x + sw / 2 - sw * 0.16, top: screen.y + sw * 0.03, width: sw * 0.32, height: sw * 0.09, borderRadius: sw * 0.05, background: '#000', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)' }}>
            <div style={{ position: 'absolute', right: sw * 0.04, top: sw * 0.03, width: sw * 0.03, height: sw * 0.03, borderRadius: '50%', background: '#121a28' }} />
          </div>
        ) : (
          <div style={{ position: 'absolute', left: screen.x + sw / 2 - b * 0.12, top: outer.y + b * 0.38, width: b * 0.24, height: b * 0.24, borderRadius: '50%', background: '#1a2230', boxShadow: 'inset 0 0 0 1.5px #2a3444' }} />
        )}
      </>
    );
  }

  return (
    <AbsoluteFill style={{ opacity, transform: transform ?? undefined, transformOrigin: `${ocx}px ${ocy}px` }}>
      <AbsoluteFill style={{ transform: tiltT || undefined, transformOrigin: `${ocx}px ${ocy}px` }}>{body}</AbsoluteFill>
    </AbsoluteFill>
  );
};
