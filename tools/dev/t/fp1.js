(async () => { const g = __glome, d = g.dbg, w = d.objects.world, len = a => Math.hypot(...a), wait = ms => new Promise(r => setTimeout(r, ms));
const gens = w.bodies.filter(b => b.gen != null);
const mover = gens.find(b => b.kind === 'tessS'), stone = gens.find(b => b.kind === 'stone');
mover.pos = mover.pos.map((v, i) => v + [0.7, -0.4, 0.3, 0.2][i] * 0.5); mover.sleeping = false;
w.remove(stone); d.objects.pouch++;
await wait(2500);
const S = await import(document.querySelector('script[type=importmap]').textContent.match(/"\.\/js\/save\.js": "([^"]+)"/)[1]); S.saveWorld();
localStorage.setItem('fp.expect', JSON.stringify({ moverGen: mover.gen, moverPos: mover.pos, stoneGen: stone.gen, pouch: d.objects.pouch, n: w.bodies.length }));
return JSON.stringify({ saved: localStorage.getItem('glome.world').length, moverGen: mover.gen, stoneGen: stone.gen, n: w.bodies.length });
})()
