/**
 * Procedural canvas textures, created lazily once and shared (never disposed).
 * Per-instance repeat/offset: call `.clone()` — clones share the GPU upload (same Source).
 */
import * as THREE from 'three';

const cache = new Map<string, THREE.Texture>();

function canvasTex(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, color = true): THREE.Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

/** Soft radial glow (for status lamps / halos). */
export const glowTexture = () =>
  canvasTex('glow', 64, 64, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });

/** Bar grating alpha map: dense bearing bars + sparse cross bars. One tile ≈ 0.25 m. */
export const gratingTexture = () =>
  canvasTex('grating', 64, 64, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#fff';
    for (let x = 0; x < 64; x += 8) ctx.fillRect(x, 0, 2, 64);
    for (let y = 0; y < 64; y += 32) ctx.fillRect(0, y, 64, 3);
  }, false);

/** Woven screen mesh alpha map (square aperture). */
export const meshTexture = () =>
  canvasTex('mesh', 32, 32, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 32; i += 8) {
      ctx.fillRect(i, 0, 3, 32);
      ctx.fillRect(0, i, 32, 3);
    }
  }, false);

/** Tileable ripple normal map (sum of integer-frequency waves). */
export const waterNormalTexture = () =>
  canvasTex('waterN', 128, 128, (ctx, w, h) => {
    const waves = [
      [1, 2, 0.5, 0.3], [3, -1, 0.35, 1.7], [-2, 3, 0.3, 4.1], [5, 4, 0.18, 2.2], [-6, 5, 0.14, 0.9], [7, -3, 0.12, 5.3], [2, 9, 0.08, 3.3],
    ];
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let dx = 0, dy = 0;
        const u = x / w, v = y / h;
        for (const [fx, fy, a, ph] of waves) {
          const c = Math.cos(2 * Math.PI * (fx * u + fy * v) + ph) * a * 2 * Math.PI;
          dx += c * fx;
          dy += c * fy;
        }
        const k = 0.045;
        let nx = -dx * k, ny = -dy * k, nz = 1;
        const l = Math.hypot(nx, ny, nz);
        nx /= l; ny /= l; nz /= l;
        const i = (y * w + x) * 4;
        img.data[i] = (nx * 0.5 + 0.5) * 255;
        img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
        img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
        img.data[i + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
  }, false);

/** Low-contrast mottling for concrete (multiplies base colour). */
export const noiseTexture = () =>
  canvasTex('noise', 128, 128, (ctx, w, h) => {
    // cheap smooth value noise: random grid, bilinear upscaling by the canvas
    const s = document.createElement('canvas');
    s.width = 16; s.height = 16;
    const sc = s.getContext('2d')!;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const v = 215 + rnd() * 40;
        sc.fillStyle = `rgb(${v},${v},${v})`;
        sc.fillRect(x, y, 1, 1);
      }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(s, 0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const v = 190 + rnd() * 65;
      ctx.fillStyle = `rgba(${v},${v},${v},0.35)`;
      ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
    }
  });

/** Trapezoidal-rib cladding shading (vertical ribs). */
export const claddingTexture = () =>
  canvasTex('clad', 64, 4, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, '#d8d8d8');
    g.addColorStop(0.18, '#ffffff');
    g.addColorStop(0.3, '#f2f2f2');
    g.addColorStop(0.42, '#bdbdbd');
    g.addColorStop(0.5, '#e6e6e6');
    g.addColorStop(1, '#e9e9e9');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 4);
  });

/** V-notch weir plate alpha (one notch per tile, notch at top). */
export const notchTexture = () =>
  canvasTex('notch', 32, 32, (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(16, 14);
    ctx.lineTo(28, 0);
    ctx.fill();
  }, false);

/** Horizontal fade (white→transparent) for slurry film etc. */
export const fadeTexture = () =>
  canvasTex('fade', 64, 4, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, '#fff');
    g.addColorStop(0.55, '#9a9a9a');
    g.addColorStop(1, '#000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 4);
  }, false);

/** Diagonal hazard stripes (black/yellow) for floor marking & roll-up door bottom bars. */
export const hazardTexture = () =>
  canvasTex('hazard', 32, 32, (ctx) => {
    ctx.fillStyle = '#c99a2e';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#1a1a1a';
    for (let i = -32; i < 64; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 8, 0);
      ctx.lineTo(i + 8 - 32, 32);
      ctx.lineTo(i - 32, 32);
      ctx.fill();
    }
  });

/** Horizontal slats (roll-up door). */
export const slatTexture = () =>
  canvasTex('slat', 4, 32, (ctx) => {
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, 0, 4, 32);
    ctx.fillStyle = '#9a9a9a';
    ctx.fillRect(0, 0, 4, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 3, 4, 2);
  });
