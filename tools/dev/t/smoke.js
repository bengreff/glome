(() => { const g = __glome, p = g.player, d = g.dbg; const a = d.cosmos.accelBodyA(p.pos, [0,0,0,0], g.state.time);
return JSON.stringify({ errors: g.G.errors || 0, lastError: g.G.lastError || null, gStart: Math.hypot(...a).toFixed(2), hStart: (Math.hypot(...p.pos) - 250).toFixed(1), boot: g.G.boot && Math.round(g.G.boot.total) }); })()
