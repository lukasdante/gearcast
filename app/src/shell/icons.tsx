/** Minimal stroke icons (24px grid). */
const P: Record<string, string> = {
  dashboard: 'M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 4v4h6V4z',
  plant: 'M3 20h18M5 20V10l5 3V10l5 3V6h4v14',
  assets: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  pm: 'M8 3v3M16 3v3M4 8h16M5 5h14v15H5zM9 14l2 2 4-4',
  spares: 'M4 7l8-4 8 4-8 4zM4 12l8 4 8-4M4 17l8 4 8-4',
  incidents: 'M12 4l9 16H3zM12 10v4M12 17v.5',
  bell: 'M6 16V11a6 6 0 1112 0v5l2 2H4zM10 20a2 2 0 004 0',
  chat: 'M4 5h16v11H9l-5 4z',
  close: 'M6 6l12 12M18 6L6 18',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  rotate: 'M20 12a8 8 0 11-2.3-5.6M20 4v5h-5',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  pipe: 'M4 8h8a4 4 0 014 4v8M4 4v8M12 20h8',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  plus: 'M12 5v14M5 12h14',
  cursor: 'M5 3l14 7-6 2-2 6z',
  chevron: 'M9 6l6 6-6 6',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  send: 'M4 12l16-8-6 16-3-7z',
  check: 'M5 12l5 5 9-10',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
  cycle: 'M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16M8 16H3v5',
  swap: 'M7 7h12l-3-3M17 17H5l3 3',
  wrench: 'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94z',
  scale: 'M12 4v16M7 20h10M5 8h14M5 8l-3 6a3 3 0 006 0zM19 8l-3 6a3 3 0 006 0z',
  book: 'M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h10',
  print: 'M7 9V4h10v5M7 17H5v-7h14v7h-2M8 14h8v6H8z',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  spark: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
};

export function Icon({ name, size = 16, stroke = 1.7 }: { name: keyof typeof P | string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] ?? ''} />
    </svg>
  );
}
