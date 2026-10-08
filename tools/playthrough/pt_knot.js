(async () => {
const { g, p, d, O, w, V, len, nz, gt, place, look } = PT;
const k = d.artifacts.find(a => a.id === 'knot'), post = g.G.knotPost, R = g.G.rope, out = {};
// stand by the post on the loop's side and grab the loop where you see it
const loopPt = R.x[17];
const toPost = nz(V.sub(post.a, loopPt));
place(V.sub(loopPt, V.sc(toPost, 1.3)), toPost); await gt(0.5); look(R.x[17]);
d.actions.fDown = true; await gt(0.2);
out.grabbed = g.G.ropeHeld != null;
// step through ana for four seconds (E), then walk away from the post (S), and let go
g.keys.add('KeyE'); await gt(4); g.keys.delete('KeyE');
g.keys.add('KeyS'); await gt(2.5); g.keys.delete('KeyS');
d.actions.fDown = true; await gt(1.5);
out.solved = !!g.G.flags.solved_knot;
const ab = V.sub(post.b, post.a);
out.closest = Math.min(...R.x.map(q => { const t = Math.max(0, Math.min(1, V.dot(V.sub(q, post.a), ab) / V.dot(ab, ab))); return len(V.sub(q, V.add(post.a, V.sc(ab, t)))); })).toFixed(2);
return JSON.stringify(out);
})()
