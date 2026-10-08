(async () => {
const { g, p, d, O, w, V, len, nz, gt, place, look } = PT;
const m = d.artifacts.find(a => a.id === 'mirror'), key = w.bodies.find(b => b.tag === 'key2');
const [f, s] = m.target, out = {};
// stand 1.4 m behind the key, facing the model's forward f, and look down at it
place(V.sub(key.pos, V.sc(f, 1.4)), f); await gt(0.3); look(key.pos); await gt(0.2);
d.actions.fDown = true; await gt(0.3);
out.holding = O.held === key;
{ const so4 = await import(document.querySelector('script[type=importmap]').textContent.match(/"\.\/js\/so4\.js": "([^"]+)"/)[1]); const M = so4.rot.toRows(key.rot); out.before = [V.dot([0,1,2,3].map(i=>M[i][0]), f).toFixed(2), V.dot([0,1,2,3].map(i=>M[i][1]), s).toFixed(2)]; }
// half a turn through ana: twist (right-drag up/down) by 180°
const mouse = (await import(document.querySelector('script[type=importmap]').textContent.match(/"\.\/js\/input\.js": "([^"]+)"/)[1])).mouse;
mouse.alt = true; mouse.dy = -Math.PI / (0.0022 * g.settings.sens); await gt(0.2); mouse.alt = false;
// walk over (a teleport: the walk isn't the puzzle) to stand before the socket, facing f again, and set it down there
place(V.sub(m.sock, V.sc(f, 0.75)), f); await gt(0.3); look(V.add(m.sock, V.sc(nz(m.sock), 0.4)));
d.actions.fDown = true; await gt(0.9); d.actions.fUp = true; await gt(2.5);
out.solved = !!g.G.flags.solved_mirror;
const so4 = await import(document.querySelector('script[type=importmap]').textContent.match(/"\.\/js\/so4\.js": "([^"]+)"/)[1]);
const M = so4.rot.toRows(key.rot), col = j => [0,1,2,3].map(i => M[i][j]);
out.kx_f = V.dot(col(0), f).toFixed(2); out.ky_s = V.dot(col(1), s).toFixed(2); out.dist = len(V.sub(key.pos, m.sock)).toFixed(2); out.held = !!O.held;
out.kz_up = V.dot(col(2), nz(m.sock)).toFixed(2); out.kw_up = V.dot(col(3), nz(m.sock)).toFixed(2);
out.vault = !!w.bodies.find(b => b.tag === 'vault2');
return JSON.stringify(out);
})()
