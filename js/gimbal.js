// The launcher's aim: a barrel on a 4D gimbal over the pad, set by three sliders on a stand beside it. A direction
// above the horizon in 4D is a point on half a 3-sphere: three angles. The first slider turns the barrel about the
// pad (in the plane of the ground's first two directions), the second tips that heading toward ana or kata, the third
// raises it from the horizon to straight up. Each slider is a handle on a rail: take it (F) and it follows your hand
// along its rail; let go and it stays, and so does the barrel. Launching throws you along the barrel.
// Pure geometry; launcher.js builds it.
export const GIMBAL = {
  rail: 0.9,                                   // each rail's length (m)
  range: [[-Math.PI, Math.PI], [-Math.PI / 2, Math.PI / 2], [0, Math.PI / 2]],   // turn, toward ana, up
  start: [0, 0, Math.PI / 4],                  // as found: straight ahead (along the site's f), level in ana, 45° up
};
// The barrel's direction in the site's frame (f, s, a, up) for the three angles.
export function aim([turn, ana, up]) {
  const h = Math.cos(up), c = Math.cos(ana);
  return [h * c * Math.cos(turn), h * c * Math.sin(turn), h * Math.sin(ana), Math.sin(up)];
}
// A slider's angle from its handle's place along the rail (0..1), and back.
export const angleAt = (k, x) => GIMBAL.range[k][0] + (GIMBAL.range[k][1] - GIMBAL.range[k][0]) * Math.max(0, Math.min(1, x));
export const placeOf = (k, ang) => (ang - GIMBAL.range[k][0]) / (GIMBAL.range[k][1] - GIMBAL.range[k][0]);
