// A 4D walker on the surface of a 3-sphere planet.
// The body frame is (F, R, A): three orthonormal horizontal directions (forward, right, ana).
// "Up" is always radial. The camera adds a pitch angle in the forward–up plane.
import { PLANET_R, SEA } from './world.js';
import { LAWS } from './laws.js';
import { G } from './game.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const len = a => Math.sqrt(dot(a, a));
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s, a[3] * s];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
const norm = a => scale(a, 1 / len(a));
const reject = (a, b) => sub(a, scale(b, dot(a, b)));   // remove b-component (b unit)
export const CAP_LO = 0.3, CAP_HI = 1.75, CAP_R = 0.3;   // the body capsule (PHYSICS.md)


export class Player {
  constructor(heightField) {
    this.hf = heightField;
    this.pos = [PLANET_R, 0, 0, 0];
    this.vel = [0, 0, 0, 0];
    this.F = [0, 1, 0, 0]; this.R = [0, 0, 1, 0]; this.A = [0, 0, 0, 1];
    this.pitch = 0;
    this.grounded = false;
    this.depth = 0;
    this.dry = null;              // the last dry ground you stood on: where a wade too deep fades you back to
  }

  // The ground's distance from the centre of the body you stand on (planet A's heightfield, or B's crystal).
  ground(n) { return this.groundFn ? this.groundFn(n) : this.floorFn ? this.floorFn(n, len(this.pos)) : PLANET_R + this.hf.heightAt(n); }

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

  // Turn smoothly so that forward points along the horizontal unit vector dir. Returns true when aligned.
  turnToward(dir, maxAngle) {
    const F = this.F;
    const c = Math.max(-1, Math.min(1, dot(F, dir)));
    const phi = Math.acos(c);
    if (phi < 0.004) return true;
    let W = sub(dir, scale(F, c));
    W = len(W) > 1e-9 ? norm(W) : this.R;
    const st = Math.min(phi, maxAngle), cs = Math.cos(st) - 1, sn = Math.sin(st);
    const rot = v => { const vf = dot(v, F), vw = dot(v, W);
      return add(v, add(scale(add(scale(F, vf), scale(W, vw)), cs), scale(sub(scale(W, vf), scale(F, vw)), sn))); };
    this.F = rot(this.F); this.R = rot(this.R); this.A = rot(this.A);
    this.settleFrame();
    return st === phi;
  }

  // The body is a 4D capsule along the local up: sphere centres 0.3 m and 1.75 m above the feet, radius 0.3 m.
  capsule() { const u = this.up(); return { a: add(this.pos, scale(u, CAP_LO)), b: add(this.pos, scale(u, CAP_HI)), r: CAP_R }; }

  // One fixed step. accel(pos, vel) is the exact acceleration of a free particle in the planet's frame (gravity of
  // everything with its images round the hoop, plus the spin's centrifugal and Coriolis terms).
  update(dt, input, accel) {
    const u = this.up();
    const wish = add(add(scale(this.F, input.fwd), scale(this.R, input.right)), scale(this.A, input.ana));
    const wl = len(wish);
    // You cannot swim. You can wade: water deeper than your knees slows you, and past chest depth you fade back
    // to where you stepped in (main.js).
    const seaR = this.groundFn ? -Infinity : PLANET_R + this.hf.waterAt(u), floor = this.ground(u);   // the sea, or a river (B is dry)
    this.depth = Math.max(0, seaR - Math.max(floor, len(this.pos) - 0.02));   // water above your feet (none on a raft)
    const wade = this.depth > 0.3 ? Math.max(0.35, 1 - (this.depth - 0.3) / 1.4) : 1;
    const speed = (input.run ? LAWS.RUN : LAWS.WALK) * wade;
    const target = wl > 0 ? scale(wish, speed / wl) : [0, 0, 0, 0];

    const g = accel(this.pos, this.vel);
    const gr = dot(g, u), gh = sub(g, scale(u, gr));
    const vr = dot(this.vel, u);
    const vh = sub(this.vel, scale(u, vr));
    let nh;
    // standing on something that moves (a raft), you move with it
    const base = this.ride ? sub(this.ride.vel, scale(u, dot(this.ride.vel, u))) : [0, 0, 0, 0];
    if (this.grounded) nh = add(vh, scale(sub(add(target, base), vh), Math.min(1, 14 * dt)));   // feet grip the ground
    else {
      nh = add(vh, scale(gh, dt));                                                     // ballistic ...
      // ... except for a little steering within a couple of metres of the ground, the way a jumper twists
      // (a deliberate mercy, logged in DECISIONS.md; flight higher up is purely ballistic)
      if (wl > 0 && len(this.pos) - floor < 2.5) nh = add(nh, scale(sub(target, nh), Math.min(1, 1.5 * dt)));
    }
    let nvr = vr + gr * dt;
    if (input.jump && this.grounded) { nvr = Math.max(nvr, 0) + LAWS.JUMP; this.grounded = false; }
    this.vel = add(nh, scale(u, nvr));
    this.supported = false;
    this.contact?.(this, dt, input);                       // obstacles: contact forces before the step
    this.pos = add(this.pos, scale(this.vel, dt));

    // ground collision
    const n = this.up();
    const gnd = this.ground(n);
    if (len(this.pos) <= gnd) {
      this.pos = scale(n, gnd);
      const v2 = dot(this.vel, n);
      if (v2 < 0) this.vel = sub(this.vel, scale(n, v2));
      this.grounded = true;
    } else {
      this.grounded = len(this.pos) < gnd + 0.05 || this.supported;
    }
    if (G.simT < this.airborneUntil) this.grounded = false;     // just launched
    if (this.grounded && this.depth === 0 && floor > seaR + 0.2) this.dry = { pos: this.pos.slice(), F: this.F, R: this.R, A: this.A, onB: this.onB ?? null };
    this.settleFrame();
  }

  // Camera basis for the renderer.
  camera() {
    const U = this.up();
    const c = Math.cos(this.pitch), s = Math.sin(this.pitch);
    return {
      eye: add(this.pos, scale(U, LAWS.EYE)),
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
  heightAboveGround() { return len(this.pos) - this.ground(this.up()); }
}

export const vec4 = { dot, len, norm, add, sub, scale };
