/** QR decoding from a camera frame / image: the browser's native BarcodeDetector where it exists (Chrome on Android,
 *  Safari 17+ on iOS…), else jsQR (pure JS, loaded on demand). */

interface Detector { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> }
declare global { interface Window { BarcodeDetector?: { new(o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } } }

let native: Promise<Detector | null> | null = null;
function nativeDetector(): Promise<Detector | null> {
  if (!native) {
    native = (async () => {
      const BD = window.BarcodeDetector;
      if (!BD) return null;
      try {
        const formats = BD.getSupportedFormats ? await BD.getSupportedFormats() : ['qr_code'];
        return formats.includes('qr_code') ? new BD({ formats: ['qr_code'] }) : null;
      } catch { return null; }
    })();
  }
  return native;
}

type JsQR = typeof import('jsqr').default;
let jsqr: Promise<JsQR> | null = null;
const loadJsQR = () => (jsqr ??= import('jsqr').then(m => m.default));

export type Engine = 'native' | 'jsqr';
export async function engine(): Promise<Engine> { return (await nativeDetector()) ? 'native' : 'jsqr'; }

const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;

/** Decode one frame (video or image). Returns the QR text, or null. `force` = use that engine. */
export async function decodeFrame(src: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageBitmap, force?: Engine): Promise<string | null> {
  const det = force === 'jsqr' ? null : await nativeDetector();
  if (det) {
    try { const r = await det.detect(src); if (r[0]?.rawValue) return r[0].rawValue; } catch { /* fall through to jsQR */ }
    if (force === 'native') return null;
  }
  const w = 'videoWidth' in src ? src.videoWidth : 'naturalWidth' in src ? src.naturalWidth : src.width;
  const h = 'videoHeight' in src ? src.videoHeight : 'naturalHeight' in src ? src.naturalHeight : src.height;
  if (!w || !h || !canvas) return null;
  // downscale big frames: jsQR cost grows with pixels, 720 px is plenty for a label held at arm's length
  const k = Math.min(1, 720 / Math.max(w, h));
  canvas.width = Math.round(w * k); canvas.height = Math.round(h * k);
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(src, 0, 0, canvas.width, canvas.height);
  const img = g.getImageData(0, 0, canvas.width, canvas.height);
  const decode = await loadJsQR();
  return decode(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })?.data || null;
}

/** Decode a photo of a label (file input fallback when the live camera is not available, e.g. plain http). */
export async function decodeFile(f: File): Promise<string | null> {
  const bmp = await createImageBitmap(f);
  try { return await decodeFrame(bmp); } finally { bmp.close(); }
}
