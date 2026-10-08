# Glome

**A walkable planet in four spatial dimensions.** [Play it in the browser](https://bengreff.github.io/glome/) (desktop, keyboard and mouse or a gamepad, WebGL 2).

Glome is a small universe with four space dimensions: one star, two planets, and a fourth direction that closes back on itself every 800 m (the hoop). You are a three-dimensional mind in a four-dimensional body, so your eyes show you a 3D slice of the world; a radar shows you the rest. Nothing is explained. The world behaves as a 4D world must, and you find out by playing.

A *glome* is a 4D ball: the planets, the star and the boulders are all glomes.

## What is in it

- **The planet.** A 4D ball whose ground is a 3-sphere: walk straight in any direction and you come back about 1.6 km later. It spins in two planes at once, so there are no poles and no two days are alike. A great massif (its summit the highest by 13 m), seas, an archipelago whose islands are joined only through the fourth direction, rivers from the highlands to the sea, a cave, an arch, an overhang, three landmark trees.
- **The slice and the radar.** Your view is the cross-section through your eyes; turning toward ana or kata (the fourth direction) sweeps it through the world. Boulders swell out of nothing and vanish as you turn. The radar is a glass ball of the 3D ground around you, out to the whole planet.
- **The hoop sky.** The star appears as a row of suns along the hoop, and the light on every surface is the exact sum over the row. Look along the hoop and your own planet hangs in the sky, 800 m away. Clouds drift in a 4D layer 90 m up that your slice cuts in a sheet, so they change shape as you turn through ana, and their shadows cross the land.
- **Things.** 4D balls and tesseracts to carry, stack and throw. What you hold stays a physical body: it turns with you, knocks into what it meets, and heavy things come up slowly and swing as you turn. A thrown tesseract tumbles in two planes at once, its slice changing shape as it turns. Carrying something through ana and back makes it its own mirror image. Impulse stones recoil you (momentum is conserved), lanterns light a sharp 1/r³ pool, a rope cannot hold a knot, a raft floats on the 4-volume it displaces and sails with a sail. A struck ball rings with the overtones of a 3-sphere. Things you carry to planet B stay there.
- **Creatures.** Walkers, on eight legs that form two alternating tetrapods, are shy and walk out of your slice through ana. Rollers, duocylinders rolling by double rotation, are curious: they circle you, and chase and knock on a ball you set rolling. An ecosystem runs behind the scenes.
- **Artifacts.** A trail of wordless puzzles, each opening only to an idea that needs four dimensions, guards the parts of a launcher on the summit.
- **Space.** Launch from the summit, fail to orbit, and find the one orbit the planet's own copies cradle. Escape to planet B, a crystal (a 120-cell) you can walk on, and the console of the simulation: dials for the laws, the game's own source, and a screen that holds the universe, with the console in it, without end.

## The physics is real

Nothing is swapped for a cheaper law; where the game approximates, it integrates the true law numerically and says so. The details and every number are in [docs/PHYSICS.md](docs/PHYSICS.md).

- **Gravity** falls as 1/r³ (Gauss's law in 4D), and every mass is felt with all its images round the hoop, through the closed-form sum (checked against a direct sum to 10⁻¹⁴). In the spinning planet's frame you also feel its centrifugal and Coriolis forces and the star's tide. Summits are lighter: 6 m/s² on the massif against 9.8 at sea level.
- **Orbits** near a planet are marginal in 4D: circular speed equals escape speed. The hoop's images add a faint cradle that holds only orbits lying flat across the hoop (integrated: 14 bounded turns against 1–3 when tilted 30°). Far out, gravity is 3D-like and the planets orbit the star.
- **Rigid bodies** live in SO(4) (quaternion pairs), spin with bivector angular velocities, and meet with Coulomb friction in the 3D tangent space; stacks stand, momentum and angular momentum are conserved to 10⁻¹⁴ (`tools/test-bodies.mjs`).
- **Light** falls as 1/r³; **sound** as r^(−3/2), with the faint tail that waves have in even dimensions (`tools/test-audio.mjs`). A struck glome's overtones stand at √(l(l+2)), the 3-sphere's modes.
- **Floating** is the displaced 4-volume; a uniform cube floats square only when light enough, in 4D as in 3D (`tools/test-bodies.mjs` checks both cases).
- **Knots** can't hold: one strand slips past another through ana without the two ever overlapping (`tools/test-rope.mjs`).

## Controls

| | |
|---|---|
| <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> <kbd>Q</kbd> <kbd>E</kbd> | walk · step kata / ana |
| <kbd>Space</kbd> <kbd>Shift</kbd> | jump (or climb a boulder or big block you walk into) · run |
| mouse | turn, look up and down |
| right-drag or <kbd>Alt</kbd>+mouse · <kbd>Z</kbd> <kbd>C</kbd> | turn toward ana / kata, twist |
| <kbd>F</kbd> · hold <kbd>F</kbd> | pick up or drop · show where it will rest, release to set it down |
| hold the mouse · <kbd>G</kbd> | wind up and throw · take an impulse stone from the pouch |
| <kbd>Tab</kbd> · wheel or <kbd>−</kbd> <kbd>=</kbd> | radar big / small · zoom, out to the whole planet |
| <kbd>M</kbd> <kbd>P</kbd> <kbd>L</kbd> <kbd>K</kbd> · arrows | radar: heading/compass-up · pin · layers · hide · spin |
| <kbd>Esc</kbd>, then mouse | drag the radar to spin · hover to inspect · click to face |
| <kbd>H</kbd> · <kbd>U</kbd> | help, settings, your world (export, import, new) · nothing over the view, for pictures |
| gamepad | left stick walk · right stick look (LT held: toward ana, twist) · LB RB kata, ana · A jump · X take · RT throw · Y stone · B radar · Start help |

## How it works

- **No build step:** plain ES modules and WebGL 2, served as static files. `tools/stamp.sh` version-stamps the modules (through an import map) before a release.
- **Rendering:** every pixel is a 4D ray. The terrain is a height function on the 3-sphere, stored as a cubed-sphere atlas (8 charts built by 8 web workers) and pre-smoothed so one texture fetch per step tracks the surface; objects, boulders, trees and planet B are intersected analytically (ray–tesseract by a 4D slab test, ray–120-cell against its 120 floors). Dynamic resolution holds 60 fps and a sharpening pass upscales.
- **Physics:** a fixed 1/120 s step. The walker is a 4D capsule; flight is a symplectic leapfrog in the star's frame; the space map predicts with the same integrator.
- **Saves** live in the browser and export to a `.hoop` file (JSON, versioned).

To run it locally, serve the folder with any static server (`tools/serve.sh` serves it at http://127.0.0.1:8650/). Tests: `node tools/test-so4.mjs`, `tools/test-bodies.mjs`, `tools/test-rope.mjs`, `tools/test-audio.mjs`, `tools/test-creatures.mjs`; `tools/cdp.mjs` drives the game in headless Chrome.

## Credits and licence

Music: J. S. Bach, played by Kimiko Ishizaka (*The Open Goldberg Variations*, *The Open Well-Tempered Clavier*), dedicated to the public domain (CC0); sources in [docs/CREDITS.md](docs/CREDITS.md). Every sound is synthesised in code.

MIT licence. See [LICENSE](LICENSE). The design is in [docs/DESIGN.md](docs/DESIGN.md) and [docs/DECISIONS.md](docs/DECISIONS.md).
