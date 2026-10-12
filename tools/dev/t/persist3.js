(async () => {
// export/import: wipe the saved world, then import the exported file (which reloads)
const S = await import(document.querySelector('script[type=importmap]').textContent.match(/"\.\/js\/save\.js": "([^"]+)"/)[1]);
localStorage.removeItem('glome.world');
const f = new File([localStorage.getItem('gate.file')], 'gate.hoop', { type: 'application/json' });
const err = await S.importFile(f);
return err || 'importing';
})()
