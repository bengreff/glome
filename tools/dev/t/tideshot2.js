(async () => { const { g, p, gt } = PT, G = g.G; G.state.time = window.__hi; await gt(1.0); return JSON.stringify({ high: 'set' }); })()
