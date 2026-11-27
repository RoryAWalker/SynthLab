// Pictures of each of the NF-ModRack's modules, for the module drawer (img/modules/<type>.webp).
// Opens the rack in a headless Chrome (a throwaway profile), puts each module in on its own, and
// photographs it. Start the local server first (python3 -m http.server 8660), then:
//   node tools/make-module-pictures.mjs [http://localhost:8660]

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const URL_BASE = process.argv[2] || 'http://localhost:8660';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9388;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'img', 'modules');
mkdirSync(out, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'modpics-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--window-size=2400,1500', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ }
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const waiting = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r) => { const n = ++id; waiting.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  const run = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.result.value;

  await send('Page.navigate', { url: `${URL_BASE}/?synth=modrack&preview=1` });
  await sleep(2500);
  const types = await run(`import('/js/synths/modrack.js').then((m) => m.DRAWER.flatMap(([, t]) => t))`);
  for (const type of types) {
    // the module on its own in the top row (with the Output, which is always there), loaded as a saved patch
    await run(`(async () => {
      localStorage.setItem('modrack.userPatches', JSON.stringify({ pic: { 'rack.layout': '${type}1|out|' } }));
      location.reload();
    })()`);
    await sleep(1800);
    await run(`(() => { const s = document.getElementById('preset'); s.value = 'u:pic'; s.dispatchEvent(new Event('change')); })()`);
    await sleep(700);
    const box = await run(`(() => { const r = document.querySelector('.section[data-section="${type}1"]').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`);
    // every module photographed at the same scale (1.2 picture pixels per panel pixel), so they all
    // show at their true sizes side by side, equally sharp (the drawer shows them at half that, on a
    // sharp screen)
    const scale = 1.2;
    const shot = await send('Page.captureScreenshot', { format: 'webp', quality: 82, clip: { ...box, scale } });
    writeFileSync(join(out, `${type}.webp`), Buffer.from(shot.result.data, 'base64'));
    console.log(`img/modules/${type}.webp`);
  }
  await run(`localStorage.removeItem('modrack.userPatches')`);
  ws.close();
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
