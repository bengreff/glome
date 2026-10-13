(async () => { try { const { g, p, d, V, len, nz, gt } = PT, G = g.G, L = d.launcher, out = {};
const key = (code, up) => dispatchEvent(new KeyboardEvent(up ? 'keyup' : 'keydown', { code }));
const O = G.overhang; d.objects.pouch = 1;
const below = () => +(len(p.pos) - 250 - p.hf.heightAt(nz(p.pos))).toFixed(1);
// 1. on its floor, looking out of its mouth (a picture), then toward the pad, going round what is in the way
p.pos = V.add(O.floor, V.sc(nz(O.floor), 0.1)); p.vel = [0, 0, 0, 0];
let f = V.sub(O.mouth, p.pos), u = p.up(); f = V.sub(f, V.sc(u, V.dot(f, u))); p.F = nz(f); p.settleFrame(); p.pitch = 0.05; await gt(1.5);
window.SNAP_READY = true; out.startBelow = below();
return JSON.stringify(out);
} catch (e) { return 'ERR ' + e.message; } })()
