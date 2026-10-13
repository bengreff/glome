// I, the closed room. A small stone room on a platform, ring I on a plinth inside, seen through a grille in its front
// wall. In your slice it is closed on every side, its roof too: no door, and the grille's bars too close to pass.
// But its walls are 3D cells that reach only a metre toward ana and kata: a room is closed in four dimensions only if
// it has walls toward ana as well, and this one has none. Step through ana past the walls' ends (from there the room
// is gone from your slice), walk over its floor, and step back: you are inside. Out the same way.
// Pure geometry; artifacts.js builds it into the world.

// The site's frame: axis 0 f (the grille faces −f), 1 s, 2 a, 3 up; origin on the platform's top at the room's centre.
// The room: 2.4 m across inside (f and s), 2.3 m high (you are 2.05), walls 0.2 thick reaching ±D toward ana. The
// platform reaches well past them toward ana and kata, so you stand on it beside the room.
export const ROOM = { D: 1.0, part: [0.55, 0, 0, 0.9] };
export function roomParts() {
  const D = ROOM.D, B = (c, e) => ({ shape: 'box', c, e });
  const bars = [-0.375, -0.225, -0.075, 0.075, 0.225, 0.375].map(s => B([-1.3, s, 0, 1.3], [0.02, 0.02, D, 0.5]));
  return {
    platform: [B([0, 0, 0, -0.35], [3.2, 3.2, 3.4, 0.35])],
    walls: [
      B([-1.3, 0, 0, 0.4], [0.1, 1.4, D, 0.4]), B([-1.3, 0, 0, 2.05], [0.1, 1.4, D, 0.25]),             // the front: under and over the grille
      B([-1.3, 0.95, 0, 1.3], [0.1, 0.45, D, 0.5]), B([-1.3, -0.95, 0, 1.3], [0.1, 0.45, D, 0.5]),     // ... and either side of it
      B([1.3, 0, 0, 1.15], [0.1, 1.4, D, 1.15]),                                                        // the back
      B([0, 1.3, 0, 1.15], [1.2, 0.1, D, 1.15]), B([0, -1.3, 0, 1.15], [1.2, 0.1, D, 1.15]),           // the sides
      B([0, 0, 0, 2.4], [1.4, 1.4, D, 0.1]),                                                            // the roof
      B([0.55, 0, 0, 0.45], [0.6, 0.6, 0.6, 0.45]),                                                     // the plinth, at the back (room to stand before it;
                                                                                                          // wider than ring I, so the ring lies flat on it)
    ],
    bars,
  };
}
// Inside the room (a point in the site's frame)?
export const inRoom = l => Math.abs(l[0]) < 1.2 && Math.abs(l[1]) < 1.2 && Math.abs(l[2]) < ROOM.D && l[3] > -0.5 && l[3] < 2.3;
