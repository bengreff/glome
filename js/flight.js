// Flight. Once you are well clear of the ground, you are integrated in the inertial frame (star at rest) in the
// exact field of the star and both planets with all their images, by a kick-drift-kick leapfrog at the fixed step:
// symplectic, so orbits neither gain nor lose energy over time. Your state is converted back into the planet's
// frame after every step (exactly), so the camera, the radar and the ground below all see you where you are.
// Your orientation stays fixed in space while you fly: the planet turns beneath you.
import { G } from './game.js';
import { LAWS } from './laws.js';
import { vec4 } from './player.js';
import { gravityInertial, toInertial, velToInertial, toBody, velToBody, dirToInertial, dirToBody, orbitOf, GM } from './cosmos.js';

export const flight = { active: false, x: null, v: null, F: null, R: null, A: null, time: 0, maxR: 0, escaped: false };
const ENTER = 20, LEAVE = 14;          // heights above the ground (m) to switch into and out of flight

export function updateFlightMode(p) {
  const above = p.heightAboveGround();
  if (!flight.active && !p.grounded && above > ENTER) enter(p);
  else if (flight.active && above < LEAVE && vec4.dot(p.vel, p.up()) < 0) leave(p);
}
function enter(p) {
  const t = G.state.time;
  flight.active = true; flight.time = 0;
  flight.x = toInertial(p.pos, t); flight.v = velToInertial(p.pos, p.vel, t);
  flight.F = dirToInertial(p.F, t); flight.R = dirToInertial(p.R, t); flight.A = dirToInertial(p.A, t);
}
function leave(p) { flight.active = false; }

// One fixed step of flight. Returns false if the flight should end in a soft reset (the star, or adrift too long).
export function stepFlight(p, dt) {
  const t = G.state.time, x = flight.x, v = flight.v;
  const a0 = gravityInertial(x, t);
  for (let i = 0; i < 4; i++) v[i] += 0.5 * dt * a0[i];
  for (let i = 0; i < 4; i++) x[i] += dt * v[i];
  const a1 = gravityInertial(x, t + dt);
  for (let i = 0; i < 4; i++) v[i] += 0.5 * dt * a1[i];
  flight.time += dt;
  // back into the planet's frame (at the end of the step); the frame keeps its inertial orientation
  const t1 = t + dt;
  p.pos = toBody(x, t1); p.vel = velToBody(x, v, t1);
  p.F = dirToBody(flight.F, t1); p.R = dirToBody(flight.R, t1); p.A = dirToBody(flight.A, t1);
  p.settleFrame();
  flight.F = dirToInertial(p.F, t1); flight.R = dirToInertial(p.R, t1); flight.A = dirToInertial(p.A, t1);
  p.grounded = false;
  const rA = vec4.len(p.pos);
  flight.maxR = Math.max(flight.maxR, rA);
  if (!flight.escaped && rA > 840) { flight.escaped = true; G.audio?.cue('escape'); G.onEscape?.(); }
  // the star: touching it is the end of this flight (nothing kills you: a quiet fade home)
  if (vec4.len(x) < LAWS.STAR_R + 5) return false;
  if (flight.time > 9 * 60) return false;                     // adrift for nine minutes
  return true;
}
// After mouse-look turns you in flight, keep the inertial copy of your frame in step.
export function syncFlightFrame(p) {
  if (!flight.active) return;
  const t = G.state.time;
  flight.F = dirToInertial(p.F, t); flight.R = dirToInertial(p.R, t); flight.A = dirToInertial(p.A, t);
}
// A change of your velocity while flying (a thrown impulse stone's recoil), given in the planet's frame.
export function kick(dvBody) {
  if (!flight.active) return;
  const d = dirToInertial(dvBody, G.state.time);
  for (let i = 0; i < 4; i++) flight.v[i] += d[i];
}
// Energy per unit mass relative to planet A in the inertial frame (for tests): ½|v − v_A|² + Φ.
export { GM, orbitOf };
