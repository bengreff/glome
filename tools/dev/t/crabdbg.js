(() => { const g = __glome, d = g.dbg, p = g.player, c = window.CRAB, V = { sub: (a, b) => a.map((x, i) => x - b[i]), dot: (a, b) => a.reduce((s, x, i) => s + x * b[i], 0) };
const cam = p.camera(), q = c.n.map(v => v * (250 + p.hf.heightAt(c.n) + 0.7)), dd = V.sub(q, cam.eye);
const legs = d.trees && d.trees.legs;
const tg = d.tgpu, G = tg.groups; let skins = 0, skinCnt = []; for (let i = 0; i < tg.n; i++) if (G[12 * i + 10] === 2) { skins++; skinCnt.push(G[12 * i + 9]); }
return JSON.stringify({ rel: [cam.F, cam.R, cam.U, cam.A].map(e => +V.dot(dd, e).toFixed(2)), crabV: Math.hypot(...c.v).toFixed(2), skins, skinCnt, groups: tg.n, nc: tg.nc });
})()
