(() => { const d = __glome.dbg, L = d.launcher; L.setAim([0.5, 0.2, 0.9]); L.setSpeed(60); d.save.saveWorld();
const rec = JSON.parse(localStorage.getItem('glome.world')); return JSON.stringify(rec.aim); })()
