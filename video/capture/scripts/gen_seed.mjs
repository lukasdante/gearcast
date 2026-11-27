// Builds the local-only seed SQL for the capture environment:
//   - plants: the app's default layout (buildDefaultPlant() from app/src/domain/layout.ts, bundled with esbuild so it is
//     byte-for-byte what the app seeds) and the demo-only "Plant 2" (small sister site, no tracked assets).
//   - resets the story state tables (approvals, assignments, access, scans, incidents, uploads, usage).
// Output: video/capture/.gen/seed.sql
import { build } from '../../../worker/node_modules/esbuild/lib/main.js';
import { mkdirSync, writeFileSync } from 'node:fs';

const here = new URL('./', import.meta.url).pathname;
const root = new URL('../../../', import.meta.url).pathname;
const gen = new URL('../.gen/', import.meta.url).pathname;
mkdirSync(gen, { recursive: true });

// models/registry pulls in the React/three model components; layout.ts only needs footprint/height/ports from META.
const stubRegistry = {
  name: 'stub-registry',
  setup(b) {
    b.onResolve({ filter: /models\/registry$/ }, () => ({ path: 'registry-stub', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      resolveDir: root + 'app/src/models',
      contents: "import { META } from './kinds/meta'; export const getKind = k => ({ kind: k, ...META[k] });",
      loader: 'js',
    }));
  },
};
const out = gen + 'layout.mjs';
await build({
  stdin: { contents: "export { buildDefaultPlant } from './domain/layout';", resolveDir: root + 'app/src', loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', outfile: out, plugins: [stubRegistry], logLevel: 'error',
});
const { buildDefaultPlant } = await import(out);
const def = buildDefaultPlant();

// ---- Plant 2: a small sister WWTP (structures only + two unbound transfer pumps; no dataset asset ids, so it can't
// change any status, KPI or story number at the home plant).
const item = (id, kind, label, x, z, extra = {}) => ({ id, kind, label, position: [x, z], rotationY: 0, ...extra });
const pipe = (from, to, flow = 'wastewater') => ({ id: `pipe-${from}-${to}`, from: { itemId: from, port: 'out' }, to: { itemId: to, port: 'in' }, flow });
const plant2 = {
  id: 'plant-2',
  name: 'Plant 2',
  items: [
    item('p2-bld', 'building', 'Plant 2 process hall', -22, -10, { props: { nodeId: 'PRODUCTION' }, rotationY: -Math.PI / 2 }),
    item('p2-sump', 'sump', 'Plant 2 collection sump', -16, 0),
    item('p2-tank', 'tank', 'Plant 2 equalization tank', -6, 0),
    item('p2-pump-a', 'pump_end_suction', 'P2 transfer pump A', 2, -1.0),
    item('p2-pump-b', 'pump_end_suction', 'P2 transfer pump B', 2, 1.0),
    item('p2-reactor', 'bio_reactor', 'Plant 2 biological reactor', 11, 0),
    item('p2-clar', 'clarifier', 'Plant 2 clarifier', 22, 0),
    item('p2-out', 'discharge', 'Plant 2 discharge', 31, 0),
  ],
  pipes: [
    pipe('p2-bld', 'p2-sump'), pipe('p2-sump', 'p2-tank'), pipe('p2-tank', 'p2-pump-a'), pipe('p2-tank', 'p2-pump-b'),
    pipe('p2-pump-a', 'p2-reactor'), pipe('p2-pump-b', 'p2-reactor'), pipe('p2-reactor', 'p2-clar'), pipe('p2-clar', 'p2-out'),
    pipe('p2-clar', 'p2-reactor', 'sludge'),
  ],
};

const q = s => "'" + String(s).replace(/'/g, "''") + "'";
const SEED_AT = process.env.SEED_AT || '2026-11-27 18:00'; // display-only "updated" stamp of the seeded layouts
const sql = [
  // story state starts empty every take
  'DELETE FROM approvals;', 'DELETE FROM plant_access;', 'DELETE FROM plants;', 'DELETE FROM scan_log;',
  'DELETE FROM incidents;', 'DELETE FROM docs;', 'DELETE FROM upload_chunks;', 'DELETE FROM usage;',
  "DELETE FROM kv WHERE k IN ('pm_assign', 'uploads');",
  `INSERT INTO plants (id, seq, name, doc, updated_at, updated_by) VALUES ('default', 1, ${q(def.name)}, ${q(JSON.stringify(def))}, ${q(SEED_AT)}, 'PS-01');`,
  `INSERT INTO plants (id, seq, name, doc, updated_at, updated_by) VALUES ('plant-2', 2, ${q(plant2.name)}, ${q(JSON.stringify(plant2))}, ${q(SEED_AT)}, 'PS-01');`,
];
writeFileSync(gen + 'seed.sql', sql.join('\n') + '\n');
console.log(`wrote .gen/seed.sql (default: ${def.items.length} items / ${def.pipes.length} pipes; plant-2: ${plant2.items.length} items / ${plant2.pipes.length} pipes)`);
void here;
