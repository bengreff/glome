// Glome spatial audio engine.
//
// This world has FOUR space dimensions, so sound really does behave
// differently from the 3D intuition built into every audio textbook:
//
//   1. A point source's energy spreads over a 3-SPHERE (area 2*pi^2*r^3,
//      not 4*pi*r^2), so pressure amplitude falls as r^(-3/2), not r^-1.
//
//   2. 4 is an EVEN number of space dimensions, so Huygens' principle
//      fails: the retarded Green's function is not a clean delta shell on
//      the light cone. A click is followed by a faint tail filling the
//      INSIDE of the cone (sound that "should" have arrived already keeps
//      dribbling in, decaying with time). Good(ish) 3D intuition: imagine
//      every click leaves a soft, fast-decaying "whisper of an echo" with
//      no single wall to have bounced off.
//
//   3. The front itself is not spectrally flat either: even dimensions
//      carry a mild high-frequency EMPHASIS on the leading edge (derived
//      below), the mirror image of the familiar "muffled distant thunder"
//      you'd expect from pure air absorption.
//
// ---------------------------------------------------------------------
// DERIVATION (see tools/test-audio.mjs for the numeric check of all this)
// ---------------------------------------------------------------------
// The retarded Green's function G_n(t,r) of the wave equation in n space
// dimensions obeys the dimensional-descent recursion
//
//      G_{n+2}(t,r) = -(1/(2*pi*r)) * d G_n(t,r) / dr
//
// starting from the 2D seed (we check its normalisation numerically):
//
//      G_2(t,r) = theta(c*t - r) / (2*pi*c*sqrt(c^2 t^2 - r^2))
//
// Differentiating once and applying the recursion with n=2 gives G_4:
//
//      d/dr [theta(ct-r)(c^2t^2-r^2)^-1/2]
//          = -delta(ct-r)(c^2t^2-r^2)^-1/2  +  theta(ct-r)*r*(c^2t^2-r^2)^-3/2
//
//      G_4(t,r) = (1/(4*pi^2*c*r)) * delta(ct-r)*(c^2t^2-r^2)^-1/2   [cone term]
//               - (1/(4*pi^2*c))   * theta(ct-r)*(c^2t^2-r^2)^-3/2    [TAIL]
//
// The first term is the sharp "front" -- but it's not an ordinary delta
// spike: delta(ct-r) multiplying something that itself blows up at ct=r is
// the classic signature of a DERIVATIVE-of-delta distribution. Physically
// that is exactly the half-derivative spectral tilt: in frequency space
// the outgoing 4D wave's transfer function is
//
//      G_4(r,omega) = (i/4) * (k/(2*pi*r)) * H_1^(1)(k r),   k = omega/c
//
// (H_1^(1) = Hankel function of the first kind, order 1 -- the general
// d-dimensional free Helmholtz Green's function is (i/4)(k/2pi r)^(d/2-1)
// H_(d/2-1)^(1)(kr); 4D has d/2-1 = 1). For k*r >> 1,
// H_1^(1)(x) ~ sqrt(2/(pi x)) e^{i(x - 3pi/4)}, so
//
//      G_4(r,omega) ~ sqrt(k) / r^(3/2) * e^{i k r}   (up to a constant phase)
//
// Compare the 3D case, G_3(r,omega) = e^{ikr}/(4*pi*r): flat in k, falls as
// 1/r. The 4D front therefore carries an EXTRA factor of sqrt(k) = sqrt(omega)/
// sqrt(c): higher frequencies arrive relatively louder than low ones -- a
// gentle high-shelf boost, not a cut. That is a genuinely unbounded
// (fractional, +3 dB/octave) filter; a real-time game engine approximates
// it with a modest, band-limited high-shelf (see TILT_DB/TILT_HZ below) --
// a deliberate, documented simplification, not a claim of exactness.
//
// The second term, the TAIL, is what we actually sample into the
// convolver impulse responses: for tau = t - r/c > 0 (time since the
// front arrived),
//
//      tail(tau,r) = -(1/(4*pi^2*c)) * (c*tau*(c*tau + 2r))^(-3/2)
//
// (using c^2t^2-r^2 = (ct-r)(ct+r) = c*tau*(c*tau+2r)). It is negative:
// after a sharp positive click, 4D space answers with a faint, decaying
// RAREFACTION, not another positive echo. It is also singular as tau->0+
// (merging with the cone term above) -- that singularity is an artifact of
// using an idealised delta-function source. A real source has some finite
// bandwidth/pulse width, and convolving a smooth pulse against this kernel
// gives a perfectly finite answer everywhere, including right at the
// front. That's the "physically meaningful object" the brief asks for, and
// it's what p2Response/p4Response below compute.
//
// ---------------------------------------------------------------------
// NUMERICAL METHOD for the band-limited response
// ---------------------------------------------------------------------
// Rather than fight the distributional cone term directly, we use the
// SAME recursion the physics uses: convolve the source pulse with G_2
// (whose singularity, r^(-1/2)-like, is merely integrable, not divergent),
// then take a finite difference in r to realise the -(1/2 pi r) d/dr step.
// Because convolution in t and differentiation in r commute (they're
// independent variables), this gives the exact band-limited G_4 response
// without ever evaluating an infinite quantity.
//
// The G_2 convolution integral,
//   p2(t,r) = integral_0^T pulse(T-x) * (2rcx + c^2x^2)^(-1/2) dx / (2 pi c),
//     T = t - r/c,
// has an integrable 1/sqrt(x) singularity at the wavefront x=0. Substituting
// x = y^2 (dx = 2y dy) removes it completely:
//   (2rcx+c^2x^2)^(-1/2) dx = y^-1 (2rc+c^2y^2)^(-1/2) * 2y dy
//                           = 2 (2rc+c^2y^2)^(-1/2) dy
// -- perfectly smooth in y, so a plain Simpson/trapezoid rule converges
// quickly. See p2Response() below.

export const C_SOUND = 343; // speed of sound, m/s

// A short, smooth, finite-support "click" used both as (a) the reference
// source whose response calibrates the front-peak normalisation, and (b)
// the regulariser for the near-front singularity. Raised-cosine: zero and
// flat (zero slope) at both ends, so it carries no DC step and no corner.
export function raisedCosinePulse(dur) {
  return function pulse(t) {
    if (t <= 0 || t >= dur) return 0;
    return 0.5 * (1 - Math.cos((2 * Math.PI * t) / dur));
  };
}

// p2(t,r): band-limited response of the 2D wave equation to `pulse`,
// via the y^2 substitution that removes the wavefront's 1/sqrt singularity.
export function p2Response(t, r, pulse, pulseDur, c = C_SOUND, nQuad = 128) {
  const T = t - r / c;
  if (T <= 0) return 0;
  const yHi = Math.sqrt(T);
  const yLo = Math.sqrt(Math.max(0, T - pulseDur));
  if (yHi <= yLo) return 0;
  const dy = (yHi - yLo) / nQuad;
  let sum = 0;
  for (let i = 0; i <= nQuad; i++) {
    const y = yLo + i * dy;
    const w = i === 0 || i === nQuad ? 0.5 : 1; // trapezoid
    const x = y * y;
    const kernel = 1 / Math.sqrt(2 * r * c + c * c * y * y);
    sum += w * pulse(T - x) * kernel;
  }
  return (sum * dy) / (Math.PI * c); // the (1/(pi c)) prefactor derived in the header comment above
}

// p4(t,r): band-limited 4D response, via the dimensional-descent recursion
// G_4 = -(1/(2 pi r)) dG_2/dr applied to the convolution with `pulse`.
export function p4Response(t, r, pulse, pulseDur, c = C_SOUND, dr = null, nQuad = 128) {
  const tau = t - r / c;
  if (tau <= 0) return 0; // causality: nothing can have arrived before the front
  // dr must stay small enough that r+dr is still inside the light cone at
  // time t (otherwise p2Response(r+dr) spuriously clips to 0 and the finite
  // difference reports a fake discontinuity right where tau is small, i.e.
  // exactly where buildTailIR samples densely near the front).
  if (dr == null) dr = Math.min(Math.max(1e-6, r * 1e-3), 0.4 * c * tau, 0.49 * r);
  const pPlus = p2Response(t, r + dr, pulse, pulseDur, c, nQuad);
  const pMinus = p2Response(t, r - dr, pulse, pulseDur, c, nQuad);
  return -((pPlus - pMinus) / (2 * dr)) / (2 * Math.PI * r);
}

// Closed-form tail (valid once we're a few pulse-widths past the front,
// where the idealised-source formula and the band-limited one agree):
//   tail(tau,r) = -(1/(4 pi^2 c)) * (c*tau*(c*tau+2r))^(-3/2)
export function tailClosedForm(tau, r, c = C_SOUND) {
  if (tau <= 0) return 0;
  const disc = c * tau * (c * tau + 2 * r);
  if (disc <= 0) return 0;
  return -(1 / (4 * Math.PI * Math.PI * c)) * Math.pow(disc, -1.5);
}

// Locate the front's peak band-limited amplitude at distance r (search a
// short window starting at the arrival time r/c, width a few pulse widths).
export function frontPeak(r, pulseDur, c = C_SOUND, pulse = raisedCosinePulse(pulseDur)) {
  const t0 = r / c;
  const span = pulseDur * 4;
  const N = 300;
  let best = 0, bestT = t0;
  for (let i = 0; i <= N; i++) {
    const t = t0 + (i / N) * span;
    const v = p4Response(t, r, pulse, pulseDur, c);
    if (Math.abs(v) > Math.abs(best)) { best = v; bestT = t; }
  }
  return { peak: best, t: bestT };
}

// ---------------------------------------------------------------------
// Impulse responses for the WebAudio ConvolverNode: the 4D TAIL only,
// expressed RELATIVE to the front's own peak (the front itself is applied
// separately by a GainNode (r^-3/2) and DelayNode (r/c) in the engine, so
// it can glide smoothly as things move -- a convolver's IR is fixed).
//
// This is a pure function: no WebAudio objects are touched, so it runs
// fine in Node (see tools/test-audio.mjs). `sampleRate` only sets how
// finely the returned Float32Array is sampled; audio.js never evaluates
// `AudioContext` here.
export function buildTailIR(sampleRate, r, opts = {}) {
  const c = C_SOUND;
  const pulseDur = opts.pulseDur || 0.001; // 1 ms synthesized "click" sets the regularisation scale
  const pulse = raisedCosinePulse(pulseDur);
  const dur = Math.min(opts.maxLen || 0.6, 0.6);
  const n = Math.max(1, Math.round(dur * sampleRate));
  const out = new Float32Array(n);

  const { peak } = frontPeak(r, pulseDur, c, pulse);
  const norm = Math.abs(peak) > 1e-300 ? peak : 1;

  // Sample the SAME band-limited recursion throughout (not the idealised
  // closed form -- that's the response to a literal, infinitely narrow
  // unit-area impulse, which carries a different normalisation than our
  // finite-width pulse: the two only agree once scaled by the pulse's own
  // area, and even then only in the limit tau >> pulseDur. Using one
  // consistent formula for the whole IR avoids that bookkeeping and the
  // seam it would otherwise create.) nQuad=48 keeps this cheap: ~35ms for
  // a full 0.6s IR (measured), done once per band at unlock(), not per frame.
  for (let i = 0; i < n; i++) {
    const tau = i / sampleRate;
    let v = p4Response(r / c + tau, r, pulse, pulseDur, c, null, 48) / norm;
    // The front and its band-limited lobes (the first ~2 pulse widths) are
    // carried by the dry Gain/Delay path and the tilt shelf, so the IR holds
    // only the tail INSIDE the cone: zero before 2.5 pulse widths, then a
    // smooth raised-cosine fade in by 4 (where the response has become the
    // (c²t² − r²)^(−3/2) tail).
    const a0 = 2.5 * pulseDur, a1 = 4 * pulseDur;
    v *= tau <= a0 ? 0 : tau >= a1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * (tau - a0) / (a1 - a0));
    out[i] = v;
  }
  // Short fade-out so truncating the IR at `dur` never produces a click.
  const fadeN = Math.min(n, Math.round(0.005 * sampleRate));
  for (let i = 0; i < fadeN; i++) out[n - 1 - i] *= i / fadeN;
  return out;
}

// ---------------------------------------------------------------------
// 4D vector helpers (tiny, kept local so this module has zero imports).
// ---------------------------------------------------------------------
const dot4 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const sub4 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
const len4 = a => Math.sqrt(dot4(a, a));
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// Distance bands (metres) each convolver's IR is built for; a one-shot is
// routed to whichever band is nearest in log-distance.
const DIST_BANDS = [3, 12, 48, 192];

// The front's honest spectral tilt is an unbounded +3 dB/octave
// (amplitude ~ sqrt(frequency)) rise -- see the header derivation. Applying
// that literally from 20 Hz to 20 kHz would be a ~30 dB rise, which is
// absurd for a game. We approximate it with a single gentle high-shelf:
// same SIGN and rough character (brighter near front, exactly as derived),
// deliberately tamed in magnitude. Documented simplification, not physics.
const TILT_DB = 3.5;
const TILT_HZ = 1800;

// Max one-shot voices alive at once (footsteps + emits combined).
const MAX_VOICES = 12;

export function createAudio() {
  const engine = {
    ctx: null,
    listener: { pos: [0, 0, 0, 0], R: [0, 0, 1, 0], wind: 0, water: 0, sea: 0 },
    _vol: { sound: 1, music: 1 },
    _voices: [],
    _bands: null,     // { band -> ConvolverNode }, built on unlock
    _noiseBuf: null,
    _music: null,     // { el, gain, name }
    _wind: null,
    _water: null,
    _windCenter: 700,
    _lastIR: null,

    // ---------------- lifecycle ----------------
    unlock() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext));
      if (!AC) return; // no WebAudio available (e.g. running under Node) -- safe no-op
      const ctx = new AC();
      this.ctx = ctx;

      this.soundGain = ctx.createGain(); this.soundGain.gain.value = this._vol.sound;
      this.musicGain = ctx.createGain(); this.musicGain.gain.value = this._vol.music;
      this.soundGain.connect(ctx.destination);
      this.musicGain.connect(ctx.destination);

      this._noiseBuf = makeNoiseBuffer(ctx, 2.0);
      this._lastIR = {};
      this._bands = buildBands(ctx, this.soundGain, this._lastIR);

      buildAmbience(this, ctx);

      if (ctx.state === 'suspended') ctx.resume();
    },

    setVolumes({ sound, music } = {}) {
      if (sound != null) this._vol.sound = clamp(sound, 0, 1);
      if (music != null) this._vol.music = clamp(music, 0, 1);
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.soundGain.gain.setTargetAtTime(this._vol.sound, t, 0.15);
      this.musicGain.gain.setTargetAtTime(this._vol.music, t, 0.15);
    },

    update(dt, L) {
      if (L) this.listener = L;
      if (!this.ctx) return;
      updateAmbience(this, dt);
    },

    // ---------------- one-shots ----------------
    step(pos, surface) {
      if (!this.ctx) return;
      const node = synthFootstep(this.ctx, this._noiseBuf, surface);
      if (node) this._fire(node.out, pos, node.gain, node.stop);
    },

    emit(kind, pos, gain = 1, opts = {}) {
      if (!this.ctx) return;
      const node = synthOneShot(this.ctx, this._noiseBuf, kind, opts);
      if (node) this._fire(node.out, pos, gain * node.gain, node.stop);
    },

    // route a finished synth graph's output through delay/distance/pan/convolver send
    _fire(outNode, pos, gain, stopAt) {
      const ctx = this.ctx;
      const L = this.listener;
      const d = sub4(pos, L.pos);
      const r = Math.max(0.5, len4(d));
      if (r > 1000) return; // per spec: beyond ~1km, just skip
      this._capVoices();

      const pan = r > 1e-6 ? clamp(dot4(d, L.R) / Math.max(r, 1e-6), -1, 1) : 0;

      const tilt = ctx.createBiquadFilter();
      tilt.type = 'highshelf'; tilt.frequency.value = TILT_HZ; tilt.gain.value = TILT_DB;

      const delay = ctx.createDelay(3);
      delay.delayTime.value = Math.min(r / C_SOUND, 3);

      const distGain = ctx.createGain();
      distGain.gain.value = gain * Math.pow(r, -1.5); // r^-3/2, normalised to 1 at r=1m (r already clamped >= 0.5)

      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;

      outNode.connect(tilt); tilt.connect(delay); delay.connect(distGain); distGain.connect(panner);
      panner.connect(this.soundGain);
      const band = nearestBand(r);
      const conv = this._bands && this._bands[band];
      if (conv) panner.connect(conv);

      const voice = { stopAt: ctx.currentTime + stopAt + 0.05, nodes: [tilt, delay, distGain, panner] };
      this._voices.push(voice);
    },

    _capVoices() {
      const now = this.ctx.currentTime;
      this._voices = this._voices.filter(v => v.stopAt > now);
      while (this._voices.length >= MAX_VOICES) {
        const v = this._voices.shift();
        try { v.nodes.forEach(n => n.disconnect()); } catch (e) { /* already disconnected */ }
      }
    },

    // ---------------- music ----------------
    cue(name) {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const prev = this._music;
      if (prev) {
        const t = ctx.currentTime;
        prev.gain.gain.setTargetAtTime(0, t, 0.667); // 2s fade: setTargetAtTime reaches ~95% by t = 3*tau
        const el = prev.el;
        setTimeout(() => { try { el.pause(); } catch (e) {} }, 2050);
      }
      let el;
      try { el = new Audio(`audio/${name}.mp3`); } catch (e) { return; }
      el.addEventListener('error', () => {}); // missing file: fail silently
      let src;
      try { src = ctx.createMediaElementSource(el); } catch (e) { return; }
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(g); g.connect(this.musicGain);
      const t = ctx.currentTime;
      g.gain.setTargetAtTime(1, t, 0.667); // 2s fade-in
      el.play().catch(() => {}); // autoplay/missing-file rejection: fail silently
      this._music = { el, gain: g, name };
    },

    stopMusic() {
      if (!this.ctx || !this._music) return;
      const { el, gain } = this._music;
      const t = this.ctx.currentTime;
      gain.gain.setTargetAtTime(0, t, 0.667);
      setTimeout(() => { try { el.pause(); } catch (e) {} }, 2050);
      this._music = null;
    },

    get debug() {
      return {
        contextState: this.ctx ? this.ctx.state : 'uninitialized',
        activeVoices: this._voices.length,
        lastIR: this._lastIR,
      };
    },
  };

  return engine;
}

// ---------------------------------------------------------------------
// WebAudio helpers (kept out of the engine object body for readability).
// These freely use AudioContext/AudioBuffer etc.; they're only ever
// called from unlock()/synth functions, never at module load time.
// ---------------------------------------------------------------------

function nearestBand(r) {
  let best = DIST_BANDS[0], bestD = Infinity;
  for (const b of DIST_BANDS) {
    const d = Math.abs(Math.log(r) - Math.log(b));
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

function buildBands(ctx, dest, statsOut) {
  const bands = {};
  for (const r of DIST_BANDS) {
    const arr = buildTailIR(ctx.sampleRate, r);
    const buf = ctx.createBuffer(1, arr.length, ctx.sampleRate);
    buf.copyToChannel(arr, 0);
    const conv = ctx.createConvolver();
    conv.normalize = false; // our IR is already physically normalised (relative to the front=1); don't let WebAudio rescale it
    conv.buffer = buf;
    conv.connect(dest);
    bands[r] = conv;
    let peakAbs = 0; for (let i = 0; i < arr.length; i++) peakAbs = Math.max(peakAbs, Math.abs(arr[i]));
    statsOut[r] = { band: r, length: arr.length, peakAbs };
  }
  return bands;
}

function makeNoiseBuffer(ctx, seconds) {
  const n = Math.round(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// A short burst of the shared noise buffer, starting at a random offset
// (so repeated bursts don't sound identical) through a filter + envelope.
function noiseBurst(ctx, noiseBuf, { filterType = 'lowpass', freq = 1000, Q = 1, dur = 0.1, attack = 0.002, gain = 1 }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = false;
  const offset = Math.random() * Math.max(0, noiseBuf.duration - dur - 0.01);
  const filt = ctx.createBiquadFilter();
  filt.type = filterType; filt.frequency.value = freq; filt.Q.value = Q;
  const env = ctx.createGain();
  const t = ctx.currentTime;
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(gain, t + attack);
  env.gain.setTargetAtTime(0, t + attack, Math.max(0.005, (dur - attack) / 4));
  src.connect(filt); filt.connect(env);
  src.start(t, offset, dur + 0.05);
  src.stop(t + dur + 0.05);
  return { node: env, filt, dur, gainAt: gain };
}

function synthFootstep(ctx, noiseBuf, surface) {
  const t = ctx.currentTime;
  switch (surface) {
    case 'rock': {
      const b = noiseBurst(ctx, noiseBuf, { filterType: 'bandpass', freq: 3200, Q: 6, dur: 0.06, gain: 0.5 });
      return { out: b.node, gain: 0.55, stop: 0.08 };
    }
    case 'metal': {
      const b = noiseBurst(ctx, noiseBuf, { filterType: 'bandpass', freq: 4200, Q: 10, dur: 0.1, gain: 0.45 });
      const ping = ctx.createOscillator(); ping.type = 'triangle'; ping.frequency.value = 1800;
      const pg = ctx.createGain(); pg.gain.setValueAtTime(0.15, t); pg.gain.exponentialRampToValueAtTime(0.0005, t + 0.12);
      ping.connect(pg); ping.start(t); ping.stop(t + 0.13);
      const mix = ctx.createGain(); b.node.connect(mix); pg.connect(mix);
      return { out: mix, gain: 0.5, stop: 0.13 };
    }
    case 'sand': {
      const b = noiseBurst(ctx, noiseBuf, { filterType: 'bandpass', freq: 1100, Q: 0.8, dur: 0.12, attack: 0.01, gain: 0.4 });
      return { out: b.node, gain: 0.45, stop: 0.13 };
    }
    case 'water': {
      const b = noiseBurst(ctx, noiseBuf, { filterType: 'bandpass', freq: 1800, Q: 1.2, dur: 0.15, attack: 0.005, gain: 0.5 });
      return { out: b.node, gain: 0.5, stop: 0.16 };
    }
    case 'grass':
    default: {
      const b = noiseBurst(ctx, noiseBuf, { filterType: 'lowpass', freq: 1300, Q: 0.7, dur: 0.1, attack: 0.008, gain: 0.35 });
      return { out: b.node, gain: 0.4, stop: 0.11 };
    }
  }
}

// A struck body's ringing: sine partials at f0·ratio, each decaying exponentially, over a short noise transient.
function partials(ctx, noiseBuf, f0, ratios, amps, decay, click) {
  const t = ctx.currentTime, mix = ctx.createGain();
  ratios.forEach((r, i) => {
    const f = f0 * r;
    if (f > 12000) return;
    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = f;
    const g = ctx.createGain(), d = decay / (1 + 0.6 * i);                 // higher modes die sooner
    g.gain.setValueAtTime(amps[i], t); g.gain.exponentialRampToValueAtTime(0.0005, t + d);
    osc.connect(g); g.connect(mix); osc.start(t); osc.stop(t + d + 0.02);
  });
  if (click) { const b = noiseBurst(ctx, noiseBuf, { filterType: 'bandpass', freq: Math.min(9000, f0 * 3), Q: 1.5, dur: 0.02, attack: 0.001, gain: click }); b.node.connect(mix); }
  return { out: mix, stop: decay + 0.05 };
}
// The modes of a vibrating 3-sphere: the Laplacian on S³ has eigenvalues l(l+2), so a struck glome's overtones
// stand at √(l(l+2)) for l = 2, 3, 4, 5 (ratios 1 : 1.369 : 1.732 : 2.092; on an ordinary 2-sphere, √(l(l+1)) gives
// 1 : 1.414 : 1.826 : 2.236).
const S3 = [2, 3, 4, 5].map(l => Math.sqrt(l * (l + 2)) / Math.sqrt(8));

function synthOneShot(ctx, noiseBuf, kind, opts = {}) {
  const t = ctx.currentTime;
  switch (kind) {
    case 'ring': {                         // a struck glome: stone rings briefly, metal (a lantern) long
      const metal = !!opts.metal, f0 = Math.max(180, Math.min(2600, (metal ? 1500 : 1000) * 0.18 / (opts.size || 0.18)));
      const r = partials(ctx, noiseBuf, f0, S3, [0.5, 0.3, 0.2, 0.12], metal ? 1.4 : 0.22, metal ? 0.1 : 0.35);
      return { out: r.out, gain: 0.6, stop: r.stop };
    }
    case 'ping': {                         // a metal tesseract: plate-like, inharmonic
      const f0 = Math.max(150, Math.min(2000, 520 * 0.5 / (opts.size || 0.5)));
      const r = partials(ctx, noiseBuf, f0, [1, 1.93, 2.87, 3.92], [0.45, 0.3, 0.2, 0.1], 0.9, 0.2);
      return { out: r.out, gain: 0.5, stop: r.stop };
    }
    case 'knock': {                        // wood
      const f0 = Math.max(90, Math.min(600, 200 * 1.3 / (opts.size || 1.3)));
      const r = partials(ctx, noiseBuf, f0, [1, 2.3, 4.1], [0.6, 0.25, 0.1], 0.14, 0.4);
      return { out: r.out, gain: 0.8, stop: r.stop };
    }
    case 'splash': {                       // something meeting the water: a burst of noise falling in pitch
      const b = noiseBurst(ctx, noiseBuf, { filterType: 'lowpass', freq: 3500, Q: 0.6, dur: 0.45, attack: 0.004, gain: 0.7 });
      b.filt.frequency.setValueAtTime(3500, t); b.filt.frequency.exponentialRampToValueAtTime(500, t + 0.4);
      return { out: b.node, gain: 0.8, stop: 0.5 };
    }
    case 'tick': {                         // a walker's four feet landing: a dry little click
      const b = noiseBurst(ctx, noiseBuf, { filterType: 'bandpass', freq: 5200, Q: 8, dur: 0.025, attack: 0.001, gain: 0.6 });
      return { out: b.node, gain: 0.5, stop: 0.04 };
    }
    case 'chirp': {                        // a roller taking an interest: two quick rising notes
      const mix = ctx.createGain();
      [0, 0.09].forEach((o, i) => {
        const osc = ctx.createOscillator(); osc.type = 'sine';
        osc.frequency.setValueAtTime(900 + 300 * i, t + o); osc.frequency.exponentialRampToValueAtTime(1500 + 400 * i, t + o + 0.07);
        const g = ctx.createGain(); g.gain.setValueAtTime(0, t + o); g.gain.linearRampToValueAtTime(0.35, t + o + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + o + 0.08);
        osc.connect(g); g.connect(mix); osc.start(t + o); osc.stop(t + o + 0.09);
      });
      return { out: mix, gain: 0.6, stop: 0.2 };
    }
    case 'block': {                        // a stone tesseract: a dry knock, lower for bigger blocks
      const size = opts.size || 0.3, f = Math.max(700, Math.min(4000, 3000 * 0.3 / size));
      const b = noiseBurst(ctx, noiseBuf, { filterType: 'bandpass', freq: f, Q: 5, dur: 0.05, attack: 0.001, gain: 0.8 });
      const mix = ctx.createGain(); b.node.connect(mix);
      if (size > 0.4) {                    // and a thump under a heavy one
        const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.setValueAtTime(110, t); osc.frequency.exponentialRampToValueAtTime(60, t + 0.12);
        const og = ctx.createGain(); og.gain.setValueAtTime(0.7, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        osc.connect(og); og.connect(mix); osc.start(t); osc.stop(t + 0.17);
      }
      return { out: mix, gain: 0.7, stop: 0.18 };
    }
    case 'thud': {
      const osc = ctx.createOscillator(); osc.type = 'sine';
      osc.frequency.setValueAtTime(90, t); osc.frequency.exponentialRampToValueAtTime(45, t + 0.18);
      const og = ctx.createGain(); og.gain.setValueAtTime(0.9, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(og); osc.start(t); osc.stop(t + 0.26);
      const b = noiseBurst(ctx, noiseBuf, { filterType: 'lowpass', freq: 300, Q: 0.6, dur: 0.1, gain: 0.5 });
      const mix = ctx.createGain(); og.connect(mix); b.node.connect(mix);
      return { out: mix, gain: 1, stop: 0.28 };
    }
    case 'clack': {
      const b = noiseBurst(ctx, noiseBuf, { filterType: 'bandpass', freq: 3000, Q: 9, dur: 0.05, attack: 0.001, gain: 0.8 });
      return { out: b.node, gain: 0.7, stop: 0.07 };
    }
    case 'throw': {
      const b = noiseBurst(ctx, noiseBuf, { filterType: 'bandpass', freq: 1500, Q: 1, dur: 0.4, attack: 0.05, gain: 0.5 });
      b.filt.frequency.setValueAtTime(1500, t);
      b.filt.frequency.linearRampToValueAtTime(600, t + 0.4);
      return { out: b.node, gain: 0.6, stop: 0.42 };
    }
    case 'chime': {
      const f0 = 700 + Math.random() * 120;
      const ratios = [1, 2.76, 5.4]; // deliberately inharmonic (a bell-like spectrum, not a flute's integer series)
      const amps = [0.6, 0.22, 0.09];
      const mix = ctx.createGain();
      for (let i = 0; i < ratios.length; i++) {
        const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = f0 * ratios[i];
        const g = ctx.createGain(); g.gain.setValueAtTime(amps[i], t);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 1.6 - i * 0.2);
        osc.connect(g); g.connect(mix);
        osc.start(t); osc.stop(t + 1.7);
      }
      return { out: mix, gain: 0.8, stop: 1.7 };
    }
    case 'launch': {
      const osc = ctx.createOscillator(); osc.type = 'sine';
      osc.frequency.setValueAtTime(120, t); osc.frequency.exponentialRampToValueAtTime(38, t + 0.5);
      const og = ctx.createGain(); og.gain.setValueAtTime(0.9, t); og.gain.exponentialRampToValueAtTime(0.002, t + 1.8);
      osc.connect(og); osc.start(t); osc.stop(t + 1.9);
      const b = noiseBurst(ctx, noiseBuf, { filterType: 'lowpass', freq: 400, Q: 0.5, dur: 0.3, gain: 0.5 });
      const mix = ctx.createGain(); og.connect(mix); b.node.connect(mix);
      return { out: mix, gain: 1, stop: 1.9 };
    }
    case 'clap': {
      const mix = ctx.createGain();
      const offsets = [0, 0.012, 0.024];
      for (const o of offsets) {
        const src = ctx.createBufferSource(); src.buffer = noiseBuf;
        const filt = ctx.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = 1500; filt.Q.value = 2.5;
        const g = ctx.createGain();
        const start = t + o;
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(0.7, start + 0.002);
        g.gain.exponentialRampToValueAtTime(0.001, start + 0.03);
        const offset = Math.random() * Math.max(0, noiseBuf.duration - 0.05);
        src.connect(filt); filt.connect(g); g.connect(mix);
        src.start(start, offset, 0.05); src.stop(start + 0.05);
      }
      return { out: mix, gain: 0.8, stop: 0.16 };
    }
    default:
      return null;
  }
}

// Ambient beds: wind (band-passed noise, slow random-walk gust) and water
// (band-passed noise with slow amplitude modulation, plus a "sea" sloshing
// layer when wading). Both run continuously once unlocked; only their
// gains move, driven by update(dt, L).
function buildAmbience(engine, ctx) {
  // wind
  const windSrc = ctx.createBufferSource(); windSrc.buffer = engine._noiseBuf; windSrc.loop = true;
  const windFilt = ctx.createBiquadFilter(); windFilt.type = 'bandpass'; windFilt.frequency.value = engine._windCenter; windFilt.Q.value = 0.7;
  const windGain = ctx.createGain(); windGain.gain.value = 0;
  windSrc.connect(windFilt); windFilt.connect(windGain); windGain.connect(engine.soundGain);
  windSrc.start();
  engine._wind = { filt: windFilt, gain: windGain };

  // water (lapping/burbling): band-passed noise, amplitude-modulated by a slow LFO
  const waterSrc = ctx.createBufferSource(); waterSrc.buffer = engine._noiseBuf; waterSrc.loop = true;
  const waterFilt = ctx.createBiquadFilter(); waterFilt.type = 'bandpass'; waterFilt.frequency.value = 900; waterFilt.Q.value = 0.9;
  const waterGain = ctx.createGain(); waterGain.gain.value = 0;
  const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.35;
  const lfoDepth = ctx.createGain(); lfoDepth.gain.value = 0; // scaled by water level in updateAmbience
  const lfoOffset = ctx.createConstantSource(); lfoOffset.offset.value = 0;
  lfo.connect(lfoDepth); lfoDepth.connect(waterGain.gain); lfoOffset.connect(waterGain.gain);
  waterSrc.connect(waterFilt); waterFilt.connect(waterGain); waterGain.connect(engine.soundGain);
  waterSrc.start(); lfo.start(); lfoOffset.start();

  // sea (wading) sloshing: a second, slightly higher-passed noise layer, also AM'd
  const seaSrc = ctx.createBufferSource(); seaSrc.buffer = engine._noiseBuf; seaSrc.loop = true;
  const seaFilt = ctx.createBiquadFilter(); seaFilt.type = 'bandpass'; seaFilt.frequency.value = 1400; seaFilt.Q.value = 0.6;
  const seaGain = ctx.createGain(); seaGain.gain.value = 0;
  const seaLfo = ctx.createOscillator(); seaLfo.type = 'sine'; seaLfo.frequency.value = 0.8;
  const seaDepth = ctx.createGain(); seaDepth.gain.value = 0;
  const seaOffset = ctx.createConstantSource(); seaOffset.offset.value = 0;
  seaLfo.connect(seaDepth); seaDepth.connect(seaGain.gain); seaOffset.connect(seaGain.gain);
  seaSrc.connect(seaFilt); seaFilt.connect(seaGain); seaGain.connect(engine.soundGain);
  seaSrc.start(); seaLfo.start(); seaOffset.start();

  engine._water = { filt: waterFilt, gain: waterGain, lfoDepth, lfoOffset };
  engine._sea = { gain: seaGain, lfoDepth: seaDepth, offset: seaOffset };
}

function updateAmbience(engine, dt) {
  const ctx = engine.ctx, L = engine.listener, now = ctx.currentTime;

  // wind: slow random walk on the bandpass centre + level follows L.wind
  engine._windCenter = clamp(engine._windCenter + (Math.random() - 0.5) * dt * 400, 300, 1600);
  engine._wind.filt.frequency.setTargetAtTime(engine._windCenter, now, 0.4);
  const windLevel = clamp(L.wind, 0, 1) * 0.22;
  engine._wind.gain.gain.setTargetAtTime(windLevel, now, 0.5);

  // water: level follows L.water; AM depth/offset keep it from ever hitting zero
  const waterBase = clamp(L.water, 0, 1) * 0.16;
  engine._water.lfoOffset.offset.setTargetAtTime(waterBase * 0.6, now, 0.5);
  engine._water.lfoDepth.gain.setTargetAtTime(waterBase * 0.4, now, 0.5);

  // sea (wading): adds a higher, faster sloshing layer
  const seaBase = clamp(L.sea, 0, 1) * 0.2;
  engine._sea.offset.offset.setTargetAtTime(seaBase * 0.6, now, 0.3);
  engine._sea.lfoDepth.gain.setTargetAtTime(seaBase * 0.4, now, 0.3);
}
