/** GearCast backend client (Vite proxies /api → :8000). */
import { useStatusStore } from '../store/statusStore';

/** The user's simulated status changes, sent with AI requests so answers match what the UI shows. */
export function simPayload() {
  const { overrides, roleOverrides } = useStatusStore.getState();
  return { overrides, roleOverrides };
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function check(r: Response) {
  if (!r.ok) {
    let msg = r.statusText;
    try { const j = await r.json(); msg = j.detail ?? msg; } catch { /* not json */ }
    throw new ApiError(r.status, typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return r;
}

export async function getJSON<T>(url: string): Promise<T> {
  return (await check(await fetch(url))).json();
}

export async function postJSON<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  return (await check(r)).json();
}

export async function postBlob(url: string, body: unknown): Promise<Blob> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return (await check(r)).blob();
}

export async function del(url: string) {
  await check(await fetch(url, { method: 'DELETE' }));
}

export async function upload<T>(url: string, form: FormData): Promise<T> {
  return (await check(await fetch(url, { method: 'POST', body: form }))).json();
}

/** POST and parse a text/event-stream response (`data: {json}` frames). */
export async function streamSSE(url: string, body: unknown, onEvent: (e: any) => void, signal?: AbortSignal) {
  const r = await check(await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(body), signal,
  }));
  const reader = r.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, i);
      buf = buf.slice(i + 2);
      for (const line of frame.split('\n')) {
        if (line.startsWith('data: ')) {
          try { onEvent(JSON.parse(line.slice(6))); } catch { /* ignore bad frame */ }
        }
      }
    }
  }
}

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
