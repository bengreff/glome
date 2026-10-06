// A 4D walker on the surface of a 3-sphere planet.
// The body frame is (F, R, A): three orthonormal horizontal directions (forward, right, ana).
// "Up" is always radial. The camera adds a pitch angle in the forward–up plane.
import { PLANET_R, SEA } from './world.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const len = a => Math.sqrt(dot(a, a));
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s, a[3] * s];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
const norm = a => scale(a, 1 / len(a));
const reject = (a, b) => sub(a, scale(b, dot(a, b)));   // remove b-component (b unit)

const GRAVITY = 9.8, EYE = 1.62, WALK = 4.2, RUN = 9.5, JUMP = 5.2;

export class Player {
  constructor(heightField) {
    this.hf = heightField;
    this.pos = [PLANET_R, 0, 0, 0];
    this.vel = [0, 0, 0, 0];
    this.F = [0, 1, 0, 0]; this.R = [0, 0, 1, 0]; this.A = [0, 0, 0, 1];
    this.pitch = 0;
    this.grounded = false;
    this.swimming = false;
  }

  ground(n) { return PLANET_R + this.hf.heightAt(n); }

  // Pick a dry, gentle spot to start.
  spawn(rand) {
    let best = null;
    for (let k = 0; k < 4000; k++) {
      const v = norm([rand() - 0.5, rand() - 0.5, rand() - 0.5, rand() - 0.5]);
      const h = this.hf.heightAt(v);
      if (h < 2 || h > 9) continue;
      const e = 2 / PLANET_R;
      let rough = 0;
      for (let i = 0; i < 4; i++) { const d = [0, 0, 0, 0]; d[i] = e; rough += Math.abs(this.hf.heightAt(norm(add(v, d))) - h); }
      if (!best || rough < best.rough) best = { v, rough };
      if (rough < 0.2) break;
    }
    const n = best.v;
    this.pos = scale(n, this.ground(n) + 0.05);
    this.vel = [0, 0, 0, 0];
    // any orthonormal horizontal frame
    const basis = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
    const frame = [];
    for (const b of basis) {
      let v = reject(b, n);
      for (const f of frame) v = reject(v, f);
      if (len(v) > 0.3) frame.push(norm(v));
      if (frame.length === 3) break;
    }
    [this.F, this.R, this.A] = frame;
    this.pitch = 0;
  }

  up() { return norm(this.pos); }

  // Re-orthonormalize the horizontal frame against the current up (approximate parallel transport).
  settleFrame() {
    const u = this.up();
    this.F = norm(reject(this.F, u));
    this.R = norm(reject(reject(this.R, u), this.F));
    this.A = norm(reject(reject(reject(this.A, u), this.F), this.R));
  }

  // Rotate two frame vectors in their shared plane. plane: 'FR' (turn), 'FA' (turn into ana), 'RA' (twist).
  rotate(plane, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const [p, q] = { FR: ['F', 'R'], FA: ['F', 'A'], RA: ['R', 'A'] }[plane];
    const a = this[p], b = this[q];
    this[p] = add(scale(a, c), scale(b, s));
    this[q] = sub(scale(b, c), scale(a, s));
    this.settleFrame();
  }

  update(dt, input) {
    const u = this.up();
    const wish = add(add(scale(this.F, input.fwd), scale(this.R, input.right)), scale(this.A, input.ana));
    const wl = len(wish);
    const speed = input.run ? RUN : WALK;
    const target = wl > 0 ? scale(wish, speed / wl) : [0, 0, 0, 0];

    const r = len(this.pos);
    const seaR = PLANET_R + SEA;
    this.swimming = r < seaR - 1.1 && r > this.ground(u) + 0.3;

    // horizontal velocity: snappy on the ground, sluggish in the air or water
    const vr = dot(this.vel, u);
    const vh = sub(this.vel, scale(u, vr));
    const k = this.grounded ? 14 : this.swimming ? 3 : 1.5;
    const nh = add(vh, scale(sub(target, vh), Math.min(1, k * dt)));
    let nvr = vr;

    if (this.swimming) {
      nvr += ((seaR - 0.9) - r) * 6 * dt;                     // buoyancy keeps the head above water
      nvr *= Math.exp(-2.5 * dt);
      if (input.jump) nvr = Math.max(nvr, 2.5);
    } else {
      nvr -= GRAVITY * dt;
      if (input.jump && this.grounded) { nvr = JUMP; this.grounded = false; }
    }
    this.vel = add(nh, scale(u, nvr));
    this.pos = add(this.pos, scale(this.vel, dt));

    // ground collision
    const n = this.up();
    const g = this.ground(n);
    if (len(this.pos) <= g) {
      this.pos = scale(n, g);
      const v2 = dot(this.vel, n);
      if (v2 < 0) this.vel = sub(this.vel, scale(n, v2));
      this.grounded = true;
    } else {
      this.grounded = len(this.pos) < g + 0.05;
    }
    this.settleFrame();
  }

  // Camera basis for the renderer.
  camera() {
    const U = this.up();
    const c = Math.cos(this.pitch), s = Math.sin(this.pitch);
    return {
      eye: add(this.pos, scale(U, EYE)),
      F: add(scale(this.F, c), scale(U, s)),
      U: sub(scale(U, c), scale(this.F, s)),
      R: this.R, A: this.A, up: U,
    };
  }

  // Hopf coordinates of the current position: eta in [0°, 90°], xi1 and xi2 in [0°, 360°).
  hopf() {
    const n = this.up();
    const deg = x => x * 180 / Math.PI;
    const eta = Math.atan2(Math.hypot(n[2], n[3]), Math.hypot(n[0], n[1]));
    const wrap = a => (deg(a) + 360) % 360;
    return { eta: deg(eta), xi1: wrap(Math.atan2(n[1], n[0])), xi2: wrap(Math.atan2(n[3], n[2])) };
  }

  altitude() { return len(this.pos) - PLANET_R - SEA; }
}

export const vec4 = { dot, len, norm, add, sub, scale };
