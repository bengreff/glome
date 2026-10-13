(async () => { const { g, p, d, V, len, nz, gt } = PT, c = window.CRAB; c.curious = false; c.alarm = 0.6; await gt(0.5); return JSON.stringify({ v: +len(c.v).toFixed(2) }); })()
