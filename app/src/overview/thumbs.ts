/** 3D snapshots rendered to public/models/thumbs/<kind>.png (keys only; nothing is imported). */
export const THUMBS = new Set(
  Object.keys(import.meta.glob('/public/models/thumbs/*.png', { query: '?url', import: 'default' }))
    .map(k => k.split('/').pop()!.replace(/\.png$/, '')),
);
export const thumbUrl = (kind: string) => (THUMBS.has(kind) ? `/models/thumbs/${kind}.png` : null);
