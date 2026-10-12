(() => { const d = __glome.dbg, T = 32, W = d.scene.w, H = d.scene.h, tx = Math.ceil(W / T), ty = Math.ceil(H / T), nt = tx * ty, cnt = new Int32Array(nt), G = d.tgpu.groups;
for (let g = 0; g < d.tgpu.n; g++) { const x = G[12 * g], y = G[12 * g + 1], r = G[12 * g + 2]; if (r <= 0) continue; const x0 = Math.max(0, Math.floor((x - r) / T)), x1 = Math.min(tx - 1, Math.floor((x + r) / T)), y0 = Math.max(0, Math.floor((y - r) / T)), y1 = Math.min(ty - 1, Math.floor((y + r) / T)); for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) cnt[j * tx + i]++; }
const cap = Math.floor(262144 / (3 * nt)); let over = 0, max = 0; for (const c of cnt) { if (c > cap) over++; max = Math.max(max, c); }
return JSON.stringify({ W, H, nt, cap, max, over, groups: d.tgpu.n }); })()
