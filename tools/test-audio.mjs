#!/usr/bin/env node
// Physics + sanity tests for js/audio.js. Pure Node, no packages, no browser.
// Run: node tools/test-audio.mjs
//
// What this checks, in order:
//   1. The dimensional-descent recursion G_4 = -(1/2 pi r) dG_2/dr, verified
//      against an INDEPENDENT reimplementation of G_2 (not importing audio.js's
//      internals) and the closed-form tail formula audio.js derives from it.
//   2. The front's peak amplitude really falls off as r^-3/2.
//   3. The post-front tail: its sign, its decay, and the ratio
//      "amplitude ~5ms after the front" / "front peak" at r = 2, 10, 50 m --
//      checked against a prior back-of-envelope guess of ~0.7%.
//   4. buildTailIR() (the function the WebAudio engine actually calls) is
//      consistent with the ground-truth p4Response/frontPeak used above.
//   5. Both module files parse (`node --check`).
//   6. createAudio() is safe to construct and drive with zero WebAudio
//      present (as it must be under Node, and in a browser before unlock()).

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as audio from '../js/audio.js';

const { C_SOUND, raisedCosinePulse, p2Response, p4Response, tailClosedForm, frontPeak, buildTailIR, createAudio } = audio;

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
}

console.log('=== 1. Green\'s function derivation ===');
console.log(`
  Seed (2D):     G_2(t,r) = theta(ct-r) / (2 pi c sqrt(c^2 t^2 - r^2))
  Recursion:     G_{n+2}(t,r) = -(1/(2 pi r)) dG_n/dr
  Result (4D), for t > r/c:
    G_4(t,r) = (1/(4 pi^2 c r)) delta(ct-r)(c^2t^2-r^2)^-1/2   [regularise: the cone]
             - (1/(4 pi^2 c))   (c^2t^2-r^2)^-3/2                [[TAIL, this is what we sample]]
`);

// Independent reimplementation of G_2, deliberately NOT sharing code with
// audio.js, so this test can't just be checking a function against itself.
function G2_ref(t, r, c) {
  const u = c * c * t * t - r * r;
  if (t <= r / c || u <= 0) return 0;
  return 1 / (2 * Math.PI * c * Math.sqrt(u));
}

{
  // Pick a point safely inside the cone (away from the t=r/c singularity)
  // and check -(1/2 pi r) dG2/dr, via central finite difference on G2_ref,
  // against the closed-form tail audio.js's header derives (the delta/cone
  // term is exactly zero away from t=r/c, so only the tail term survives).
  const c = C_SOUND, r = 20, t = (r / c) * 1.6; // 60% further into the cone than the arrival time
  const dr = 1e-4;
  const dG2dr = (G2_ref(t, r + dr, c) - G2_ref(t, r - dr, c)) / (2 * dr);
  const G4_viaRecursion = -(1 / (2 * Math.PI * r)) * dG2dr;
  const tau = t - r / c;
  const G4_viaClosedForm = tailClosedForm(tau, r, c);
  const relErr = Math.abs(G4_viaRecursion - G4_viaClosedForm) / Math.abs(G4_viaClosedForm);
  console.log(`  at r=${r}m, t=1.6*r/c: recursion=${G4_viaRecursion.toExponential(6)}  closed-form=${G4_viaClosedForm.toExponential(6)}  relErr=${relErr.toExponential(2)}`);
  check('G_4 recursion matches closed-form tail away from the cone', relErr < 1e-4);
}

console.log('\n=== 2. Front peak amplitude ~ r^-3/2 ===');
{
  const pulseDur = 0.001; // 1 ms synthesized click
  const pulse = raisedCosinePulse(pulseDur);
  const rs = [2, 5, 10, 20, 50, 100, 200, 400];
  const pts = [];
  console.log('  r (m)   front peak (band-limited, arb. units)   arrival+offset (ms)');
  for (const r of rs) {
    const { peak, t } = frontPeak(r, pulseDur, C_SOUND, pulse);
    console.log(`  ${String(r).padStart(5)}   ${peak.toExponential(4).padStart(12)}                          ${((t - r / C_SOUND) * 1e3).toFixed(3)}`);
    pts.push([Math.log(r), Math.log(Math.abs(peak))]);
  }
  const n = pts.length;
  const sx = pts.reduce((a, p) => a + p[0], 0), sy = pts.reduce((a, p) => a + p[1], 0);
  const sxx = pts.reduce((a, p) => a + p[0] * p[0], 0), sxy = pts.reduce((a, p) => a + p[0] * p[1], 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  console.log(`  fitted log-log slope = ${slope.toFixed(4)}  (theory: -1.5, exact as k r -> infinity)`);
  check('front peak falls off close to r^-3/2', Math.abs(slope - (-1.5)) < 0.05, `slope=${slope.toFixed(4)}`);
}

console.log('\n=== 3. Post-front tail: sign, decay, and size relative to the front ===');
{
  const pulseDur = 0.001;
  const pulse = raisedCosinePulse(pulseDur);
  console.log('  r (m)   front peak        tail @5ms         tail/peak     prior guess was ~0.7%');
  let allNegative = true;
  for (const r of [2, 10, 50]) {
    const t0 = r / C_SOUND;
    const { peak } = frontPeak(r, pulseDur, C_SOUND, pulse);
    const v5 = p4Response(t0 + 0.005, r, pulse, pulseDur, C_SOUND);
    const ratio = v5 / peak;
    if (ratio > 0) allNegative = false;
    console.log(`  ${String(r).padStart(5)}   ${peak.toExponential(4)}   ${v5.toExponential(4)}   ${(ratio * 100).toFixed(3)}%`);
  }
  check('tail at +5ms has a consistent (negative, rarefaction) sign at r=2,10,50', allNegative);

  // decay trend: sample the tail at several widely-spaced tau and check it
  // is monotonically shrinking in magnitude (no spurious growth).
  const r = 20, t0 = r / C_SOUND;
  const taus = [0.003, 0.01, 0.03, 0.1, 0.3];
  const vals = taus.map(tau => Math.abs(p4Response(t0 + tau, r, pulse, pulseDur, C_SOUND)));
  let decaying = true;
  for (let i = 1; i < vals.length; i++) if (vals[i] >= vals[i - 1]) decaying = false;
  console.log(`  decay check at r=${r}m, |tail| at tau=${taus.join(',')}s:`, vals.map(v => v.toExponential(2)).join('  '));
  check('tail magnitude decays monotonically with time after the front', decaying);

  // Note on the near-front structure: within about one pulse-width of the
  // peak there is a much larger (order the front peak itself) opposite-sign
  // lobe -- the band-limited signature of the half-derivative-like spectral
  // tilt (differentiating a smooth bump makes it biphasic). That lobe is
  // physically part of the "front complex", not the long-time reverberant
  // tail the brief asks about; it is still captured faithfully because
  // buildTailIR() samples the full p4Response, not just the asymptotic tail.
  const { peak: peakNear } = frontPeak(r, pulseDur, C_SOUND, pulse);
  let minV = 0, minTau = 0;
  for (let i = 0; i < 1000; i++) {
    const tau = i * 0.000005;
    const v = p4Response(t0 + tau, r, pulse, pulseDur, C_SOUND);
    if (v < minV) { minV = v; minTau = tau; }
  }
  console.log(`  (near-front biphasic undershoot at r=${r}m: ${(minV / peakNear * 100).toFixed(1)}% of front peak, at tau=${(minTau * 1e3).toFixed(2)}ms -- expected, see comment)`);
}

console.log('\n=== 4. buildTailIR() consistency with the ground-truth recursion ===');
{
  const sr = 44100, pulseDur = 0.001;
  const pulse = raisedCosinePulse(pulseDur);
  let ok = true;
  for (const r of [3, 12, 48, 192]) {
    const ir = buildTailIR(sr, r);
    const { peak } = frontPeak(r, pulseDur, C_SOUND, pulse);
    // spot-check a handful of samples well past the fade-in window
    for (const ms of [2, 5, 20]) {
      const i = Math.round((ms / 1000) * sr);
      const expected = p4Response(r / C_SOUND + i / sr, r, pulse, pulseDur, C_SOUND, null, 48) / peak;
      const got = ir[i];
      const diff = Math.abs(got - expected);
      if (diff > 1e-6 * Math.max(1, Math.abs(expected))) ok = false;
    }
    const peakAbs = Math.max(...ir.map(Math.abs));
    console.log(`  r=${String(r).padStart(4)}m  IR len=${ir.length} (${(ir.length / sr).toFixed(3)}s)  max|IR|=${peakAbs.toFixed(4)}`);
  }
  check('buildTailIR samples match p4Response/frontPeak exactly (same formula, by design)', ok);
}

console.log('\n=== 5. Module syntax ===');
{
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const f of ['../js/audio.js', 'test-audio.mjs']) {
    try {
      execFileSync(process.execPath, ['--check', path.join(here, f)], { stdio: 'pipe' });
      check(`node --check ${f}`, true);
    } catch (e) {
      check(`node --check ${f}`, false, e.message);
    }
  }
}

console.log('\n=== 6. createAudio() is Node-safe (no WebAudio present) ===');
{
  let ok = true, err = '';
  try {
    const eng = createAudio();
    eng.setVolumes({ sound: 0.5, music: 0.5 });
    eng.update(0.016, { pos: [0, 0, 0, 0], R: [0, 0, 1, 0], wind: 0.3, water: 0, sea: 0 });
    eng.unlock();            // no `window`/AudioContext under Node -> must be a safe no-op
    eng.step([1, 0, 0, 0], 'grass');
    eng.emit('thud', [1, 0, 0, 0], 1);
    eng.cue('copies');
    eng.stopMusic();
    const d = eng.debug;
    ok = d.contextState === 'uninitialized' && d.activeVoices === 0;
  } catch (e) {
    ok = false; err = e.stack;
  }
  check('createAudio()/unlock()/emit()/cue() etc. do not throw without WebAudio', ok, err);
}

console.log(`\n${failures === 0 ? 'All checks passed.' : failures + ' CHECK(S) FAILED.'}`);
process.exit(failures === 0 ? 0 : 1);
