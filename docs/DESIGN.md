# Glome: design

## In one paragraph

Glome is a small, wordless, self-contained 4D universe that runs in a browser. It contains one star, two planets, and a fourth direction that closes back on itself (the "hoop"). You arrive on a planet whose ground is a 3-sphere and see it as a 3D slice through your eyes. A 3D radar shows the ground around you. Nothing is explained. Everything is demonstrated by the world behaving exactly as a 4D world must: boulders swell and vanish as you turn, knots fall open, orbits refuse to close, and your own planet hangs in the sky one hoop-length away. It is a sandbox first. Running quietly through it is a chain of wordless artifacts, Myst-like, that leads off the planet, to a second world, and to the console of the simulation itself.

## Story, such as it is

- **You are a 3D mind in a 4D body.** That is why you only ever see a slice: it is all your mind can take in. The radar is the instrument that shows you the rest.
- **The artifacts were built by someone who is never named.** They read as lessons made for a mind like yours, as if a native of this world were reaching down to you. The trail ends at the console of the simulation itself. Whether the builder is a native, the simulator, or both is never said.
- **No text tells any of this.** It is in the order of the artifacts, what they teach, and where they lead.

## Pillars

1. **Exact.** Geometry and physics are never faked. Where we approximate, the approximation is a faithful one (numerical integration, not a different law), and it is written down in [PHYSICS.md](PHYSICS.md).
2. **Wordless.** No tutorials, no captions in the world. The help panel (H) is the only text. Understanding comes from doing.
3. **Minimal.** Few things, each deep. One star, two planets, a handful of object types, a few creature species, a few artifacts. Nothing is added for variety's sake.
4. **Self-contained.** A static site with no server, no build step and no accounts. Saves live in the browser and can be exported to a file.
5. **Ships.** Every milestone leaves a playable, deployed game. The cut lines below are decided in advance.

## The first minutes

You load in on a gentle hillside in the morning. The slice view fills the screen and the radar ball sits in a corner. You walk. A boulder ahead shrinks to nothing as you turn, and you find it again on the radar. That is the hook, and it needs no words. Everything else is found.

## The universe (toy scale, see PHYSICS.md for numbers)

- **Space** is R³ × S¹: three ordinary directions and a fourth that loops every L = 800 m.
- **Planet A (home):** a 4D ball of radius 250 m with a 3-sphere surface, seas and mountains. It spins in two planes at once (no poles, no repeating days).
- **The star** is a small, hot 4D ball. From A it appears as a row of suns along the hoop direction, the brightest in the middle.
- **Planet B** is smaller and stranger, and visible from A as a moving light with its own row of copies. It holds the end of the puzzle thread and the console.
- **Copies.** Looking along the hoop you see copies of everything, your own planet included, 800 m up. Light simply goes round.

## The sandbox

**Rules of play.**
- Nothing kills you. The worst that happens is a quiet fade back to your last landing spot.
- You hold one thing at a time; impulse stones go in a pouch.
- What you have found stays faintly marked on the radar. There is no journal: your memory is the record.

**Moving.** Walk, run, jump and swim, step and turn through ana, and climb boulders by holding Space against them. Your body is a 4D capsule from feet to head, so nothing clips through rock. Gravity weakens with height as 1/r³: summits are light-footed.

**Objects** are few and exact:
- **4D balls ("glomes")** and **tesseracts**, in two or three sizes. Pick them up, carry, throw and stack them. They rotate in planes, and a tesseract tumbling through your slice shows cubes, prisms and hexagons.
- **Impulse stones:** a found object that gives one shove (a fixed Δv) in the direction you face, then is spent. They are the currency of flight.
- **Lanterns:** light that falls off as 1/r³, so a lantern lights a small, sharp pool. They matter at night and in caves.
- **Rope:** a 4D chain that can be tied, pulled and swung. It cannot hold a knot.

**Building.** Stacked objects stay put (friction and contacts are real), so you can build towers, bridges and stairs to a ledge. Built things are saved.

**Landforms.** A few designed places where the ground is more than a heightfield: caves, arches and overhangs carved as 4D shapes, some entered only from ana. Plus a few **landmark trees**: each a single striking 4D tree whose slice is a scatter of floating branches until you stand in the right place.

**Creatures** are geometric, built from 4D shapes, and few:
- **Walkers:** a body on eight legs. In 3D ground a creature needs four feet (a tetrahedron) to stand, so a 4D insect walks on two alternating tetrapods, the way ours alternate tripods.
- **Rollers:** duocylinder bodies that roll by turning in two planes at once, a way of moving that has no 3D counterpart.
- An optional third species, if it earns its place.

An ecosystem runs behind the scenes: grazing, herding, fleeing, births and deaths, populations that drift over days. You never see a number, only herds, tracks and empty valleys.

**Light and sound.** The sun's light is the sum of the row of star images. Sounds fall off and carry the faint tail that even-dimensional space gives every wave, so a clap rings slightly.

## Seeing

- **Slice view:** what your eyes give you. It is the screen.
- **Radar:** the 3D ball of the 3D ground around you. Layers (L) cover terrain, objects, creatures and artifacts. It zooms out to the whole planet (rim = antipode), and P pins it. A click faces anything in it.
- **Space map:** once you are well clear of the ground, the radar becomes a 3D map of the system. At that scale the universe really is three-dimensional (the hoop is small), so the map is faithful. Your trajectory is drawn ahead.
- **Compass:** the 3-sphere's pole-free frame, on the radar rim.

## Space

1. **Hop.** The launcher (a found artifact) or a few impulse stones carry you a few hundred metres up. The planet below is a ball, and turning through ana shows other continents on it.
2. **Fail to orbit.** Near a planet, gravity is truly 4D (1/r³). There, circular speed equals escape speed, so an orbit closes only in the one orientation the hoop cradles. Everywhere else you spiral down or fly off. You learn it by trying.
3. **Loop the star.** Far out (beyond L), gravity is 3D-like and orbits are stable. With enough speed you can coast round the star, see the copies, and reach planet B.

The launcher is one machine on planet A, aimed by hand, whose power grows in **tiers**. Each tier is a part found inside a puzzle and carried back:

| Tier | Speed | What it gives |
|---|---|---|
| I | 30 m/s | A 60 m hop. |
| II | 42 m/s | A 200 m arc: the planet is a ball below you. |
| III | 50 m/s | Orbital speed. Launch sideways and the orbit fails, unless it lies flat across the hoop, where the planet's own copies cradle it (PHYSICS.md). Because the planet double-rotates, that direction drifts through the day, so the one orbit that works is found by timing. |
| IV | 60 m/s | Escape: the star, the copies, planet B. |

Flight is ballistic, with impulse stones for corrections. There's no fuel bar and no HUD numbers beyond the map. Landings are gentle by fiat (there is no atmosphere). If you hit the star, or drift too long, you fade back to your last landing spot with nothing lost.

## The puzzle thread (wordless)

Artifacts are stone and metal objects in the same geometric language as everything else. Each one opens only to a genuinely 4D idea. Solving one reveals what it holds: a launcher part (to carry back by hand), impulse stones, or a direction. Some artifacts point, wordlessly, along a straight walk to a landmark or to the next artifact. Candidates, from which we pick about five for A and three for B:

| Artifact | The idea it demonstrates |
|---|---|
| The closed room | Walls must be 3D to enclose anything in 4D. This room is sealed in every slice but one, and you enter from ana. |
| The knot gate | A gate held by a knot. Lift a loop through ana and it falls open. |
| The mirror key | A handed key that doesn't fit until a rotation through ana makes it its mirror image. |
| The double dial | A mechanism that turns only under a double rotation (two planes at once). |
| The linked rails | Two straight rails that never meet but cannot be separated (Clifford parallels). A rolling ball shows it. |
| The antipode | Something that can only be seen, or only works, at the exact opposite point of the planet. |
| The orbit | On B: put a stone into a stable orbit, possible only far out. |

The thread is open-ended: puzzles can be done in any order and none is required. The "story" is just the evidence that someone built these while learning 4D themselves.

## The console (endgame, planet B)

At the end of B's artifacts is the console of the simulation itself. It shows the world's code, and live controls for its laws:
- the strength and the law of gravity (including the exponent: switch to 3D gravity and orbits close),
- the hoop length L,
- the rate of time, friction, and your jump,
- infinite impulse.

It is open-ended play after "beating" it. It can always be reset to the true laws.

## Saves

- **Autosave** to browser storage every few seconds and on exit.
- **Export/import** a `.hoop` file (JSON) from the help panel, to move between browsers or keep backups.
- **Contents:** player state, time, held items, every object that has moved or been built (position, orientation), puzzle and discovery flags, creature populations, console settings, view settings. Versioned (`"version": n`), with migrations for old saves.
- **New world:** a reset in the help panel. The planet is generated from a fixed seed, so it is the same world for everyone.

## Interface

- **Controls** stay as they are: WASD Q/E, mouse, right-drag or Z/C, Space and Shift, Tab and the wheel for the radar. Added: F to pick up or use, a click to throw (while holding something), and G to spend an impulse stone.
- **HUD** is minimal and hideable. The help panel holds controls, the save file and the credits.

## Art and sound

- **Look:** natural, as now: textured ground, soft light, believable skies. The strangeness comes from the geometry alone. Artifacts and creatures are matte stone and brushed metal, with one accent colour for things that respond.
- **Night:** genuinely dark. Lanterns and the star row matter.
- **Sound:** mostly ambient (wind, water, footsteps), all propagated with 4D falloff.
- **Music:** at a few moments, a great baroque piece: the first sight of the copies, the first escape, landing on B, the console. Use public-domain (CC0) recordings only, checking each licence before use. Kimiko Ishizaka's *Open Goldberg Variations* is one candidate; Bach's canons by inversion are mirror images, which suits a world where a mirror image is just a rotation away.

## Scope and milestones

Each milestone ships to the live site.

| | Milestone | Done when |
|---|---|---|
| M1 | **Physics core:** exact hoop gravity on the player (1/r³ near, images), capsule body, saves (autosave, export, import) | Head never clips; summit gravity measurably lighter; a save survives reload and file round-trip |
| M2 | **Objects:** glomes and tesseracts with 4D rigid-body dynamics, carry, throw, stack; impulse stones; lanterns | A three-tesseract tower stands; a thrown tesseract tumbles believably; objects persist in saves |
| M3 | **Places:** designed landforms (caves, arches, overhangs) as 4D carvings, landmark trees, rope, 4D sound | Walk into a cave that is sealed in your slice from outside; rope can't hold a knot |
| M4 | **Creatures:** walkers and rollers, hidden ecosystem, radar layer | Herds visibly move over a day; populations persist in saves |
| M5 | **Space:** launcher, flight, space map, star row, planet copies, planet B | Hop, fail to orbit, coast round the star, land on B |
| M6 | **Puzzle thread and console**, then polish, credits, itch.io page | Every artifact solvable without words; console changes the laws live; v1.0 tagged |

**Cut lines**, decided now. If time runs short:
- The third creature species goes first, then trees beyond two.
- Then B's third artifact.
- Then the console's code view (keep the controls).
- The core (M1, M2, M5) is never cut.

## Non-goals

- Multiplayer, accounts or servers.
- Combat, health or survival meters.
- Procedural quests.
- Text-heavy lore.
- Mobile touch controls (desktop first).
- Photoreal rendering at the expense of frame rate.

## Open questions

- The exact artifact list (pick from the table during M6 playtests).
- Whether the star row lights the planet as one blended source or several sharp ones (decide on looks and cost in M5).
