(async () => { const { g, p, d, V, len, nz, gt } = PT, w = d.objects.world;
const a = d.artifacts.find(x => x.id === 'room'); p.pos = V.add(a.foot, V.sc(nz(a.foot), 0.05)); p.pos = V.add(p.pos, V.sc(nz(V.sub([1,0,0,0], V.sc(nz(a.foot), V.dot([1,0,0,0], nz(a.foot))))), 6)); p.settleFrame();
await gt(6);
const r1 = w.bodies.find(b => b.kind === 'part' && b.tier === 1);
const awake = w.bodies.filter(b => !b.sleeping && !b.kinematic && !b.fixed && len(V.sub(b.pos, p.pos)) < 30).map(b => b.kind + (b.tier || '') + ':' + len(b.vel).toFixed(3));
const t0 = performance.now(); for (let i = 0; i < 200; i++) w.step(); const ms = (performance.now() - t0) / 200;
return JSON.stringify({ ring1: { sleeping: r1.sleeping, kin: r1.kinematic, v: len(r1.vel).toFixed(4) }, awake, stepMs: ms.toFixed(3), contacts: (w.contacts || []).length }); })()
