// Builds one chart of the terrain atlas off the main thread.
import { terrainHeight, chartVector } from './world.js?v=20261007225242';

self.onmessage = (e) => {
  const { chart, N } = e.data;
  const out = new Float32Array(N * N * N);
  for (let l = 0; l < N; l++) {
    const u2 = -1 + 2 * l / (N - 1);
    for (let j = 0; j < N; j++) {
      const u1 = -1 + 2 * j / (N - 1);
      for (let i = 0; i < N; i++) {
        out[i + N * j + N * N * l] = terrainHeight(chartVector(chart, -1 + 2 * i / (N - 1), u1, u2));
      }
    }
    if ((l & 7) === 7) self.postMessage({ chart, progress: (l + 1) / N });
  }
  self.postMessage({ chart, data: out }, [out.buffer]);
};
