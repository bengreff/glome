(async () => { const { g, p, d, O, w, wait, V, len, gt } = PT, out = {}, L = d.launcher, P = L.pillar, { r1 } = PTR;
const key = (code, up) => dispatchEvent(new KeyboardEvent(up ? 'keyup' : 'keydown', { code }));
key('KeyF'); await wait(60); key('KeyF', true); await gt(4);
const dd = V.sub(r1.pos, P.foot), h = V.dot(dd, P.up);
out.rest = { h: h.toFixed(3), seat: (h - (0.30 + Math.sqrt(0.43**2 - 0.39**2) + 0.05)).toFixed(3), off: len(V.sub(dd, V.sc(P.up, h))).toFixed(3), asleep: r1.sleeping };
out.seated = L.seated(r1); out.tier = L.tier; out.ballGlow = P.balls.map(b => +b.glow.toFixed(2)).join(',');
// step back to look at it
p.pos = V.sub(p.pos, V.sc(p.F, 1.2)); p.pitch = -0.12; await gt(0.6);
out.goal = d.guide.goal && d.guide.goal.kind; out.errors = g.G.errors || 0;
return JSON.stringify(out);
})()
