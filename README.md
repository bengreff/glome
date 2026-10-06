# Hoop

**A walkable planet in four spatial dimensions.** [Play it in the browser](https://bengreff.github.io/hoop-4d/) (desktop, keyboard and mouse, WebGL 2).

Hoop is not a 3D game with a fourth-dimension gimmick. The world is a genuine 4D ball, and every pixel is a 4D ray traced through it. Geometry, surface normals, sunlight and shadows are all computed in four dimensions.

## What is real here
- **The ground is a 3-sphere.** You can walk forward, sideways *and* along a third horizontal direction (ana/kata). Walk straight in any direction and you return to where you started, about 1.6 km later.
- **Two ways to see.**
  - **Slice view:** the 3D cross-section through your eyes, which is what a 3D visitor would perceive. Turning toward ana sweeps the slice through the landscape.
  - **4D eye:** what a native sees. Its retina is three-dimensional, shown as a translucent cube with depth edges and silhouettes made opaque. The horizon becomes a surface floating inside it.
- **Shadows from places you can't see.** Lighting uses the full 4D sun direction, so hills that lie beside you in ana, outside the slice, still cast shadows into it.
- **No poles, irregular days.** The planet spins in two planes at once (a double rotation), so every place gets day and night, and day lengths vary. Press <kbd>T</kbd> for an isoclinic spin, where both rates are equal.
- **Stars are points on a 3-sphere of directions.** In the slice view you only see the ones close to your slice, so they fade in and out as you turn through ana.

## Controls
| | |
|---|---|
| <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> | walk |
| <kbd>Q</kbd> <kbd>E</kbd> | step kata / ana |
| <kbd>Space</kbd> <kbd>Shift</kbd> | jump or swim up · run |
| mouse | turn, look up and down |
| right-drag or <kbd>Alt</kbd>+mouse | turn toward ana · twist |
| <kbd>Z</kbd> <kbd>C</kbd> | turn toward kata / ana |
| <kbd>V</kbd> | slice view ↔ 4D eye |
| <kbd>[</kbd> <kbd>]</kbd> <kbd>P</kbd> | time slower / faster · pause |
| <kbd>X</kbd> | tint slopes by the way they climb in ana |
| <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>G</kbd> | resolution · shadows |
| <kbd>H</kbd> | help |

## How it works
- **Terrain:** 4D value noise sampled on a *cubed 3-sphere*: 8 cubic charts, one per tesseract cell. It's generated at load time in 8 web workers and stored in a 3D texture.
- **Shared height lookups:** the shader and the physics use the same cubic B-spline lookup. Neighbouring charts are blended across seams, so what you see is exactly what you walk on.
- **Rendering:** sphere-traced in GLSL (WebGL 2). Coarse steps use a cheap, lifted surface, and only rays near the ground evaluate the smooth one.
- **The 4D eye:** renders a 64³ retina into a 3D texture, layer by layer, then volume-renders it.

No build step: plain ES modules. To run locally, serve the folder with any static server.

## Roadmap
1. ✅ Walk the planet: terrain, water, sun, day and night, gravity, slice view and 4D eye.
2. Things: rocks to throw and spin with true 4D rigid-body rotation, trees branching in three horizontal directions, buildings with 3D walls.
3. Sky: the w-direction becomes a circle (the "hoop"), giving stable orbits, a sun that appears as a band across the sky, and your own planet seen again along w.
4. Ropes that can't hold knots, flowing water, sound with its 4D wake, creatures.
