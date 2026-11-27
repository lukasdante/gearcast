import React from 'react';
import { useCurrentFrame } from 'remotion';
import { DeviceKind } from '../lib/capture';
import { COLORS, FONT, MONO } from '../theme';
import { GearIcon } from './BrandMark';

/**
 * Labelled stand-in for a capture that doesn't exist yet. Rendered at viewport size inside a DeviceFrame and styled
 * like the app shell, so a full render reads correctly before the Playwright captures land.
 */
export const PlaceholderScreen: React.FC<{ id: string; label?: string; device: DeviceKind; viewport: { w: number; h: number } }> = ({ id, label, device, viewport }) => {
  const f = useCurrentFrame();
  const { w, h } = viewport;
  const mobile = device === 'phone';
  const u = mobile ? 1 : w / 1280; // ui scale
  const shimmer = (f * 6) % (w * 2) - w * 0.5;
  return (
    <div style={{ position: 'absolute', inset: 0, width: w, height: h, background: COLORS.bg, fontFamily: FONT, color: COLORS.text, overflow: 'hidden' }}>
      {/* top bar */}
      <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: 52 * u, background: COLORS.bg2, borderBottom: `1px solid ${COLORS.line}`, display: 'flex', alignItems: 'center', gap: 10 * u, padding: `0 ${16 * u}px` }}>
        <div style={{ display: 'grid', placeItems: 'center', width: 28 * u, height: 28 * u, borderRadius: 7 * u, background: COLORS.accentDim }}>
          <GearIcon size={18 * u} />
        </div>
        <div style={{ fontSize: 16 * u, color: COLORS.text2 }}>
          Gear<b style={{ color: COLORS.text }}>Cast</b>
        </div>
      </div>
      {!mobile && <div style={{ position: 'absolute', left: 0, top: 52 * u, bottom: 0, width: 196 * u, background: COLORS.bg2, borderRight: `1px solid ${COLORS.line}` }}>
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} style={{ margin: `${(i ? 8 : 14) * u}px ${12 * u}px`, height: 18 * u, borderRadius: 5 * u, background: i === 1 ? COLORS.accentDim : COLORS.panel, width: `${60 + ((i * 37) % 30)}%` }} />
        ))}
      </div>}
      {/* content skeleton */}
      <div style={{ position: 'absolute', left: mobile ? 14 : 220 * u, right: mobile ? 14 : 24 * u, top: (mobile ? 66 : 76 * u), bottom: 24 * u, display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr 1fr 1fr', gridAutoRows: mobile ? 92 : 120 * u, gap: (mobile ? 12 : 16 * u) }}>
        {Array.from({ length: mobile ? 6 : 12 }).map((_, i) => (
          <div key={i} style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 8 * u, gridColumn: !mobile && (i === 4 || i === 9) ? 'span 2' : undefined }} />
        ))}
      </div>
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: shimmer, width: w * 0.35, background: 'linear-gradient(90deg, transparent, rgba(47,208,193,0.05), transparent)' }} />
      {/* label */}
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center', padding: `${(mobile ? 18 : 28 * u)}px ${(mobile ? 20 : 44 * u)}px`, borderRadius: 14 * u, background: 'rgba(11,15,20,0.82)', border: `1.5px dashed rgba(47,208,193,0.5)`, maxWidth: '86%' }}>
          <div style={{ fontFamily: MONO, color: COLORS.accent, fontSize: (mobile ? 15 : 18 * u), letterSpacing: '0.08em' }}>CAPTURE {id}</div>
          {label && <div style={{ marginTop: 8 * u, fontSize: (mobile ? 22 : 30 * u), fontWeight: 700 }}>{label}</div>}
          <div style={{ marginTop: 8 * u, fontSize: (mobile ? 12 : 14 * u), color: COLORS.text3, fontFamily: MONO }}>
            {device} · {w}×{h} · pending
          </div>
        </div>
      </div>
    </div>
  );
};
