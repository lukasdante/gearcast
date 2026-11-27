/** Scanned PM job sheet (1700×2200) for Ken's follow-up PM on P-101A: printed form, ballpoint handwriting
 *  (Caveat, bundled in public/illustrations/fonts), ticked checklist, readings, signature, scanner texture. */
import React, { useEffect, useState } from 'react';
import { loadFont } from '@remotion/fonts';
import { AbsoluteFill, continueRender, delayRender, staticFile } from 'remotion';

const INK = '#1f3784';
const PRINT = '#23272b';
const HAND = "'Caveat', 'Segoe Print', cursive";

let fontJob: Promise<void> | null = null;
function useHandFont() {
  const [handle] = useState(() => delayRender('Caveat font'));
  useEffect(() => {
    fontJob ??= loadFont({ family: 'Caveat', url: staticFile('illustrations/fonts/Caveat.ttf'), weight: '400 700' });
    fontJob.then(() => continueRender(handle)).catch(() => continueRender(handle));
  }, [handle]);
}

const Hand: React.FC<{ children: React.ReactNode; size?: number; rot?: number; style?: React.CSSProperties }> = ({ children, size = 52, rot = -1, style }) => (
  <span style={{ fontFamily: HAND, fontSize: size, color: INK, fontWeight: 600, display: 'inline-block', transform: `rotate(${rot}deg)`, lineHeight: 1, ...style }}>{children}</span>
);

function Tick({ v = 0 }: { v?: number }) {
  return (
    <svg width={50} height={40} viewBox="0 0 56 46" style={{ overflow: 'visible' }}>
      <path d={`M${4 + v} ${24 - v} C 12 30, 16 36, ${20 + v} 40 C 28 ${24 + v}, 38 ${10 - v}, ${54 - v} 2`} fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const CHECKS: [string, string][] = [
  ['Lock-out / tag-out applied at MCC, isolation verified', ''],
  ['Coupling guard removed; coupling insert inspected', 'insert OK'],
  ['Shaft alignment checked (dial / laser)', '0.04 mm'],
  ['DE + NDE bearings re-greased (correct grease, qty)', 'DE 15g · NDE 10g'],
  ['Base + anchor bolts checked for torque', ''],
  ['Seal reservoir level + condition', 'between marks'],
  ['Guards refitted, LOTO removed, area clean', ''],
  ['Test run 5 min — no abnormal noise / leak', ''],
];

const READINGS: [string, string, string][] = [
  ['Vibration DE (mm/s RMS)', '< 2.8 good · 4.5 alarm', '2.1'],
  ['Vibration NDE (mm/s RMS)', '< 2.8 good · 4.5 alarm', '1.8'],
  ['Bearing temp DE (°C)', '< 80, stable', '54'],
  ['Motor current (A)', '≤ 12.8', '11.6'],
];

export function JobSheet() {
  useHandFont();
  const cell: React.CSSProperties = { border: `2px solid ${PRINT}`, padding: '10px 16px', verticalAlign: 'middle' };
  const label: React.CSSProperties = { fontSize: 20, fontWeight: 700, letterSpacing: '0.06em', color: '#4a5056', textTransform: 'uppercase' };
  return (
    <AbsoluteFill style={{ background: '#8d8f92' }}>
      {/* scanner bed + paper */}
      <div style={{
        position: 'absolute', left: 38, top: 30, width: 1624, height: 2140, background: '#f6f3ea', transform: 'rotate(-0.55deg)',
        boxShadow: '0 4px 18px rgba(0,0,0,0.35)', fontFamily: 'Inter, Arial, sans-serif', color: PRINT, overflow: 'hidden',
      }}>
        <div style={{ padding: '64px 100px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: `4px solid ${PRINT}`, paddingBottom: 18 }}>
            <div>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '0.08em' }}>FRANKLIN BAKER – DARONG · WWTP</div>
              <div style={{ fontSize: 50, fontWeight: 800, marginTop: 6 }}>Preventive Maintenance Job Sheet</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 20, color: '#4a5056' }}>Maintenance Dept.<br />Page 1 of 1</div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 34 }}>
            <tbody>
              {[
                ['Asset ID', <Hand key="a" size={60}>P-101A</Hand>, 'Date', <Hand key="d">28 Nov 2026</Hand>],
                ['Description', <Hand key="b">EQ transfer pump A</Hand>, 'Location', <Hand key="l">W05 · EQ transfer</Hand>],
                ['PM task', <Hand key="t">Alignment + coupling check</Hand>, 'Time', <Hand key="tm">07:30 – 09:10</Hand>],
                ['Technician', <Hand key="k">Ken · MT-02</Hand>, 'Assigned by', <Hand key="s">Lemuel · PS-01</Hand>],
              ].map((r, i) => (
                <tr key={i}>
                  <td style={{ ...cell, width: 230 }}><span style={label}>{r[0] as string}</span></td>
                  <td style={{ ...cell, height: 72 }}>{r[1]}</td>
                  <td style={{ ...cell, width: 200 }}><span style={label}>{r[2] as string}</span></td>
                  <td style={{ ...cell, width: 380 }}>{r[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>A. Checklist</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#e6e2d6' }}>
                <th style={{ ...cell, width: 60, fontSize: 20 }}>#</th>
                <th style={{ ...cell, textAlign: 'left', fontSize: 20 }}>Item</th>
                {['OK', 'Not OK', 'N/A'].map(h => <th key={h} style={{ ...cell, width: 100, fontSize: 20 }}>{h}</th>)}
                <th style={{ ...cell, width: 330, textAlign: 'left', fontSize: 20 }}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {CHECKS.map(([item, rem], i) => (
                <tr key={i}>
                  <td style={{ ...cell, textAlign: 'center', fontSize: 22 }}>{i + 1}</td>
                  <td style={{ ...cell, fontSize: 23, height: 60 }}>{item}</td>
                  <td style={{ ...cell, textAlign: 'center' }}><Tick v={(i * 3) % 4 - 1.5} /></td>
                  <td style={cell} />
                  <td style={cell} />
                  <td style={cell}>{rem && <Hand size={42} rot={(i % 3) - 1.5}>{rem}</Hand>}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>B. Readings (after test run)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#e6e2d6' }}>
                <th style={{ ...cell, textAlign: 'left', fontSize: 20 }}>Parameter</th>
                <th style={{ ...cell, textAlign: 'left', fontSize: 20, width: 420 }}>Limit</th>
                <th style={{ ...cell, fontSize: 20, width: 300 }}>Reading</th>
              </tr>
            </thead>
            <tbody>
              {READINGS.map(([k, lim, v], i) => (
                <tr key={k}>
                  <td style={{ ...cell, fontSize: 23, height: 62 }}>{k}</td>
                  <td style={{ ...cell, fontSize: 21, color: '#4a5056' }}>{lim}</td>
                  <td style={{ ...cell, textAlign: 'center' }}><Hand size={58} rot={i % 2 ? 1.5 : -2}>{v}</Hand></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>C. Findings / remarks</div>
          <div style={{ position: 'relative', height: 216, border: `2px solid ${PRINT}`, padding: '8px 22px' }}>
            {[0, 1, 2, 3].map(i => <div key={i} style={{ position: 'absolute', left: 22, right: 22, top: 66 + i * 58, borderBottom: '1.5px solid #b9b4a6' }} />)}
            <div style={{ position: 'relative', lineHeight: '58px' }}>
              <Hand size={46} rot={-0.6}>DE bearing housing re-greased, coupling insert OK.</Hand><br />
              <Hand size={46} rot={-0.4}>Alignment within 0.05 mm. Vib DE down to 2.1 mm/s — good.</Hand><br />
              <Hand size={46} rot={-0.8}>Photos attached (2). OK to return P-101A to duty rotation.</Hand>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 40, marginTop: 36 }}>
            {[['Performed by (Technician)', 'Ken · MT-02', true], ['Reviewed by (Engineer)', '', false]].map(([h, who, signed]) => (
              <div key={h as string} style={{ flex: 1 }}>
                <div style={label}>{h as string}</div>
                <div style={{ position: 'relative', height: 104, borderBottom: `2px solid ${PRINT}` }}>
                  {signed && (
                    <svg width={420} height={120} viewBox="0 0 420 120" style={{ position: 'absolute', left: 10, top: 0 }}>
                      <path d="M10 86 C 30 20, 60 20, 52 70 C 46 100, 80 40, 110 52 C 130 60, 120 92, 150 80 C 180 66, 190 40, 214 56 C 236 70, 220 96, 262 84 C 300 72, 330 60, 400 66"
                        fill="none" stroke={INK} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  {who && <Hand size={44} style={{ position: 'absolute', right: 10, bottom: 10 }}>{who as string}</Hand>}
                </div>
                <div style={{ fontSize: 19, color: '#4a5056', marginTop: 8 }}>Name · signature · date {signed && <Hand size={38}>&nbsp;28/11/26</Hand>}</div>
              </div>
            ))}
          </div>
        </div>
        {/* scanner texture: noise, uneven light, faint fold */}
        <svg width={1624} height={2140} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <defs>
            <filter id="js-noise"><feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves={2} seed={11} /><feColorMatrix type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.32  0 0 0 0 0.25  0 0 0 0.6 0" /></filter>
            <linearGradient id="js-light" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#000" stopOpacity={0.08} /><stop offset="0.12" stopColor="#000" stopOpacity={0} />
              <stop offset="0.9" stopColor="#000" stopOpacity={0} /><stop offset="1" stopColor="#000" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <rect width={1624} height={2140} filter="url(#js-noise)" opacity={0.18} />
          <rect width={1624} height={2140} fill="url(#js-light)" />
          <rect x={0} y={1068} width={1624} height={3} fill="#000" opacity={0.05} />
          <circle cx={1500} cy={1960} r={60} fill="#a08860" opacity={0.06} />
        </svg>
      </div>
    </AbsoluteFill>
  );
}
