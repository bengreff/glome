(() => { const g = __glome, d = g.dbg, p = g.player, G = g.G;
const V = { add: (a, b) => a.map((x, i) => x + b[i]), sub: (a, b) => a.map((x, i) => x - b[i]), sc: (a, k) => a.map(x => x * k), dot: (a, b) => a.reduce((s, x, i) => s + x * b[i], 0) };
const len = a => Math.hypot(...a), nz = a => V.sc(a, 1 / len(a));
// move along a frame direction by m metres over the ground, keeping the frame (parallel transport, roughly)
const move = (dir, m) => { const u = nz(p.pos), t = nz(V.sub(dir, V.sc(u, V.dot(dir, u)))); const n = nz(V.add(V.sc(u, Math.cos(m / 250)), V.sc(t, Math.sin(m / 250)))); p.pos = V.sc(n, 250 + p.hf.heightAt(n) + 0.05); p.vel = [0,0,0,0]; p.settleFrame(); };
window.U = { V, len, nz, move,
  start: () => { p.pos = G.home.pos.slice(); p.F = G.home.F; p.R = G.home.R; p.A = G.home.A; p.settleFrame(); p.pitch = 0.05; return 'start'; },
  behind: () => { U.start(); p.rotate('FR', Math.PI * 0.8); return 'behind'; },
  toColumn: () => { U.start(); move(p.F, 34); p.pitch = 0.0; return 'walked 34 m toward the column'; },
  stepAna: (m) => { move(p.A, m); return 'stepped ana ' + m; },
  info: () => { const cam = p.camera(), q = G.cave.chamber, m = G.cave.mouth, rel = x => { const dd = V.sub(x, cam.eye); return [V.dot(dd, p.F), V.dot(dd, p.R), V.dot(dd, p.A)].map(v => v.toFixed(1)).join(','); }; return JSON.stringify({ chamber: rel(q), mouth: rel(m), part1: !!G.flags.part1 }); },
};
return 'U ready'; })()
