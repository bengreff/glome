(async () => {
// the settle test at each new site: stand 7 m off it facing it (squared), auto resolution, ~26 s, the last 8 s sampled;
// at the knot gate with the rope in hand (awake), at the fold with a plate held
const g = __glome, wait = ms => new Promise(r => setTimeout(r, ms)), out = {}, { p, V, len, nz } = PT, d = g.dbg;
const so4 = await import(JSON.parse(document.querySelector('script[type=importmap]').textContent).imports['./js/so4.js']), R4 = so4.rot;
const site = (n, R, foot) => {
  const f = R4.apply(R, [1, 0, 0, 0]), a = R4.apply(R, [0, 0, 1, 0]), q = V.sub(foot, V.sc(f, 7)), nn = nz(q);
  p.pos = V.sc(nn, 250 + Math.max(p.hf.heightAt(nn), len(foot) - 250) + 0.05); p.vel = [0, 0, 0, 0]; p.settleFrame();
  for (let i = 0; i < 80; i++) { const dir = nz(V.sub(foot, p.camera().eye)); const x = Math.atan2(V.dot(dir, p.R), V.dot(dir, p.F)), y = Math.atan2(V.dot(dir, p.A), V.dot(dir, p.F)); if (Math.abs(x) + Math.abs(y) < 0.002) break; p.rotate('FR', x); p.rotate('FA', y); }
  for (let i = 0; i < 60; i++) { const x = Math.atan2(V.dot(a, p.R), V.dot(a, p.A)); if (Math.abs(x) < 0.002) break; p.rotate('RA', -x); }
  p.pitch = -0.1;
};
const A = d.artifacts, G = g.G;
const views = {
  room: () => { const a = A.find(x => x.id === 'room'); site(a.n, a.R, a.foot); },
  mirror: () => { const a = A.find(x => x.id === 'mirror'); site(a.n, a.R, a.foot); },
  knot: () => { site(null, G.knot.R, G.knot.foot); G.ropeHeld = G.rope.loop[0] + 6; G.ropeOff = [1.5, 0, -0.3, 0]; },
  fold: () => { site(null, G.fold.R, G.fold.foot); },
};
for (const [v, go] of Object.entries(views)) {
  go(); g.dyn.scale = 0.6; g.dyn.ceilUntil = 0; g.dyn.floorUntil = 0; g.dyn.probe = null;
  const s = [];
  for (let i = 0; i < 26; i++) { await wait(1000); if (i >= 18) s.push([g.dyn.scale, 1000 / g.prof.interval, g.prof.cpu.physics]); }
  out[v] = (100 * s.reduce((a, x) => a + x[0], 0) / s.length).toFixed(1) + '% @ ' + (s.reduce((a, x) => a + x[1], 0) / s.length).toFixed(1) + ' fps, physics ' + (s.reduce((a, x) => a + x[2], 0) / s.length).toFixed(2) + ' ms';
  G.ropeHeld = null;
}
return JSON.stringify(out);
})()
