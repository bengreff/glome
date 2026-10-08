// The hidden ecosystem (node tools/test-creatures.mjs): herds move over a day, and populations persist.
// Runs the creatures' minds and lives on the real terrain function, without the player, for ten days of 300 s.
import { G } from '../js/game.js';
import { terrainHeight, waterLevel } from '../js/world.js';
import { creatures, initCreatures, stepCreatures } from '../js/creatures.js';
const hf = { heightAt: terrainHeight, waterAt: waterLevel };
G.player = { up: () => [1, 0, 0, 0], onB: null, pos: [1e6, 0, 0, 0] };   // far away: no one to flee from
initCreatures(hf);
G.player = null;
const count = k => creatures.list.filter(c => c.kind === k).length;
const centroid = () => { const w = creatures.list.filter(c => c.kind === 'walker'); return w.map(c => c.n); };
const day = 300, dt = 0.25;
const rows = [];
let prev = new Map(creatures.list.map(c => [c.id, c.n]));
for (let d = 1; d <= 10; d++) {
  for (let t = 0; t < day; t += dt) stepCreatures(dt, hf);
  // how far did the walkers that lived through the day travel?
  let moved = 0, n = 0;
  for (const c of creatures.list) if (c.kind === 'walker' && prev.has(c.id)) { const a = prev.get(c.id); moved += Math.acos(Math.max(-1, Math.min(1, a.reduce((s, x, i) => s + x * c.n[i], 0)))) * 250; n++; }
  rows.push({ day: d, walkers: count('walker'), rollers: count('roller'), meanTravel: n ? (moved / n).toFixed(1) : '-' });
  prev = new Map(creatures.list.map(c => [c.id, c.n]));
}
console.table(rows);
const ok = rows.every(r => r.walkers > 10 && r.rollers > 2) && rows.slice(0, 3).every(r => +r.meanTravel > 20);
console.log(ok ? 'PASS: herds travel tens of metres a day and both populations persist for ten days' : 'FAIL');
process.exit(ok ? 0 : 1);
