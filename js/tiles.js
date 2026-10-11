// Screen tiles: the view in squares of 32 pixels, each with the lists of things whose circle on the screen meets it
// (the trees' groups of pieces, and the props), so a pixel's ray is tested only against what can be there.
// Built each frame on the CPU; the shader reads, per tile, (first, how many) of each list in an index list.
export const TILE = 32, MAXIDX = 32768;
export const tiles = { tab: null, idx: new Float32Array(MAXIDX), tx: 0, ty: 0, nidx: 0 };
// lists: [{ data, stride, n }] (two of them): each circle at data[stride·i] as (x, y, radius) in pixels.
export function buildTiles(W, H, lists) {
  const tx = Math.ceil(W / TILE), ty = Math.ceil(H / TILE), nt = tx * ty;
  if (!tiles.tab || tiles.tab.length < nt * 4) tiles.tab = new Float32Array(nt * 4);
  const tab = tiles.tab, idx = tiles.idx;
  let off = 0;
  lists.forEach((L, c) => {
    const cnt = new Int32Array(nt), boxes = new Int32Array(L.n * 4);
    for (let g = 0; g < L.n; g++) {
      const x = L.data[L.stride * g], y = L.data[L.stride * g + 1], r = L.data[L.stride * g + 2];
      const x0 = Math.max(0, Math.floor((x - r) / TILE)), x1 = Math.min(tx - 1, Math.floor((x + r) / TILE));
      const y0 = Math.max(0, Math.floor((y - r) / TILE)), y1 = Math.min(ty - 1, Math.floor((y + r) / TILE));
      boxes.set([x0, x1, y0, y1], 4 * g);
      for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) cnt[j * tx + i]++;
    }
    for (let t = 0; t < nt; t++) { tab[4 * t + 2 * c] = off; tab[4 * t + 2 * c + 1] = 0; off += cnt[t]; }
    for (let g = 0; g < L.n; g++) {                           // (in order, nearest first: if the list is full, the far ones give way)
      const x0 = boxes[4 * g], x1 = boxes[4 * g + 1], y0 = boxes[4 * g + 2], y1 = boxes[4 * g + 3];
      for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
        const t = j * tx + i, k = tab[4 * t + 2 * c] + tab[4 * t + 2 * c + 1];
        if (k >= MAXIDX) continue;
        idx[k] = g; tab[4 * t + 2 * c + 1]++;
      }
    }
  });
  tiles.tx = tx; tiles.ty = ty; tiles.nidx = Math.min(off, MAXIDX);
  return tiles;
}
