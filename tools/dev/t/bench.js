(() => {
// GPU cost of the slice pass alone: draw it n times in one task at a fixed size, then wait for the GPU (readPixels)
const g = __glome, d = g.dbg, gl = d.gl, out = {};
const W = Math.round(3024 * (window.B_SCALE || 0.5)), H = Math.round(1964 * (window.B_SCALE || 0.5));
const cam = d.cameraNow(), sun = g.G.sun, px = new Uint8Array(4), pf = new Float32Array(4);
const sync = () => d.hits.only ? gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, pf) : gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
const time = (n) => { sync(); const t0 = performance.now(); for (let i = 0; i < n; i++) d.drawSlice(cam, sun, 0, 0, W, H); sync(); return (performance.now() - t0) / n; };
const bits = window.B_BITS || { base: 0, trees: 32, props: 262144, treeShadow: 65536, shadows: 2048 };
time(3);
for (const [name, b] of Object.entries(bits)) { g.G.debug = b; time(2); const r = [time(8), time(8), time(8)].sort((a, c) => a - c); out[name] = r[1].toFixed(2); }
g.G.debug = 0;
out.size = W + 'x' + H;
return JSON.stringify(out);
})()
