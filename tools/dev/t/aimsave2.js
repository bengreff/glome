(() => { const d = __glome.dbg, L = d.launcher, out = { angles: L.aim.angles.map(v => +v.toFixed(3)), speed: L.speed };
const rec = JSON.parse(localStorage.getItem('glome.world')); rec.aim = [0.75, 0.5, 0.5]; __glome.G.resetting = true; localStorage.setItem('glome.world', JSON.stringify(rec));
return JSON.stringify(out); })()
