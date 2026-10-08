// Objects you can pick up, carry, throw and stack: 4D balls ("glomes") and tesseracts in two sizes, impulse
// stones, and lanterns. Their physics is in bodies.js; this module is the game side: what exists, what you hold,
// and what goes to the GPU.
import { G } from './game.js';

export const MAXO = 12, MAXL = 4;
// What the shader draws: the nearest objects, the ones your slice cuts first.
export const gpuObj = { C: new Float32Array(MAXO * 4), M: new Float32Array(MAXO * 16), P: new Float32Array(MAXO * 4), n: 0, cut: 0,
                        LP: new Float32Array(MAXL * 4), LC: new Float32Array(MAXL * 4), ln: 0 };
