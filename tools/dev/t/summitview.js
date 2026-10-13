(async () => { const { g, p, d, V, len, nz, gt, place, look } = PT, L = d.launcher;
const up = nz(L.site), T = [[-up[1],up[0],up[3],-up[2]],[-up[2],-up[3],up[0],up[1]],[-up[3],up[2],-up[1],up[0]]];
const dir = V.sc(T[0], -1);
place(V.sc(nz(V.add(V.sc(up, 250), V.sc(dir, 9))), 250), V.sc(dir, -1)); await gt(0.5); look(L.site); p.pitch -= 0.12; await gt(1.0);
const prof = [0, 1, 2, 3, 4, 5, 6, 7].map(r => { const hs = [T[0], V.sc(T[0], -1), T[1], V.sc(T[1], -1), T[2], V.sc(T[2], -1)].map(t => p.hf.heightAt(nz(V.add(V.sc(up, 250), V.sc(t, r))))); return `${r}m:${Math.min(...hs).toFixed(2)}..${Math.max(...hs).toFixed(2)}`; });
return JSON.stringify({ top: L.h.toFixed(2), prof: prof.join(' ') });
})()
