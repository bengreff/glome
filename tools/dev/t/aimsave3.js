(() => { const L = __glome.dbg.launcher; return JSON.stringify({ oldSliders: L.aim.angles.map(v => +(v * 57.2958).toFixed(1)), speed: L.speed, errors: __glome.G.errors || 0 }); })()
