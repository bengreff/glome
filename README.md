# Hoop

**A walkable planet in four spatial dimensions.** [Play it in the browser](https://bengreff.github.io/hoop-4d/) (desktop, keyboard and mouse, WebGL 2).

Hoop is not a 3D game with a fourth-dimension gimmick. The world is a genuine 4D ball, and every pixel is a 4D ray traced through it. Geometry, surface normals, sunlight and shadows are all computed in four dimensions.

## What is real here
- **The ground is a 3-sphere.** You can walk forward, sideways *and* along a third horizontal direction (ana/kata). Walk straight in any direction and you return to where you started, about 1.6 km later.
- **Slice view (default).** The 3D cross-section through your eyes, which is what a 3D visitor would perceive. Turning toward ana sweeps the slice through the landscape. 
- **Radar.** The ground is three-dimensional, so the minimap is a glass ball. The disc through its centre is exactly the ground your slice shows; above the disc is ana, below is kata. Ground above 24 m is solid, so mountains float in the ball as objects; water is blue haze (<kbd>L</kbd> adds contour shells); the disc is tinted where mountains lie toward ana or kata; summits on stalks down to the disc, and your trail as a line through all three ground directions. <kbd>Tab</kbd> enlarges it.
- **Spin it, zoom it, use it.** Arrow keys (or Esc and drag) spin the ball, the mouse wheel zooms from 25 to 320 m, and with the mouse free a click on a summit turns you smoothly until it lies in your slice, straight ahead.
- **A compass with no poles.** The 3-sphere is parallelizable: multiplying your position (as a unit quaternion) by i, j and k gives three perpendicular directions along the ground everywhere. Walking straight keeps your compass heading fixed while the other two needles roll around it, once per lap of the planet. <kbd>M</kbd> switches the radar between heading-up and compass-up.
- **Triptych** (<kbd>V</kbd>). A 4D creature's retina is three-dimensional (right, up, ana); your slice is its middle layer. The triptych shows three of its layers side by side: kata 25° · slice · ana 25°.
- **Boulders that swell and vanish.** Boulders are 4D balls, intersected analytically. A slice cuts one in a 3D ball of radius √(r² − a²), where a is how far its centre lies toward ana, so turning makes them grow out of nothing and disappear. They cast 4D shadows and are solid to walk into; the radar shows them all and rings the ones your slice cuts.
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
| <kbd>V</kbd> <kbd>Shift</kbd>+<kbd>V</kbd> | slice ↔ triptych · 4D-eye cube |
| <kbd>Tab</kbd> <kbd>−</kbd> <kbd>=</kbd> <kbd>M</kbd> <kbd>O</kbd> | radar: enlarge · zoom (or wheel) · heading-up / compass-up · rocking |
| arrows · <kbd>Esc</kbd> + drag / click | spin the radar · click a summit to face it |
| <kbd>[</kbd> <kbd>]</kbd> <kbd>P</kbd> | time slower / faster · pause |
| <kbd>X</kbd> | tint slopes by the way they climb in ana |
| <kbd>0</kbd> <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>G</kbd> | automatic / fixed resolution · shadows |
| <kbd>H</kbd> | help |

## How it works
- **Terrain:** 4D value noise sampled on a *cubed 3-sphere*: 8 cubic charts, one per tesseract cell. It's generated at load time in 8 web workers and stored in a 3D texture.
- **Shared height lookups:** the shader and the physics use the same cubic B-spline lookup. Neighbouring charts are blended across seams, so what you see is exactly what you walk on.
- **One fetch per step:** the atlas is pre-smoothed with the cubic B-spline kernel, so a single hardware-trilinear fetch per ray-march step tracks the smooth surface. The median difference is about 1 cm.
- **Detail without geometry:** bump-mapped normals and albedo variation come from a tileable 3D gradient-noise texture, sampled through two different projections of the 4D point. That way no 4D direction leaves the pattern constant.
- **Resolution:** dynamic resolution holds about 60 fps, and a contrast-adaptive sharpening pass upscales the image to full screen resolution.
- **The 4D eye:** renders a 64³ retina into a 3D texture, layer by layer, then volume-renders it.

No build step: plain ES modules. To run locally, serve the folder with any static server.

## Roadmap
1. ✅ Walk the planet: terrain, water, sun, day and night, gravity, slice view and 4D eye.
2. Things: rocks to throw and spin with true 4D rigid-body rotation, trees branching in three horizontal directions, buildings with 3D walls.
3. Sky: the w-direction becomes a circle (the "hoop"), giving stable orbits, a sun that appears as a band across the sky, and your own planet seen again along w.
4. Ropes that can't hold knots, flowing water, sound with its 4D wake, creatures.
