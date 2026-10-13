(async () => { const { g, p, d, O, w, V, len, nz, gt } = PT, G = g.G, out = {};
const imp = name => import(JSON.parse(document.querySelector('script[type=importmap]').textContent).imports['./js/' + name + '.js']);
const A = await imp('artifacts'), L = d.launcher;
// where each site stands, against its part's place and the start
const arc = (a, b) => Math.acos(Math.max(-1, Math.min(1, V.dot(nz(a), nz(b))))) * 250;
out.sites = A.artifacts.map((a, i) => ({ id: a.id, fromSpot: +arc(a.n, G.partSpots[i]).toFixed(1), fromStart: +arc(a.n, G.home.pos).toFixed(0), h: +p.hf.heightAt(a.n).toFixed(1) }));
// an old save's rings where the old vaults were: unsolved ones go home, a seated one stays
const r1 = w.bodies.find(b => b.kind === 'part' && b.tier === 1), r2 = w.bodies.find(b => b.kind === 'part' && b.tier === 2), key = w.bodies.find(b => b.tag === 'key2');
L.seat(r1); G.flags.part1 = true;
r2.pos = V.add(r2.pos, V.sc(nz(V.sub([1, 0, 0, 0], V.sc(nz(r2.pos), V.dot([1, 0, 0, 0], nz(r2.pos))))), 50));
key.pos = V.add(key.pos, V.sc(nz(V.sub([0, 1, 0, 0], V.sc(nz(key.pos), V.dot([0, 1, 0, 0], nz(key.pos))))), 100));
G.flags.solved_antipode = true;
A.syncArtifacts(); await gt(0.5);
const mir = A.artifacts.find(a => a.id === 'mirror');
out.ring2Home = +len(V.sub(r2.pos, mir.home.pos)).toFixed(3); out.keyHome = +len(V.sub(key.pos, mir.keyHome.pos)).toFixed(2);
out.ring1Seated = L.seated(r1); out.foldSolved = !!G.flags.solved_fold;
return JSON.stringify(out); })()
