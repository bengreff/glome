// Builds one chart of the terrain atlas off the main thread: the ground's height at N³ points, and the water's
// level (the sea, or a river 0.5 m above its bed) at (N/2)³ points.
import { terrainHeight, waterLevel, chartVector } from './world.js?v=20261008110927';

self.onmessage = (e) => {
  const { chart, N } = e.data, NW = N >> 1;
  const out = new Float32Array(N * N * N);
  for (let l = 0; l < N; l++) {
    const u2 = -1 + 2 * l / (N - 1);
    for (let j = 0; j < N; j++) {
      const u1 = -1 + 2 * j / (N - 1);
      for (let i = 0; i < N; i++) {
        out[i + N * j + N * N * l] = terrainHeight(chartVector(chart, -1 + 2 * i / (N - 1), u1, u2));
      }
    }
    if ((l & 7) === 7) self.postMessage({ chart, progress: (l + 1) / N * 0.95 });
  }
  const water = new Float32Array(NW * NW * NW);
  for (let l = 0; l < NW; l++) for (let j = 0; j < NW; j++) for (let i = 0; i < NW; i++)
    water[i + NW * j + NW * NW * l] = waterLevel(chartVector(chart, -1 + 2 * i / (NW - 1), -1 + 2 * j / (NW - 1), -1 + 2 * l / (NW - 1)));
  self.postMessage({ chart, data: out, water }, [out.buffer, water.buffer]);
};
