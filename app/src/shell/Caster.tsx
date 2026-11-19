/**
 * Caster — GearCast's assistant mascot. A flat gear with a round face and a single visor eye.
 * States: idle (float + blink), thinking (gear turns, eye scans), talking (pulse). Optional alarm badge.
 */
import { useMemo } from 'react';

export type CasterState = 'idle' | 'thinking' | 'talking';

function gearPath(teeth = 9, rOuter = 30, rInner = 25.5, cx = 32, cy = 32) {
  const pts: string[] = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;
    const seq = [
      [a - step * 0.5, rInner], [a - step * 0.22, rInner], [a - step * 0.15, rOuter],
      [a + step * 0.15, rOuter], [a + step * 0.22, rInner],
    ];
    for (const [ang, r] of seq) pts.push(`${(cx + Math.cos(ang) * r).toFixed(2)},${(cy + Math.sin(ang) * r).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

export function Caster({ size = 56, state = 'idle', alert = false, className = '' }:
  { size?: number; state?: CasterState; alert?: boolean; className?: string }) {
  const d = useMemo(() => gearPath(), []);
  return (
    <span className={`caster caster-${state} ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <g className="caster-gear">
          <path d={d} className="caster-gear-body" />
        </g>
        <circle cx="32" cy="32" r="19" className="caster-face" />
        <g className="caster-eye-wrap">
          <rect x="22" y="28.5" width="20" height="7" rx="3.5" className="caster-eye" />
        </g>
        <circle cx="32" cy="32" r="19" className="caster-rim" />
      </svg>
      {alert && <span className="caster-badge" />}
    </span>
  );
}
