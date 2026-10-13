(async () => {
// The launcher's levers, as a player works them: stand on the pad, and with the mouse free drag the raise lever up
// and the speed lever to the top, turn the wheel over the turn lever; the barrel and the speed follow. Then jump: you
// go the way the barrel points, at the speed set.
const { g, p, d, V, len, nz, gt } = PT, L = d.launcher, A = L.aim, out = {};
const imp = name => import(document.querySelector('script[type=importmap]').textContent.match(new RegExp('"\\./js/' + name + '\\.js": "([^"]+)"'))[1]);
const { levers } = await imp('levers'), cv = document.getElementById('view');
const k = document.getElementById('overlay').width / innerWidth;
const up = nz(L.site); p.pos = V.add(L.site, V.sc(up, 0.05)); p.vel = [0, 0, 0, 0]; p.settleFrame(); await gt(0.6);
out.onPad = L.onPad; out.panel = levers.shown && !!levers.box;
if (!levers.box) return JSON.stringify(out);
const b = levers.box, cx = i => (b.x + b.pad + b.slotW * (i + 0.5)) / k, yOf = f => (b.bot - f * (b.bot - b.top)) / k;
const mouse = (type, x, y, tgt = window) => tgt.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }));
const drag = async (i, f0, f1) => { mouse('mousedown', cx(i), yOf(f0), cv); await gt(0.05); for (let s = 1; s <= 6; s++) { mouse('mousemove', cx(i), yOf(f0 + (f1 - f0) * s / 6)); await gt(0.03); } mouse('mouseup', cx(i), yOf(f1)); await gt(0.05); };
const deg = v => +(v * 57.2958).toFixed(1);
out.start = { angles: A.angles.map(deg), speed: +L.speed.toFixed(1) };
// raise: from 45° (halfway) to 72° (0.8 of 0–90)
await drag(2, 0.5, 0.8); out.raise = deg(A.angles[2]);
// speed to the top
await drag(3, L.speed / 72, 1.0); out.speedTop = +L.speed.toFixed(1);
// tip toward ana a little: the ana lever from its middle to 0.6 (+18°)
await drag(1, 0.5, 0.6); out.tip = deg(A.angles[1]);
// the wheel over the turn lever: five clicks toward you (up)
mouse('mousemove', cx(0), yOf(0.5)); await gt(0.05);
const t0 = A.angles[0]; for (let i = 0; i < 5; i++) { window.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: cx(0), clientY: yOf(0.5) })); await gt(0.02); }
out.wheel = +((A.angles[0] - t0) * 57.2958).toFixed(1);
// speed back to 43 m/s, and jump
await drag(3, 1.0, 43 / 72); out.speed = +L.speed.toFixed(1);
const dirNow = A.dir.slice(), n0 = g.G.flags.launches || 0;
g.keys.add('Space'); await gt(0.05); g.keys.delete('Space'); await gt(0.1);
out.launched = (g.G.flags.launches || 0) > n0;
const v = d.flight.active ? null : p.vel;
out.launch = v ? +(Math.acos(Math.min(1, V.dot(nz(v), dirNow))) * 57.3).toFixed(1) : 'in flight';
out.launchSpeed = v ? +len(v).toFixed(1) : null;
out.errors = g.G.errors || 0; out.lastError = g.G.lastError || null;
return JSON.stringify(out);
})()
