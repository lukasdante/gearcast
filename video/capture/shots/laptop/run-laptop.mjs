// Runner for the laptop shots (agent 5a). Resets the capture server before every shot, runs any prep, records.
//   node video/capture/shots/laptop/run-laptop.mjs            # all shots
//   node video/capture/shots/laptop/run-laptop.mjs 04-a 07-b  # some
//   NO_RESET=1 ...                                           # skip reset.sh (iterating)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch, reset } from './cap.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ALL = ['02-a', '04-a', '06-b', '07-b', '08-a', '09-a', '10-a', '10-b', '11-b', '12-a', '13-a', '13-b', '13-c'];
const want = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
let failed = 0;
for (const id of want) {
  const file = path.join(here, `${id}.mjs`);
  if (!fs.existsSync(file)) { console.log(`skip ${id}: no script`); continue; }
  if (!process.env.NO_RESET) { process.stdout.write(`reset for ${id}… `); reset(); console.log('ok'); }
  const browser = await launch();
  try { await (await import(pathToFileURL(file).href)).default(browser); }
  catch (e) { failed++; console.error(`${id} FAILED: ${e.stack || e}`); }
  finally { await browser.close(); }
}
process.exit(failed ? 1 : 0);
