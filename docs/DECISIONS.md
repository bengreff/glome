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
- **M3: the crafted planet.** The massif sits on the most continental land (found by search, then fixed in world.js); its summit is 46.3 m, the next highest 33.6 m. The archipelago fills the deepest sea about 400 m away: seven islands (6–15 m high), three of them joined by low bridges that bend sideways through a third ground direction, so the slice that holds both islands never shows the bridge. You start on the massif's lower flank, facing it, with a boulder just ahead and a little toward ana.
- **M3: rivers are traced, not painted.** Three springs on the massif (the three shortest of 24 candidates that reach the sea) follow the steepest way down with momentum; the bed only ever falls, the channel is carved into the heights, and a separate water-level field (the sea, or 0.5 m over a river bed) is shared by the shader and the walker, so you wade in rivers too. The water does not flow (no fluid simulation): logged in PHYSICS.md's approximations.
- **M2: object sizes and densities.** Densities are 4D (kg/m⁴) with Earth-like ratios: stone 2600, metal 7800, wood 450, water 1000. Small glome r 0.18 m (13 kg), large r 0.32 m (137 kg); small tesseract 0.3 m (21 kg), large 0.5 m (163 kg). A full throw is a 260 N·s impulse, capped at 14 m/s, so small things fly and big ones are for building.
- **M2: impulse stones always leave at 80 m/s** (2.5 kg): each is worth 2.76 m/s to you. They are a found object, not a muscle, so their speed does not depend on the wind-up.
- **M2: rolling resistance 0.08 on the ground** (soft soil). Rigid contact alone lets balls roll forever on any slope.
- **M2: the start was moved to the flattest ground near the massif** (75–120 m out), so the starting cairn's balls don't roll away.
- **M2: the rigid-body engine was written in the main session.** The subagent that was writing it stalled after finishing so4.js (which is its work, with 2768 passing checks).
- **M4: the launcher's tier speeds are 24, 35, 43 and 52 m/s, not 30, 42, 50 and 60.** DECISIONS gave each tier a speed and an effect; the speeds were computed from sea level (PHYSICS.md's launcher row), but the launcher stands on the 46 m summit, where gravity is lighter: from there 30 m/s is a 120 m hop and 42 m/s already escapes (the 4D escape speed there is 41.8 m/s, 49.7 with the hoop). Re-derived from the summit with the exact field: a 60 m hop needs 23.7, a 200 m arc 34.7, a circular orbit across the hoop 42.4 inertially (37–46 m/s from the launcher, because the summit's spin moves it at 6.4 m/s), and escape 49.7. Verified by integration (scratch orbit.mjs): flat across the hoop at circular speed the orbit stays within 275–317 m for 14 orbits; tilted 30° into the hoop it fails within 1–3; at 52 m/s a well-aimed launch lands on B after 91–116 s.
- **M4: the launch is aimed by your gaze.** Stand on the pad and jump: it throws you along your line of sight at its tier's speed. Its tier is set by the parts (I–IV) lying in its ring. While you stand on it the radar becomes the space map and shows where that launch would go.
- **M3: trees are capsules and balls, traced exactly** (three trees of 53 branches and 36 foliage balls), from a float texture; they cast no shadows of their own (a cost choice) but are shaded with the ground's shadows.
- **M3: the rope is drawn with the trees' capsules.** In a slice it is a few dots (a curve meets a 3D slice at points), which is true, if surprising. The knot test is a crossing test: it shows the mechanism (a strand slips past another through ana without touching) directly, where a whole tightened knot proved too sensitive to the solver to be a fair test.
- **M3: part I lies in the cave's chamber**, reached only through the tunnel that leaves toward ana: the first lesson (turn to find the way) and the first part.
- **M4: the hoop copies' first sight, the first escape and the landing on B each fire their Bach cue once per world** (saved flags).
- **M4: B has a return pad** (one floor, in the accent colour, 33 m/s along your gaze): without it a landing on B would strand you until the console.
- **Fixed on the way:** the star field used a float hash that GPUs with fast maths turn into moiré; it is now an exact integer hash. An uninitialised variable drew a phantom tree on some GPUs. The scene is dithered before its 8-bit buffer, and sharpening fades out in the dark, so night and space don't band.
- **M5: no third species** (DESIGN's first cut). Walkers and rollers only.
- **M5: the ecosystem is coarse on purpose:** walkers think twice a second, herd with neighbours within 30 m, graze on grass (2–22 m above the sea), are born when well fed if fewer than eight share their 30 m, and live 25 minutes; rollers live on sunlight and live 43 minutes; caps of 90 and 20. Creatures more than 90 m away are simulated but not drawn.
- **Review fixes (from the M2–M4 review):** standing on B is now saved and restored (it was lost on reload); the shader's slab tests can no longer divide 0 by 0; boulder contact is skipped on B.
- **The frame loop can't die:** an error in one frame is logged once and recorded (`__glome.G.lastError`), and the world goes on.
- **M6: the artifacts on A are the closed room (the cave), the mirror key, the knot gate and the antipode,** one per launcher part. The double dial and the linked rails were cut: the dial needs a way to turn things in two planes at once by hand, and Clifford-parallel rails on this planet would be great circles 1.6 km long.
- **M6: B has one artifact, the orbit, and then the console** (DESIGN's cut line: B's other artifacts go first). The console stays dark until you have flown a full turn round planet A, which only holds flat across the hoop: the hardest thing in the game, as DECISIONS asks.
- **M6: the console's "tiny running copy of the universe" is its own view fed back** (the last frame, on its screen), so it holds the universe with the console in it with the universe in it, and so on down: video feedback, the oldest strange loop there is. Its dials are labelled in symbols (G, 1/r³ ↔ 1/r², L, t, ☀, ↑, →, ∞, ✈), not words. Changing the day's length re-bases the spin so the planet doesn't jump.
- **M6: what you hold is solved by its own test**: the mirror key fits when its two marked cells point as the model's do (within about 35°), which takes half a turn through ana; the knot gate opens when no part of the rope is within a metre of the post; the antipode when anything but a part rests in the summit's bowl.
- **M6: the raft is light wood (160 kg/m⁴, like balsa), a 1.3 m tesseract** (made 1.0 m on day two, below). A uniform cube floats square only below about a fifth of water's density; at 450 it floats on an edge (true in 3D too). The keel resists sideways motion 10× more than forward, in both sideways directions; you steer by facing (a tiller). The sail is found on an island; set on the raft it is rigged (rides with it, no contacts of its own) and pushes along the heading by the square of the relative wind along it (square-rigged, no tacking): about 2.3 m/s in a 6 m/s wind. The wind is a slowly turning global field built from the 3-sphere's pole-free frame.
- **Fixed on the way:** standing on an object (a raft, a box) now counts as footing; wading depth is measured at your feet (so a raft over deep water doesn't send you home); a capsule whose axis is inside a box is pushed out through the nearest face.
- **M6: every artifact confirmed solvable by script** (tools/playthrough/README.md has the results). The summit's bowl got a level stone floor (on the bare summit a ball rolls away); a launch now leaves you airborne for half a second (standing on the pad otherwise counted as footing and damped the launch).
- **M7: the eye adapts only in real darkness.** With the star row, the share of light above the horizon is rarely 1, and the old exposure rule brightened every day into haze; now exposure rises only below about a third of the row's light. The haze on the planet's copies was halved. (The hub's picture was retaken after this.)
- **M7: the hub** (https://bengreff.github.io/) is one page: the handle, Glome and SAT Practice with a picture each, and a GitHub link. Dark or light by the reader's system. Its copy awaits the owner's approval.
- **M7: night is darker** (eye adaptation at most 1.45×, starlight fill halved), so lanterns matter. Note: true night (no star image above the horizon) is rare, about 4% of the time at the start over 20 minutes, because the row of images spans ±70° along the hoop: most "nights" are long twilights lit by the row's outer suns. That follows from the hoop sky; it was not tuned away.
- **M7: the console's laws and switches are saved** with the world.
- **Second review's fixes:** B's pillars and console now follow the copy of B nearest you before you land (they could vanish on approach); a part carried when the world was saved stays in your hand on reload; diagonal flight in the console's flying mode is no faster than straight; a degenerate frame in the creatures' drawing is caught by length. Walkers' legs are drawn only within 25 m (they shared one bounding ball, which cost resolution everywhere).
- **M7: the opening hint names the fourth direction** ("Q E step through ana"): without it nothing tells you the one thing a 3D player wouldn't guess. The riverside tree now grows (its site search counted the river's damp banks as water).

## Day two decisions

- **Held things are physical bodies** (the owner's request: held objects should turn with you and move smoothly, entirely by physics). A held object used to be placed rigidly in your frame each step, passing through the ground and other things. Now a drive of limited strength (2600 N, 400 N·m) pulls it to your hands and turns it with your body; it collides, sags if heavy, swings when you turn, and its reaction moves you. It keeps its attitude to your body, not your head: it turns as you turn and twist through ana but stays level when you look up or down, so things go down square. Bigger things are carried lower, at the chest. Details in PHYSICS.md.
- **Frames are drawn between physics steps.** The world steps at 120 Hz and the screen refreshes at its own rate; each frame now draws you, the objects and the rope at the fraction of a step the frame falls on (and the sky at the matching time), so motion is even at any refresh rate. What you hold is drawn where it last sat in your view, against your latest turn.
- **Planet B has its own world of bodies**, in B's frame, with B's gravity and its crystal floors. What you carry there crosses with you, rests on B's floors, can be thrown and stacked there, and is saved. Before, a dropped object fell through B.
- **The sky is seen from your eye.** The star images' directions and shares were measured from A's centre: 7° off on A's surface and wrong on B (B's day and the HUD's sun came from A's). The light's overall scale is still fixed from A's centre, so noon is brighter than dusk (1/r³) and B, farther out, is dimmer.
- **The raft is a hollow crate of planks: a 1.3 m tesseract of mean density 60 kg/m⁴ (171 kg).** At 160 it weighed 457 kg, more than the hold's 2600 N can lift, and it was only barely stable with you aboard (a cube floats steadily only when light: the lighter, the shallower its draft and the higher its metacentre). A 1.0 m raft tipped you off. Its buoyancy is now smooth (each of its 256 sub-cells wet in proportion to its depth; before, a cell was wet or dry, which can't resolve an 8 cm draft and floated it at 28°), water's damping depends on the water displaced against the body's mass (so a light body settles as fast as a heavy one), and the hull's drag is a force (20·u + 40·u|u| N along the heading, ten times that sideways) where it was a rate that let a lighter raft drift faster. Windage is 1·|w|w N. It sails at 2.8 m/s in a 6 m/s wind and drifts at about 0.3 m/s without a sail.
- **Standing on something carries you as friction would:** support from a surface you stand on is straight up (a push along a raft's slightly tilted deck slid you off within seconds), you move with the point under your feet, and walking eases your velocity relative to that surface, not to the ground, so a raft's speeding up and slowing down carries you with it.
- **Ground detail is mapped "tetraplanar":** four layers of 3D noise, each dropping one coordinate, weighted by how nearly that axis is the surface's normal (the 4D version of triplanar mapping). The old two oblique projections each smeared the noise along a fixed 4D direction, which showed as streaks wherever that direction lay along the ground in your slice. The finest layers reach a little farther and carry more contrast, so near ground is less soft.
- **Things make sounds when they strike,** from the physics' new contacts: glomes ring with a 3-sphere's overtones (PHYSICS.md, Sound), metal pings, wood knocks, stone blocks clack.
- **Fixed: every jump was a double jump.** A jump key held for more than one physics step (any real press) jumped again from within the 5 cm footing grace above the ground: 10.3 m/s and 6.5 m high instead of 5.2 m/s and 1.4 m. After a jump there is now no footing for 0.2 s.
- **You can climb big objects** (large blocks, the raft, the built blocks), as boulders: hold Space and walk into a face. No jump fires at the top of a climb (the climbing key is the jump key). This is how you get onto the raft from the water.
- **The resolution controller no longer hunts.** At a vsync'd 60 Hz every frame that makes it looks equally fast, so it stepped up, missed, stepped down, and so on; a resolution that proved too slow is now a ceiling for 30 s, and a step down that reaches 60 fps is always kept. The default view settles at 60 fps at 59% of 3024×1964 on the M2 Pro (GPU-bound; the CPU's share of a frame is under 1 ms).
- **Rollers play; walkers startle.** A ball rolling within 25 m of a roller (or one that rolled in the last 6 s) draws it: it races to the ball and knocks it on, a collision with something much heavier. Walkers move away from anything flying past within 8 m faster than 3 m/s.
- **Review fixes (day two):** you can't pick up what you stand on (the raft would be pulled toward your hands while it carried you); fading home brings what you hold with you.
- **Two settings: field of view** (60–100° top to bottom, default 76°) **and invert mouse**, both kept with your settings.
