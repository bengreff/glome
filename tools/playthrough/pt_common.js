window.PT = (() => {
  const g = __glome, p = g.player, d = g.dbg, O = d.objects, w = O.world, wait = ms => new Promise(r => setTimeout(r, ms));
  const V = { add:(a,b)=>a.map((x,i)=>x+b[i]), sc:(a,s)=>a.map(x=>x*s), sub:(a,b)=>a.map((x,i)=>x-b[i]), dot:(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0) };
  const len = a => Math.hypot(...a), nz = a => V.sc(a, 1/len(a));
  const gt = async s => { const t0 = g.state.time; while (g.state.time - t0 < s) await wait(30); };
  const place = (pos, F) => { const n = nz(pos); p.pos = V.sc(n, 250 + p.hf.heightAt(n) + 0.05); p.vel = [0,0,0,0]; const u = p.up(); p.F = nz(V.sub(F, V.sc(u, V.dot(F, u)))); p.settleFrame(); };
  const look = q => { const dd = V.sub(q, p.camera().eye), u = p.up(); p.pitch = Math.asin(V.dot(nz(dd), u)); };
  return { g, p, d, O, w, wait, V, len, nz, gt, place, look };
})(); 1
