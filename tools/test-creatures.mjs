// The creatures (node tools/test-creatures.mjs): herds are found evenly wherever you stand on the grass, they stay on
// their home ground (none follows you away), the shy ones trot off and the curious ones stop to watch.
// Runs the creatures' minds on the real terrain function, with a stand-in for you.
import { G } from '../js/game.js';
import { terrainHeight, waterLevel } from '../js/world.js';
import { creatures, initCreatures, stepCreatures } from '../js/creatures.js';
const hf = { heightAt: terrainHeight, waterAt: waterLevel };
const R = 250, len = a => Math.hypot(...a), norm = a => a.map(v => v / len(a)), dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const arc = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * R;
const tangents = ([a, b, c, d]) => [[-b, a, d, -c], [-c, -d, a, b], [-d, c, -b, a]];
let s = 4242; const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296), gauss = () => rnd() + rnd() + rnd() + rnd() - 2;
const me = { pos: [R, 0, 0, 0], vel: [0, 0, 0, 0], A: [0, 0, 0, 1], onB: null, up() { return norm(this.pos); } };
G.player = me; G.simT = 0;
initCreatures(hf);
const standAt = n => { me.pos = n.map(v => v * (R + hf.heightAt(n) + 0.05)); const T = tangents(n); me.A = T[2]; };
const step = (t, dt = 0.05) => { for (let k = 0; k < t / dt; k++) { G.simT += dt; stepCreatures(dt, hf); } };
const rows = {};

// 1. evenly spread: at 80 random places on the grass, the creatures within 40 m
const counts = [];
for (let k = 0; counts.length < 80 && k < 20000; k++) {
  const n = norm([gauss(), gauss(), gauss(), gauss()]), h = hf.heightAt(n);
  if (h < 3 || h > 20 || hf.waterAt(n) > 0.01) continue;
  standAt(n); step(0.1);
  counts.push(creatures.list.filter(c => arc(c.n, n) < 40).length);
}
counts.sort((a, b) => a - b);
rows.within40m = { min: counts[0], quartile: counts[20], median: counts[40], max: counts[79], none: counts.filter(c => !c).length };

// 2. a herd: stand 8 m from it a while, then walk away; none strays from home, none follows
let herdAt = null;
for (let k = 0; !herdAt && k < 20000; k++) {
  const n = norm([gauss(), gauss(), gauss(), gauss()]), h = hf.heightAt(n);
  if (h < 3 || h > 20 || hf.waterAt(n) > 0.01) continue;
  standAt(n); step(0.1);
  const w = creatures.list.filter(c => c.kind === 'walker' && arc(c.n, n) < 30);
  if (w.length >= 3) herdAt = w[0].home;
}
const T = tangents(herdAt), off = (u, t, m) => norm(u.map((v, i) => v * Math.cos(m / R) + t[i] * Math.sin(m / R)));
standAt(off(herdAt, T[0], 8)); step(0.2);
const herd = creatures.list.filter(c => c.kind === 'walker' && arc(c.home, herdAt) < 0.01);
const d0 = new Map(herd.map(c => [c.id, arc(c.n, norm(me.pos))]));
step(4);
const shy = herd.filter(c => !c.curious && d0.get(c.id) < 12), cur = herd.filter(c => c.curious && d0.get(c.id) < 12 && d0.get(c.id) > 5);
rows.reaction = { shyMovedAway: shy.filter(c => arc(c.n, norm(me.pos)) > d0.get(c.id) + 1).length + '/' + shy.length,
                  curiousStayed: cur.filter(c => Math.abs(arc(c.n, norm(me.pos)) - d0.get(c.id)) < 2).length + '/' + cur.length };
let stray = 0;
for (let t = 0; t < 60; t += 0.5) {                          // walking away at 2 m/s for a minute
  standAt(off(herdAt, T[0], 8 + 2 * t)); step(0.5);
  for (const c of creatures.list) stray = Math.max(stray, arc(c.n, c.home) - (c.toy ? 30 : 14));
}
const followed = creatures.list.filter(c => herd.includes(c) && arc(c.n, norm(me.pos)) < 30).length;
rows.awayAfter120m = { strayBeyondLeash: stray.toFixed(2), herdWithin30mOfYou: followed };
console.table(rows);
const ok = rows.within40m.none <= 8 && rows.within40m.median >= 5 && stray < 1.5 && shy.length + cur.length > 0 && followed === 0 && shy.every(c => arc(c.n, norm(me.pos)) > 0) ;
console.log(ok ? 'PASS: herds are near wherever you stand (' + rows.within40m.median + ' within 40 m at the median), none strays from home (beyond the leash by ' + stray.toFixed(1) + ' m at most, fleeing) or follows you' : 'FAIL');
process.exit(ok ? 0 : 1);
