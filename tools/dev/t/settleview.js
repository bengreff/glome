(async () => {
// the settle test in each costly view: auto resolution, ~26 s, the last 8 s sampled
const g = __glome, wait = ms => new Promise(r => setTimeout(r, ms)), out = {};
for (const v of (window.VIEWS || ['start', 'inwood', 'outcrop', 'herd', 'down'])) {
  TOUR[v](); g.dyn.scale = 0.6; g.dyn.ceilUntil = 0; g.dyn.floorUntil = 0; g.dyn.probe = null;
  const s = [];
  for (let i = 0; i < 26; i++) { await wait(1000); if (i >= 18) s.push([g.dyn.scale, 1000 / g.prof.interval]); }
  out[v] = (100 * s.reduce((a, x) => a + x[0], 0) / s.length).toFixed(1) + '% @ ' + (s.reduce((a, x) => a + x[1], 0) / s.length).toFixed(1) + ' fps';
}
return JSON.stringify(out);
})()
