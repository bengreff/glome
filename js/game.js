// Shared runtime state. Modules read it through G (filled in at boot), so the modules never import each other in
// a cycle: main.js wires them together.

export const G = {
  state: {
    time: 0, help: false,
    radar: { big: false, range: 90, compass: false, yaw: 0, el: 0.42, layers: 0, hidden: false, grow: 0 },
    facing: null, faced: null,
  },
  player: null,
  flags: {},              // what has happened in this world (first sights, escapes, solved artifacts): saved
  simT: 0,                 // seconds since the world started this session (wall clock, capped per frame)
};

// The direction of the star (its main image) from the planet, in the planet's own frame: the planet double-rotates
// and orbits, so in its frame the sun circles in two planes at once and drifts with the year.
export { starDirBody as sunDir } from './cosmos.js';
