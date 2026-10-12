// Screen tiles: the view in squares of 32 pixels, each with the lists of things whose circle on the screen meets it
// (the trees' groups of pieces, and the props), so a pixel's ray is tested only against what can be there.
// Built each frame on the CPU; the shader reads, per tile, (first, how many) of each list in an index list.
export const TILE = 32, MAXIDX = 262144;
export const tiles = { tab: null, idx: new Float32Array(MAXIDX), tx: 0, ty: 0, nidx: 0 };   // tab: two texels per tile, (first, count) of up to four lists
// lists: [{ data, stride, n }] (up to four): each circle at data[stride·i] as (x, y, radius) in pixels (radius 0: none).
export function buildTiles(W, H, lists) {
  const tx = Math.ceil(W / TILE), ty = Math.ceil(H / TILE), nt = tx * ty;
  if (!tiles.tab || tiles.tab.length < nt * 8) tiles.tab = new Float32Array(nt * 8);
  const tab = tiles.tab, idx = tiles.idx;
  if (!tiles.cnt || tiles.cnt.length < nt) tiles.cnt = new Int32Array(nt);           // (scratch, kept between frames)
  let off = 0;
  lists.forEach((L, c) => {
    const cnt = tiles.cnt; cnt.fill(0, 0, nt);
    if (!tiles.boxes || tiles.boxes.length < L.n * 4) tiles.boxes = new Int32Array(Math.max(1024, L.n * 8));
    const boxes = tiles.boxes;
    for (let g = 0; g < L.n; g++) {
      const x = L.data[L.stride * g], y = L.data[L.stride * g + 1], r = L.data[L.stride * g + 2];
      if (r <= 0) { boxes.set([1, 0, 1, 0], 4 * g); continue; }   // off the screen
      const x0 = Math.max(0, Math.floor((x - r) / TILE)), x1 = Math.min(tx - 1, Math.floor((x + r) / TILE));
      const y0 = Math.max(0, Math.floor((y - r) / TILE)), y1 = Math.min(ty - 1, Math.floor((y + r) / TILE));
      boxes.set([x0, x1, y0, y1], 4 * g);
      for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) cnt[j * tx + i]++;
    }
    // each tile holds at most its share of the list (a near thing can cover the whole screen); in order, nearest first,
    // so where a tile is full it is the farthest that give way
    // (and the whole list never outgrows its texture, however many tiles a large screen has)
    const cap = Math.max(1, Math.floor(MAXIDX / (lists.length * nt)));
    for (let t = 0; t < nt; t++) { const n = Math.max(0, Math.min(cnt[t], cap, MAXIDX - off)); cnt[t] = n; tab[8 * t + 2 * c] = off; tab[8 * t + 2 * c + 1] = 0; off += n; }
    for (let g = 0; g < L.n; g++) {
      const x0 = boxes[4 * g], x1 = boxes[4 * g + 1], y0 = boxes[4 * g + 2], y1 = boxes[4 * g + 3];
      for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
        const t = j * tx + i, have = tab[8 * t + 2 * c + 1];
        if (have >= cnt[t]) continue;
        idx[tab[8 * t + 2 * c] + have] = g; tab[8 * t + 2 * c + 1] = have + 1;
      }
    }
  });
  tiles.tx = tx; tiles.ty = ty; tiles.nidx = off;
  return tiles;
}
