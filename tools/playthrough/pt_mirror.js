(async () => {
// The mirror key, as a player does it, with only the turns a player can make (turning about up, and through ana:
// Z C, right-drag), never a frame set by hand; walking is a teleport, which isn't the puzzle. Square your slice with
// the structure; take the key and push it into the mould as found (it jams); take it again, turn it half a turn
// through ana in your hands (R and right-drag sideways), push it in: the cube is whole and the house's door is gone.
const { g, p, d, O, w, V, len, nz, gt } = PT;
const m = d.artifacts.find(a => a.id === 'mirror'), key = w.bodies.find(b => b.tag === 'key2'), out = {};
const so4 = await import(document.querySelector('script[type=importmap]').textContent.match(/"\.\/js\/so4\.js": "([^"]+)"/)[1]);
const col = j => so4.rot.apply(m.R, [0, 1, 2, 3].map(i => (i === j ? 1 : 0)));
const f = col(0), s_ = col(1), up = nz(m.foot), P0 = 0.85;
const centre = V.add(m.foot, V.sc(up, P0 + 0.4));
const keyBox = () => so4.rot.apply(key.rot, V.sub([0.2, 0.2, 0.2, 0], key.com)).map((v, i) => v + key.pos[i]);   // the centre of its cells
const horiz = v => V.sub(v, V.sc(up, V.dot(v, up)));
const standAt = q => { const n = nz(q); p.pos = V.sc(n, 250 + p.hf.heightAt(n) + 0.05); p.vel = [0, 0, 0, 0]; p.settleFrame(); };
const faceDir = async dir => { for (let i = 0; i < 60; i++) { const a = Math.atan2(V.dot(dir, p.R), V.dot(dir, p.F)), b = Math.atan2(V.dot(dir, p.A), V.dot(dir, p.F)); if (Math.abs(a) + Math.abs(b) < 0.002) break; p.rotate('FR', a); p.rotate('FA', b); await gt(0.02); } };
const tap = async () => { d.actions.fDown = true; await gt(0.05); d.actions.fUp = true; await gt(0.4); };
// take the key: stand 1.4 m short of it along your facing, look at it, F
const take = async () => { standAt(V.sub(key.pos, V.sc(p.F, 1.4))); await gt(0.5); p.pitch = Math.asin(V.dot(nz(V.sub(key.pos, p.camera().eye)), p.up())); await gt(0.3); d.actions.fDown = true; await gt(0.4); return O.held === key; };
// push it in: stand before the mould facing +f with the key's cells level with the opening, then walk in; let go
const pushIn = async () => {
  standAt(V.sub(centre, V.sc(f, 1.9))); await gt(0.4);
  for (let i = 0; i < 40; i++) {                                     // line it up 0.8 m short of the mould
    const c = V.sub(keyBox(), centre), ahead = V.dot(c, f) + 0.8, side = V.dot(c, p.R), ana = V.dot(c, p.A), h = V.dot(c, up);
    p.pitch = Math.max(-1, Math.min(1, p.pitch - 0.5 * h / 1.0));
    p.pos = V.sub(V.sub(V.sub(p.pos, V.sc(p.F, 0.5 * ahead)), V.sc(p.R, 0.5 * side)), V.sc(p.A, 0.5 * ana)); await gt(0.06);
  }
  let last = -9;
  for (let i = 0; i < 80; i++) {                                     // in, at a walk, until it is home or will go no further
    const c = V.sub(keyBox(), centre), h = V.dot(c, up), along = V.dot(c, f);
    if (along > -0.02) break;
    p.pitch = Math.max(-1, Math.min(1, p.pitch - 0.5 * h / 1.0));
    p.pos = V.add(p.pos, V.sc(p.F, 0.02)); await gt(0.05);
    if (i % 10 === 9) { if (along - last < 0.02) break; last = along; }
  }
  const c = V.sub(keyBox(), centre); out.release = (out.release || []).concat([[V.dot(c, f), V.dot(c, s_), V.dot(c, up)].map(x => +x.toFixed(2))]);
  await tap(); await gt(2.5);
};
// 0. go there and square your slice with the structure: face f, then twist (right-drag up/down) until your
// sideways is the site's s and the mould's cells stand square in view
standAt(V.sub(centre, V.sc(f, 3))); await gt(0.3);
await faceDir(f);
for (let i = 0; i < 60; i++) { const a = Math.atan2(V.dot(s_, p.A), V.dot(s_, p.R)); if (Math.abs(a) < 0.002) break; p.rotate('RA', a); await gt(0.02); }
out.squared = Math.abs(V.dot(p.R, s_)) > 0.999;
// 1. take the key and push it in as found
out.took = await take();
await pushIn(); out.asFound = { solved: !!g.G.flags.solved_mirror };
// 2. take it again (where it stuck), and turn it half a turn through ana in your hands: hold R and the right button
// and drag sideways (the plane of forward and ana); then push it in again
await faceDir(f); out.retook = await take();
const input = await import(document.querySelector('script[type=importmap]').textContent.match(/"\.\/js\/input\.js": "([^"]+)"/)[1]);
const keys = g.keys;
keys.add('KeyR'); input.mouse.alt = true;
for (let i = 0; i < 30; i++) { input.mouse.dx += Math.PI / (0.0022 * g.settings.sens * 2.5) / 30; await gt(0.03); }
input.mouse.alt = false; keys.delete('KeyR'); await gt(1.0);
{ const M = so4.rot.toRows(key.rot), kc = j => [0, 1, 2, 3].map(i => M[i][j]); out.attTurned = [0, 1, 2, 3].map(j => [0, 1, 2, 3].map(i => Math.round(V.dot(kc(j), i < 3 ? col(i) : up))).join('')); }
await pushIn();
out.turned = { solved: !!g.G.flags.solved_mirror, door: !!w.bodies.find(b => b.tag === 'vault2'), ballsLit: m.balls.every(b => b.glow > 0.5) };
return JSON.stringify(out);
})()
