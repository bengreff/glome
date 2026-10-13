(async () => {
// persistence of the built things: the knot gate's leaf fallen and its rope, three of the fold's plates up, the
// launcher's sliders moved; save, and remember what to expect
const { g, d } = PT, G = g.G, so4 = await import(JSON.parse(document.querySelector('script[type=importmap]').textContent).imports['./js/so4.js']), R4 = so4.rot;
const k = G.knot, fd = G.fold, L = d.launcher;
k.leaf.rot = R4.compose(k.R, R4.planeRotation(0, 3, -1.55)); k.leaf.pos = k.joint.ca.map((v, i) => v + R4.apply(k.leaf.rot, k.leaf.com)[i]);
for (const i of [0, 2, 4]) { const j = fd.joints[i], b = fd.plates[i]; b.rot = R4.compose(j.Fa, R4.planeRotation(0, 3, Math.PI / 2)); b.pos = j.ca.map((v, q) => v + R4.apply(b.rot, b.com)[q]); }
L.setAim([0.7, -0.4, 0.9]);
const expect = { leaf: +(k.angle() * 57.3).toFixed(1), plates: fd.angles().map(x => +(x * 57.3).toFixed(0)), aim: L.aim.angles.map(x => +(x * 57.3).toFixed(1)) };
localStorage.setItem('gate.built', JSON.stringify(expect));
const S = await import(JSON.parse(document.querySelector('script[type=importmap]').textContent).imports['./js/save.js']);
S.saveWorld();
return JSON.stringify(expect);
})()
