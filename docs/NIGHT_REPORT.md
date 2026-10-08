# Night report

The overnight build of 7–8 October (milestones M0 to M7), and the day of refinements that followed on 8 October.

**Play:** https://bengreff.github.io/glome/ · **Hub:** https://bengreff.github.io/ · **Source:** https://github.com/bengreff/glome

Tagged v0.0 to v0.7. v1.0 is not tagged: the performance gate (60 fps at 60% resolution or more) is not met; see Performance.

## What to try first

1. Walk to the cairn ahead of you and press F on the big block. It comes up slowly (163 kg), swings when you turn, and the arc round the dot shows the strain. Turn through ana (right-drag) while holding it, set it down, turn back: it is its own mirror image.
2. Throw a ball (hold the mouse) near a roller (the duocylinders that circle you). It chases the ball and knocks it on. Listen to the ball land: it rings with a 3-sphere's overtones.
3. Look up, then turn through ana: the clouds change shape, because your slice cuts their 4D layer somewhere else.
4. Step through ana with Q and E and watch the boulders swell and vanish.
5. Find the cave 40 m toward the massif. Its only way in leaves the hill toward ana.
6. Climb to the summit (46 m, the highest). The launcher is there; the bowl beside it is a basin carved by a 4D ball.

## What shipped overnight (M0–M7)

- **M0, the base.** Glome renamed, main.js split into modules, every constant in js/laws.js, four Bach recordings (CC0) for the key moments.
- **M1, the physics core.** Gravity is exact: 1/r³, every mass with all its images round the hoop, in closed form. The planet's double spin, with its centrifugal and Coriolis forces and the star's tide. A capsule body, wading, saves and export/import.
- **M2, things.** 4D rigid bodies, written for the game: SO(4) rotations as quaternion pairs, bivector spin, contacts with Coulomb friction, buoyancy by displaced 4-volume, sleeping. Balls and tesseracts to carry, stack and throw, impulse stones that recoil you, lanterns with a 1/r³ pool.
- **M3, the crafted planet.** The great massif, an archipelago joined only through ana, rivers, a cave reachable only through ana, an arch, an overhang, three trees, and a rope that cannot hold a knot.
- **M4, space.** The hoop sky (a row of suns and your planet's copies), the launcher with four tiers, flight in the inertial frame, the space map that predicts your path, and planet B, a 120-cell you can walk on.
- **M5, life.** Walkers (eight legs as two alternating tetrapods) and rollers (duocylinders rolling by double rotation), and an ecosystem that persists.
- **M6, purpose.** Four wordless puzzles on A guarding the launcher's parts (the closed room, the mirror key, the knot gate, the antipode). On B, the orbit that unlocks the console, and the console itself: its screen holds the universe with itself in it, its dials change the laws, and it shows the game's source. The raft and the sail.
- **M7, polish.** Exposure and genuinely dark nights, the hub site, the README, the itch.io page and zip, two code reviews and their fixes.

## Day two: what you asked for

You asked for held objects to turn with you and move smoothly, entirely by physics, for bugs to be fixed, for polish and for more features.

- **Holding is physical.** What you hold stays an ordinary body, pulled to your hands by a drive of limited strength (2600 N, 400 N·m). It collides, sags when heavy and swings when you turn, and its reaction moves you, so momentum is conserved. It keeps its attitude to your body: it turns as you turn and as you twist through ana, and it stays level when you only look up or down, so things go down square.
- **Smooth motion at any refresh rate.** Frames are drawn between physics steps (the world steps at 120 Hz). What you hold is drawn where it sits in your view against your latest turn.
- **Things on planet B.** B has its own world of bodies with B's gravity and floors. What you carry there crosses with you and stays.
- **Wayfinding on B.** Marks show the console and the return pad, with their distances and which way they lie through ana. Without them the console, on one of 120 floors across a 3D surface some 360 m wide, was nearly impossible to find.
- **Climbing.** Hold Space and walk into a big block, the raft or the built blocks, and you climb them, as with boulders. That is how you board the raft from the water.
- **Sound.** Impacts by material (a struck ball rings at √(l(l+2)), the 3-sphere's modes), splashes, walkers' footfalls, rollers' calls.
- **Life.** Rollers play with rolling balls; walkers startle at things flying past.
- **Sky.** Clouds in a 4D layer 90 m up that change shape as you turn through ana, seen from above when you fly, and casting drifting shadows.
- **Looks.** Fine ground texture without stair-steps or streaks; Perlin detail noise (no blocky grass from above); leafier trees; the lantern glows its own amber; a cave is dim but never black; a real bowl on the summit.
- **Controls and settings.** Gamepads (standard mapping), field of view, invert mouse, and U to clear the view for pictures. The gaze dot opens out over anything you can take.

## Bugs found and fixed today

The ones a player would have met:

- **Every jump was a double jump** (10 m/s and 6.5 m high instead of 5.2 m/s and 1.4 m): a held key jumped again inside the 5 cm footing grace.
- **The ground near you broke into stair-steps on bright snow and smeared on grass.** GPU texture filtering places a sample between height texels only to 1/256 of a texel. Hits near you are now placed on precisely filtered heights.
- **Objects dropped on planet B fell through it.**
- **On B the sun, day and night were computed from planet A's centre**, 3 km away; on A, 7° off.
- **The raft tipped you into the sea.** A light raft floated at 28° because the buoyancy sampling was too coarse for its shallow draft, it never stopped bobbing because water's damping scaled with depth under water, and standing on its slightly tilted deck slid you off. All three were fixed: smooth buoyancy, damping by displaced mass, and footing that holds you as friction would.
- **The antipode's ball rolled out of the bowl.** It was a flat slab open in the third ground direction, and a ball on stone felt no rolling resistance.
- **Smaller ones** (several found by three code reviews):
  - the console's flying switch was taken over by orbital flight above 20 m;
  - the radar took clicks from stale data while showing the space map;
  - lifting the raft you stood on yanked you along;
  - fading home dropped what you held;
  - a far pickup dropped the object before it arrived;
  - a save made in mid-flight came back as an ordinary jump;
  - the resolution controller hunted, or pinned itself, on vsync'd displays;
  - finished sounds were never disconnected, so a long walk grew the audio graph without bound;
  - a gamepad unplugged mid-press left a throw winding up for ever.

All four puzzles were solved again by script with the real controls, after these changes: the mirror key, the knot gate, the antipode and the orbit. A save made while holding something reloads with it still in your hand.

## Cut, and why (unchanged from the night)

- **The double dial:** it needs a way to turn things in two planes at once by hand.
- **The linked rails:** Clifford-parallel rails on this planet would be great circles 1.6 km long.
- **A third species:** the design's first cut.
- **B's other artifacts:** the design's cut line kept only the orbit and the console.
- **Tacking with the sail:** the sail is square-rigged.

## Performance

M2 Pro, 3024 × 1964 (dpr 2), default view:

| | Resolution at a steady 60 fps |
|---|---|
| Morning | 59% |
| Now, default view | 52% |
| Now, looking down at near ground (the costliest view) | 48% |

The gate was 60 fps at 60% or more, so it is not met. Today's quality fixes cost about 4 ms a frame:

| Cost | ms per frame |
|---|---|
| Precise hit placement | 1.3 |
| Clouds and their shadows | under 1 |
| Tetraplanar detail | 0.5–1 |

Savings went the other way: objects and trees 1.7 → 0.5 ms; shadows trimmed. Shadows remain the largest single cost (about 3 ms). Measurements late in the day were noisy because other workloads were using the machine.

## Known issues

- **Performance gate:** see above. The game holds 60 fps by lowering resolution, and the sharpening upscale keeps it crisp, but at about 52% rather than 60%.
- **Audio** has been checked in code and in the browser (events fire, nothing throws), but not listened to.
- **Walkers' legs** are thin 4D capsules, so a slice rarely cuts them.
- **True night is rare** (about 4% of the time): the row of suns spans the sky, so most nights are long twilights. This follows from the hoop sky and was not tuned away.
- **Spin tilts "level" by up to 3° on the summit**, so balls on smooth stone creep. The ground's rolling resistance stops them on grass. This is physics, kept.

## Decisions

Every non-trivial choice, with its reasoning, is in [DECISIONS.md](DECISIONS.md): "Night decisions" for M0–M7 and "Day two decisions" for today. The physics claims and the approximations are in [PHYSICS.md](PHYSICS.md).

## For you

1. **itch.io:** upload `dist/glome-v0.7.zip` (built; it is gitignored, so rebuild it with `tools/package.sh` on another machine) as an HTML game, using the settings and text in [ITCH.md](ITCH.md).
2. **The hub:** approve or edit the copy on https://bengreff.github.io/ (repo `bengreff/bengreff.github.io`).
3. **v1.0:** tag it when you are happy with performance. Lowering the shadows' cost is the most direct way to the 60% gate, or the gate could become 60 fps at 50%.
