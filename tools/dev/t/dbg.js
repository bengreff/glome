(async () => { try {
  const map = JSON.parse(document.querySelector('script[type=importmap]').textContent).imports;
  const L = await import(map['./js/levers.js']);
  return JSON.stringify({ ok: !!L.levers, shown: L.levers.shown, box: !!L.levers.box, err: __glome.G.lastError || null, errs: __glome.G.errors || 0, hasLevers: Object.keys(map).includes('./js/levers.js') });
} catch (e) { return 'ERR ' + e.message; } })()
