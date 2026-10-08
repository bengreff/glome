// Headless Chrome driver for testing Glome.
//   node tools/cdp.mjs <url> <outPrefix> '<steps json>' [--gpu]
// Steps: [{ "eval": "<js expression>", "wait": ms, "snap": "name" }, ...], run in order after the world loads.
// Without --gpu it uses SwiftShader (software, deterministic, slow) at 1280×800 dpr 1. With --gpu it uses the real
// GPU through Metal at 1512×982 dpr 2 (a 14" MacBook Pro screen): use that for performance numbers.
// Wrap long runs in a watchdog: an eval that awaits requestAnimationFrame can hang in headless mode.
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const args = process.argv.slice(2), gpu = args.includes('--gpu');
const [url, out, stepsArg] = args.filter(a => a !== '--gpu');
const profile = mkdtempSync(join(tmpdir(), 'glome-chrome-'));
const port = +(process.env.CDP_PORT || (gpu ? 9335 : 9333));
const size = gpu ? { width: 1512, height: 982, deviceScaleFactor: 2 } : { width: 1280, height: 800, deviceScaleFactor: 1 };
const flags = gpu ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', ...flags, `--remote-debugging-port=${port}`, `--window-size=${size.width},${size.height}`,
  `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
process.on('SIGTERM', () => { cleanup(); process.exit(1); });
process.on('SIGINT', () => { cleanup(); process.exit(1); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch {} await sleep(200); }
const page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(); const logs = [];
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description).join(' '));
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJS = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { ...size, mobile: false });
await send('Page.navigate', { url });
for (let i = 0; i < 150; i++) { await sleep(400); if (await evalJS("!!(window.__glome || window.__hoop) || !document.getElementById('error').hidden")) break; }
const steps = stepsArg ? JSON.parse(stepsArg) : [];
const snap = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${out}-${name}.png`, Buffer.from(r.result.data, 'base64')); };
await sleep(3000); await snap('start');
for (const s of steps) {
  if (s.eval) console.log('eval:', JSON.stringify(await evalJS(s.eval)));
  if (s.wait) await sleep(s.wait);
  if (s.snap) await snap(s.snap);
}
console.log('status:', JSON.stringify(await evalJS("({err: document.getElementById('error').hidden ? null : document.getElementById('error-msg').textContent, hud: document.getElementById('hud').innerText})")));
console.log(logs.slice(0, 30).join('\n'));
ws.close(); cleanup(); process.exit(0);
