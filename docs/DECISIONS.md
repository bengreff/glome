# Glome: decisions

Everything the owner decided while defining v1.0, from 2026-10-07. Where this file and [DESIGN.md](DESIGN.md) differ, **this file wins**. Decisions made later without the owner go under "Night decisions" at the bottom, each with a one-line reason.

## Identity

- **Title: Glome** (a glome is a 4D ball: the planets, the star, the boulders). The repo is `bengreff/glome`, live at https://bengreff.github.io/glome/. The local folder is `~/glome`.
- The looping fourth direction is still called **the hoop**.
- **Licence:** MIT (LICENSE).
- **Audience:** anyone curious. A mind-bending game, not a lesson: complexity is fine through demonstration. Minimalist, elegant, high-accuracy physics.
- **Opening:** straight in. The loading bar is the only screen before the world.

## Story

- You are a **3D mind in a 4D body**. That is why you see a slice; the radar shows the rest.
- The artifacts' builder is **never named**. They read as lessons made for a 3D mind (perhaps a native of this world reaching down), and the trail ends at the console of the simulation (perhaps the simulator). None of this is ever stated.
- It is a puzzle, not a contrived story. The puzzle can be a kind of story. It is open-ended: there is no required order or ending.

## Taste

- **Look:** natural, as now (textured terrain, soft light, believable skies). Artifacts and creatures are geometric, in matte stone and brushed metal, with one accent colour for things that respond.
- **Sound:** mostly ambient (wind, water, footsteps), with 4D falloff and the 4D wave tail.
- **Music:** Bach only, CC0 recordings only, at a few key moments: the first sight of the copies, the first escape, landing on B, the console. Candidates are Kimiko Ishizaka's *Open Goldberg Variations* and *Open Well-Tempered Clavier*. Verify the licence of every file, and record the source and licence in docs/CREDITS.md.
- **HUD:** radar only, plus a tiny centre dot. Numbers (position, sun, fps, gpu) appear only while the help panel is open.
- **Settings** (in the help panel): mouse sensitivity, volume (sound, music), graphics quality (a resolution cap).
- **Day length:** about 5 minutes, as now. Night is genuinely dark.

## Play

- **Pure sandbox backbone.** Plenty to discover; not a museum.
- **Nothing kills you.** Hitting the star, or drifting too long in space, gives a quiet fade back to your last landing spot, with nothing lost.
- **You cannot swim.** You can wade to about chest depth; any deeper and you fade back to where you stepped in. Islands are reached by finding paths through ana and kata (land that connects only in other slices) and, later, by boat.
- **Carrying:** one object in hand.
  - **It turns with you.** A held object stays fixed in your frame, so to mirror an object: hold it, twist through ana, set it down, turn back.
  - **Throwing:** hold the mouse button to charge, release to throw.
  - **Building:** hold F to show a ghost where the object will come to rest, release to set it down gently. After that it is ordinary physics.
- **Impulse stones:**
  - Only impulse stones go into a **pouch**, which holds several. A key draws one into your hand.
  - **Throwing it gives the recoil** (momentum conserved, exactly). There is no crumbling and no magic shove.
- **Records:** discovered places and artifacts stay faintly marked on the radar. There is no journal. Some puzzles point the way, wordlessly, to other places and landmarks.
- **Hints:** environmental only. The artifacts show their idea. No hint button, no text.
- **Difficulty:** escalating. The first puzzle is solvable by playing around. The orbit timing and planet B's puzzles are hardest.

## World

- **Landscape:** more distinctive and crafted, but still natural.
  - **One great massif** whose summit is the highest on the planet by a clear margin, though not absurdly so. There are still several other mountains and varied terrain around it.
  - **An archipelago:** a sea with islands, some connected only through ana. Puzzles sit on islands.
  - **Rivers** run from the highlands to the sea.
- **Landforms:** caves, arches and overhangs at a few designed sites, some entered only from ana.
- **Trees:** a few landmark trees (about three), each a place to find. No clutter.
- **Boats:** real 4D. First a raft you find, then a wind-driven sail.
  - Buoyancy is the displaced 4-volume.
  - The sail force comes from the relative wind on the sail's 3D surface.
  - A keel resists sideways motion in both sideways directions (right and ana).
  - The wind is a slowly changing 4D field.
- **Creatures:** geometric bodies built from 4D shapes, with real 4D body plans and gaits, and an ecosystem running behind the scenes.
  - **Walkers** have eight legs (two alternating tetrapods). They are shy: they drift away through ana when you come close.
  - **Rollers** are duocylinders that roll by double rotation. They are curious: they circle you.

## Space

- **One star and two planets.** Planet B is **crystalline** (faceted 4D crystals, polytope rock) and **clearly built** (geometric structures). It holds the harder puzzles and the console.
- **The launcher is on the highest summit**, where gravity is lightest. It is aimed by hand, and its power comes in tiers. Each tier is a **part found inside a puzzle and carried back by hand**:

  | Tier | Speed | What it gives |
  |---|---|---|
  | I | 30 m/s | a 60 m hop |
  | II | 42 m/s | an arc high enough to see the planet as a ball |
  | III | 50 m/s | orbit attempts: they fail, except the one orientation flat across the hoop, which the planet's copies cradle; finding it means timing a launch as the double rotation brings it round |
  | IV | 60 m/s | escape: the star, the copies, planet B |

- **Space map:** above a certain height, the radar becomes a 3D map of the system (faithful, since at large scale the universe is 3D), with your trajectory ahead.
- **The hoop sky:** copies of the planets along the hoop, and the star as a row of suns. Sunlight is the sum of the row.

## The console (planet B)

- **In-world dials** for the laws, plus a **view of the game's real source code**.
- **What it changes:**
  - gravity: strength, and the law itself (4D 1/r³ versus 3D 1/r², so close orbits start to work);
  - the hoop length L, live;
  - time: rate, day length, pause;
  - you: jump, speed, infinite impulse stones, flight.
- **The strange loop:** the console holds a **tiny running copy of the whole universe**, with a tiny you at a tiny console, and so on down.
- It can always reset to the true laws.

## Shipping

- **Push continuously:** every working commit goes live (after smoke tests). Tag each milestone so any can be rolled back.
- **Subagents:** at most 2 at once.
- **If time runs short,** the priorities are **the space arc** and **feel and polish**. Everything else follows the cut lines in DESIGN.md.
- **Stop** when everything is done and verified. Then write **docs/NIGHT_REPORT.md** and a short one-screen summary.
- **Release:** GitHub Pages, plus itch.io. The owner uploads to itch.io (it needs their account); prepare the zip and the page text.
- **Hub site** at `bengreff.github.io`:
  - a simple, elegant home page;
  - **handle only** (bengreff), no real name;
  - it lists **Glome** and the **SAT practice app** (https://bengreff.github.io/sat-practice/);
  - **not** the fly bench or inquiry yet: their interactive simulators will be added later, when finished.

## Night decisions

(Added during the overnight build: what, and why in one line.)
- **M0: a small `js/game.js` beside the seven named modules.** It holds the shared runtime state (`G`: state, player, clock) so the modules never import each other in a cycle.
- **M0: cache-busting moved into an import map.** `tools/stamp.sh` now writes an import map in index.html (`js/x.js` → `js/x.js?v=…`), so module files keep plain imports and only the worker's import chain is stamped in place (workers don't see import maps).
- **Music: four Ishizaka recordings, all CC0** (docs/CREDITS.md): copies = Goldberg Var. 12 (canon by inversion), escape = WTC I Prelude in C, landing on B = WTC I Fugue in E, console = the Goldberg Aria da capo (the piece's own strange loop). The WTC files come from Wikimedia Commons, where each file is marked CC0; two archive.org copies carry only the Public Domain Mark, which isn't a CC0 waiver, so they were not used.
- **M1: the sun now comes from the star's real position.** A's orbit (8 min year) and double spin (300 s and 300/φ s) together set the sun's path in the sky; the old spin-only sun was the special case without the orbit.
- **M1: spin forces and tides are in.** PHYSICS.md listed tides as ignored; integrating the exact frame acceleration includes them (and the spin's centrifugal and Coriolis terms) for free, so they are no longer an approximation.
- **M1: a little steering in the air, only within 2.5 m of the ground.** Pure ballistics made short hops feel stiff; higher up flight stays purely ballistic, as DESIGN.md requires for launches.
- **M1: the distance label beside the centre dot shows only while help is open.** DECISIONS says the HUD is the radar plus a dot, and numbers only with help; the radar keeps its own labels (it is the instrument).
- **M1: the planets' orbits are computed from the true laws and frozen.** The console's dials then change how you and your objects fall, not where the planets are.
- **M4 (early): sunlight is the exact sum over the row, shadows are blended.** Every shaded point sums the 11 brightest star images exactly (each 1/d³, each behind its own horizon; they carry 91% of the light, and the far ones' share is folded into them). One soft shadow ray follows the brightness-weighted mean direction of the images that are up. Sharp per-image shadows would cost a shadow ray each.
- **M4 (early): the sky fades to black with height** (over a few hundred metres), and the fixed stars are fixed in space, so they wheel across the night as the planet spins.
- **Perf: the resolution cap at dpr 2 is now 70% (was 75%).** The hoop sky and objects cost ~2 ms more per frame; at 70% the frame holds 60 fps with ~15 ms of GPU.
