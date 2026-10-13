(async () => { const { g, d } = PT, G = g.G, L = d.launcher, exp = JSON.parse(localStorage.getItem('gate.built'));
const got = { leaf: +(G.knot.angle() * 57.3).toFixed(1), plates: G.fold.angles().map(x => +(x * 57.3).toFixed(0)), aim: L.aim.angles.map(x => +(x * 57.3).toFixed(1)) };
return JSON.stringify({ exp, got, leafOk: Math.abs(exp.leaf - got.leaf) < 1, platesOk: exp.plates.join() === got.plates.join(), aimOk: exp.aim.join() === got.aim.join() }); })()
