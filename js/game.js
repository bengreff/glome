// Shared runtime state. Modules read it through G (filled in at boot), so the modules never import each other in
// a cycle: main.js wires them together.
import { LAWS } from './laws.js';

export const G = {
  state: {
    time: 0, help: false,
    radar: { big: false, range: 90, compass: false, yaw: 0, el: 0.42, layers: 0, hidden: false, grow: 0 },
    facing: null, faced: null,
  },
  player: null,
  simT: 0,                 // seconds since the world started this session (wall clock, capped per frame)
};

// The planet double-rotates; in the planet's own frame the sun circles in two planes at once.
export function sunDir(t) {
  const a = Math.SQRT1_2, w1 = 2 * Math.PI / LAWS.DAY1, w2 = w1 * LAWS.RATIO;
  return [a * Math.cos(w1 * t), -a * Math.sin(w1 * t), a * Math.cos(w2 * t), -a * Math.sin(w2 * t)];
}
