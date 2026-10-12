(() => { const g = __glome, d = g.dbg, w = d.objects.world, len = a => Math.hypot(...a), e = JSON.parse(localStorage.getItem('fp.expect'));
const m = w.bodies.find(b => b.gen === e.moverGen), st = w.bodies.find(b => b.gen === e.stoneGen);
return JSON.stringify({ moverBack: !!m, moverDist: m ? len(m.pos.map((v, i) => v - e.moverPos[i])).toFixed(3) : null, stoneGone: !st, pouch: d.objects.pouch === e.pouch, n: w.bodies.length, nExpected: e.n, errors: g.G.errors || 0 });
})()
