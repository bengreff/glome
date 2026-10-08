# Glome

**A walkable planet in four spatial dimensions.** [Play it in the browser](https://bengreff.github.io/glome/) (desktop, keyboard and mouse, WebGL 2).

Glome is not a 3D game with a fourth-dimension gimmick. The world is a genuine 4D ball, and every pixel is a 4D ray traced through it. Geometry, surface normals, sunlight and shadows are all computed in four dimensions.

## Where it is going
(The name: a *glome* is a 4D ball — the planets, the star and the boulders are all glomes. The looping fourth direction is still called the hoop.)
Glome is becoming a small, wordless, self-contained 4D universe: one star, two planets, and a fourth direction that loops back on itself.
- **Physics:** exact gravity, with real 4D rigid bodies to throw and stack.
- **The world:** geometric creatures, caves you can only enter from ana, and a flight off the planet that fails to orbit before it loops the star.
- **The puzzle:** a quiet chain of artifacts that ends at the console of the simulation itself.

The plan is in [docs/DESIGN.md](docs/DESIGN.md), and the laws and numbers are in [docs/PHYSICS.md](docs/PHYSICS.md).

## What is real here
- **The ground is a 3-sphere.** You can walk forward, sideways *and* along a third horizontal direction (ana/kata). Walk straight in any direction and you return to where you started, about 1.6 km later.
- **Slice view.** The 3D cross-section through your eyes, which is what a 3D visitor would perceive. Turning toward ana sweeps the slice through the landscape.
- **Radar: the ground as a ball.** The ground is three-dimensional, so the minimap is a glass ball with you at its centre. The disc through it is exactly the ground your slice shows; above the disc is ana, below is kata. Mountains float in it as solid shapes, water is blue haze, the disc is tinted where mountains lie toward ana or kata, summits sit on stalks, and your trail traces your walk through all three ground directions. The point at the centre of your view is marked on the disc.
- **The whole planet.** Zoomed all the way out (785 m), the ball holds the entire planet, and its whole outer surface is a single point: your antipode. <kbd>P</kbd> pins it in place, so you watch yourself move through the planet, and your slice shows up as a curved sheet, a great 2-sphere through you and your antipode.
- **Inspect and face anything.** With the mouse free, hovering any point in the ball says what is there and how far out of your slice it lies; clicking turns you smoothly until it is straight ahead.
- **A compass with no poles.** The 3-sphere is parallelizable: multiplying your position (as a unit quaternion) by i, j and k gives three perpendicular directions along the ground everywhere. Walking straight keeps your compass heading fixed while the other two needles roll around it, once per lap of the planet. <kbd>M</kbd> switches the radar between heading-up and compass-up.
- **Boulders that swell and vanish.** Boulders are 4D balls, intersected analytically. A slice cuts one in a 3D ball of radius √(r² − a²), where a is how far its centre lies toward ana, so turning makes them grow out of nothing and disappear. They cast 4D shadows. Contact is full 4D with Coulomb friction: a push within about 42° of head-on stops you, a glancing one slides you round (through ana if that is where the surface leans), and holding Space climbs the 4D surface.
- **Shadows from places you can't see.** Lighting uses the full 4D sun direction, so hills that lie beside you in ana, outside the slice, still cast shadows into it.
- **No poles, days that never repeat.** The planet spins in two planes at once, at rates in the golden ratio, so every place gets day and night and no two days are alike.
- **Stars are points on a 3-sphere of directions.** In the slice view you only see the ones close to your slice, so they fade in and out as you turn through ana.

## Controls
| | |
|---|---|
| <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> <kbd>Q</kbd> <kbd>E</kbd> | walk · step kata / ana |
| <kbd>Space</kbd> <kbd>Shift</kbd> | jump, swim up or climb a boulder · run |
| mouse | turn, look up and down |
| right-drag or <kbd>Alt</kbd>+mouse · <kbd>Z</kbd> <kbd>C</kbd> | turn toward ana / kata, twist |
| <kbd>Tab</kbd> · wheel or <kbd>−</kbd> <kbd>=</kbd> | radar big / small · zoom, out to the whole planet |
| <kbd>M</kbd> <kbd>P</kbd> <kbd>L</kbd> <kbd>K</kbd> · arrows | radar: heading/compass-up · pin · layers · hide · spin |
| <kbd>Esc</kbd>, then mouse | drag the radar to spin · hover to inspect · click to face |
| <kbd>H</kbd> | help |

## How it works
- **Terrain:** 4D value noise sampled on a *cubed 3-sphere*: 8 cubic charts, one per tesseract cell. It's generated at load time in 8 web workers and stored in a 3D texture.
- **Shared height lookups:** the shader and the physics use the same cubic B-spline lookup. Neighbouring charts are blended across seams, so what you see is exactly what you walk on.
- **One fetch per step:** the atlas is pre-smoothed with the cubic B-spline kernel, so a single hardware-trilinear fetch per ray-march step tracks the smooth surface. The median difference is about 1 cm.
- **Detail without geometry:** bump-mapped normals and albedo variation come from a tileable 3D gradient-noise texture, sampled through two different projections of the 4D point. That way no 4D direction leaves the pattern constant.
- **Resolution:** dynamic resolution holds about 60 fps, and a contrast-adaptive sharpening pass upscales the image to full screen resolution.
- **Radar:** the heights inside the ball are baked into a half-float 3D texture (80³, or 128³ for the far ranges) whenever the ball moves, turns or changes size, then the ball is ray-marched through that texture, one fetch per step. Summits are found on the CPU (local maxima on a coarse grid, then hill-climbed), and picking in the radar marches the same heights on the CPU.
- **Boulders:** 4D balls, intersected analytically per pixel (the nearest 32, faded out before they leave the list), with soft 4D shadows from their closest approach to the sun ray.

No build step: plain ES modules. To run locally, serve the folder with any static server.

## Roadmap
1. ✅ Walk the planet: terrain, water, sun, day and night, gravity, slice view, radar, boulders.
2. Things: rocks to throw and spin with true 4D rigid-body rotation, trees branching in three horizontal directions, buildings with 3D walls.
3. Sky: the w-direction becomes a circle (the "hoop"), giving stable orbits, a sun that appears as a band across the sky, and your own planet seen again along w.
4. Ropes that can't hold knots, flowing water, sound with its 4D wake, creatures.

## Licence
MIT. See [LICENSE](LICENSE).
