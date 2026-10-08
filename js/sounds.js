// Drives the audio engine (audio.js) from the world: the listener, the ambient beds, footsteps and landings.
// Sound only starts after your first click or key (browsers require a gesture).
import { createAudio } from './audio.js';
import { G } from './game.js';
import { PLANET_R, SEA } from './world.js';
import { vec4 } from './player.js';
import { sunDir } from './game.js';
import { tangents } from './env.js';

export const audio = G.audio = createAudio();
const unlock = () => { audio.unlock(); };
addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);

const s = { stride: 0, wasGrounded: true, fallSpeed: 0, waterT: 0, water: 0 };

// How much sea lies near you: the fraction of points on two rings (10 m and 25 m) that are under water.
function nearWater(p) {
  const u = p.up(), T = tangents(u);
  let wet = 0, n = 0;
  for (const d of [10, 25]) for (const t of [...T, ...T.map(v => vec4.scale(v, -1))]) {
    n++;
    if (p.hf.heightAt(vec4.norm(vec4.add(u, vec4.scale(t, d / PLANET_R)))) < SEA) wet++;
  }
  return wet / n;
}

export function updateSound(dt, cam) {
  const p = G.player;
  if (!p) return;
  const u = p.up(), above = p.altitude(), day = Math.max(0, Math.min(1, (vec4.dot(sunDir(G.state.time), u) + 0.15) / 0.3));
  if ((s.waterT -= dt) <= 0) { s.water = nearWater(p); s.waterT = 0.5; }
  audio.update(dt, {
    pos: cam.eye, R: cam.R,
    wind: Math.min(1, 0.18 + Math.max(0, above) / 45) * (0.55 + 0.45 * day),   // windier up high; calmer at night
    water: Math.max(s.water, p.depth > 0 ? 1 : 0),
    sea: p.depth > 0 ? Math.min(1, p.depth / 1.3) : 0,
  });
  // footsteps: one per stride while walking on the ground
  const vr = vec4.dot(p.vel, u), vh = vec4.len(vec4.sub(p.vel, vec4.scale(u, vr)));
  if (p.grounded) {
    s.stride += vh * dt;
    const len = vh > 6 ? 1.3 : 0.8;
    if (s.stride > len) {
      s.stride = 0;
      const h = p.hf.heightAt(u);
      const surface = p.depth > 0.05 ? 'water' : p.supported ? 'rock' : h < SEA + 1.2 ? 'sand' : h > 24 ? 'rock' : 'grass';
      audio.step(p.pos, surface);
    }
    if (!s.wasGrounded && s.fallSpeed > 2.5) audio.emit('thud', p.pos, Math.min(1.5, s.fallSpeed / 5));   // landing
  } else s.fallSpeed = Math.max(0, -vr);
  s.wasGrounded = p.grounded;
}
