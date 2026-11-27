// Runner for agent 5b's phone/tablet shots. Usage (server on 8791, reset first):
//   CAPTURE_PORT=8791 CAPTURE_INSPECTOR_PORT=9241 CAPTURE_STATE=$PWD/video/capture/.state-b video/capture/reset.sh
//   CAPTURE_PORT=8791 node video/capture/shots/mobile/run-mobile.mjs [03-a|05-a|05-b|06-a|07-a|11-a ...]
// Each shot writes video/public/captures/<shot>.webm|.mp4|.json.
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ILLU } from './common.mjs';

process.env.CAPTURE_PORT ||= '8791';
const ALL = ['03-a', '05-a', '05-b', '06-a', '07-a', '11-a'];
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
for (const id of ids) {
  console.log(`== ${id}`);
  const mod = (await import(`./${id}.mjs`)).default;
  if (id === '03-a') {
    const cam = path.join(process.env.TMPDIR || '/tmp', 'gearcast-qr-cam.y4m');
    if (!fs.existsSync(cam) || fs.statSync(cam).mtimeMs < fs.statSync(path.join(ILLU, 'qr-label.png')).mtimeMs)
      execFileSync('python3', [path.join(import.meta.dirname, 'make_fake_cam.py'), path.join(ILLU, 'qr-label.png'), cam], { stdio: 'inherit' });
    await mod(cam);
  } else await mod();
}
