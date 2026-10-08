// Every physical constant of the universe, in one object, so the console can change them live and reset them.
// Numbers and their derivations are in docs/PHYSICS.md; change one here only after re-deriving it there.

const PHI = (1 + Math.sqrt(5)) / 2;

export const LAWS = {
  // space: R³ × S¹, the fourth direction closes into a circle (the hoop)
  L: 800,                  // hoop length (m)

  // planet A (home): a uniform 4D ball whose surface is a 3-sphere
  R_A: 250,                // radius (m); the terrain atlas is built for this, so it is fixed at load
  SEA: 0,                  // sea level above R_A (m)
  G_SURF: 9.8,             // surface gravity of the bare planet, ignoring its images (m/s²); G₄M = G_SURF·R_A³
  DAY1: 300,               // the double spin: one turn in the first plane (s) ...
  RATIO: PHI,              // ... and the second plane turns φ times faster, so the days never repeat
  ORBIT_A: 2000,           // radius of A's (circular) orbit round the star (m)

  // the star: a small, hot 4D ball
  STAR_R: 120, STAR_G_SURF: 404,   // radius (m), surface gravity (m/s²): about 4.6 times A's mass

  // planet B: smaller, crystalline, built
  R_B: 120, B_G_SURF: 6, ORBIT_B: 3200,
  B_PHASE: 2.2,            // where B is on its orbit when A is at angle 0 (rad)

  // the law of gravity itself (the console can change it): exponent 4 is the true 4D law, 1/r³;
  // exponent 3 is the 3D law, 1/r², under which close orbits work
  GRAV_DIM: 4,
  G_SCALE: 1,              // multiplies every mass's pull
  TIME_RATE: 1,            // how fast the world's clock runs

  // the walker
  EYE: 1.62,               // eye height above the feet (m)
  WALK: 4.2, RUN: 9.5,     // ground speeds (m/s)
  JUMP: 5.2,               // take-off speed (m/s)
  MU: 0.9,                 // Coulomb friction, rock on rock and feet on rock
  CLIMB: 2.2,              // scrambling speed up a boulder (m/s)
};

// A frozen copy of the true laws, for the console's reset.
export const TRUE_LAWS = Object.freeze({ ...LAWS });
export function resetLaws() { Object.assign(LAWS, TRUE_LAWS); }
