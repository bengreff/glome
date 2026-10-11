# Glome: handoff for the next run (to v1.0)

You are continuing **Glome**, alone and unattended, until everything below is done and verified. Then write the report and stop. Nobody will answer questions during the run: make decisions from the docs and from the owner's answers below, and log them.

(The previous handoff, for the overnight build of 7–8 October, is in git history at f903971.)

## 1. Read first, in this order

1. **Your memory index** (loaded automatically), especially `project_4d_physics_sandbox.md`, and the feedback memories (visual self-check, Mac memory safety, no unverified numbers, no AI-isms in prose).
2. **`docs/NIGHT_REPORT.md`:** what exists, what was fixed, performance, known issues.
3. **`docs/DECISIONS.md`:** every decision so far ("Night decisions" and "Day two decisions" at the end). It overrides DESIGN.md where they differ.
4. **`docs/PHYSICS.md`** (laws, numbers, approximations; never contradict it without re-deriving and updating it) and **`docs/DESIGN.md`** (vision and pillars).
5. **The code** in `~/glome/js` (about 30 modules). The ones this run touches most:
   - `laws.js`: every constant;
   - `radar.js`: the glass-ball radar, its layers and trail;
   - `trees.js`, `shaders.js` (`hitTrees`, `shadeTree`): trees as capsules in a float texture, at most `MAXT = 6` cut by the slice;
   - `boulders.js`: about 1700 spherical boulders, the nearest 32 to the GPU;
   - `creatures.js`: walkers, rollers and the ecosystem;
   - `objects.js` and `bodies.js`: things, holding, 4D rigid bodies;
   - `launcher.js`, `artifacts.js`, `landforms.js`, `main.js` (boot and the frame loop).

## 2. What the owner said

After playing the current build (v0.7, live at https://bengreff.github.io/glome/):

> "Looks pretty good. Open items: gravity seems too weak, the nav compass is a bit cluttered and I cannot see any objects of interest on there (should be layers, by default boulders and peaks and mountains are off, and your paths should disappear after a while). Also no animals, trees, or 4d rocks etc."

Asked what "no animals, trees or 4D rocks" meant:

> "There are not any anywhere. Only spherical boulders, one single rock, a single platform atop a mountain that I could not do anything with, and a river. Nothing else."

That is the central problem of this run. The world has three trees in all, about 45 walkers and 10 rollers on the whole planet, a cairn of seven things at the start, and four artifacts. On a ground that is a 3-sphere, seen through a slice, that is effectively empty. Walkers also flee through ana within 14 m, so you never see them. The launcher pad (the "platform") gives no clue that it wants parts.

The owner's answers to the follow-up questions, which are decisions:

| Topic | Decision |
|---|---|
| Gravity | **Stronger planet, Earth on the summit:** planet A's gravity is raised so the summit (46.3 m) measures 9.8 m/s² (about 16 m/s² at sea level). Physics stays exact; everything that depends on it is re-derived and re-tested. |
| Fill the world | **All of:** groves and forests; creatures you meet; 4D rock shapes (not just balls); more things to find. The owner added: **"For performance, render/simulate creatures only when they are visible."** |
| Guidance | **Wordless cues:** the launcher pad shows four empty sockets that glow as parts arrive; parts and artifacts are visible from afar; the radar marks the nearest unsolved artifact. |
| Radar layers | **A legend panel** beside the radar with on/off toggles (click with the mouse free, or keys), remembered with the settings. **On by default: Things and Landmarks.** Off by default: boulders, summit peaks, solid mountains (and creatures, water and coast, shells). |
| Trail | **Fades over 2 minutes.** |
| Performance | **60 fps at 50% resolution or more** at the default view on the M2 Pro (this replaces the old 60% gate). New content is culled to fit: only what your slice can see is drawn. |
| Mode | **Autonomous, same rules** as the overnight run. |
| v1.0 | **Tag v1.0 at the end of this run** if all gates pass, and build the itch.io zip for the owner to upload. |

## 3. Ground rules (unchanged)

**Pillars:** exact physics (integrate the true laws, never swap one in), wordless, minimal, self-contained (a static site, no server, no build step), ships.

- **No spiralling.** Build what this file and DECISIONS.md describe. Prefer a thin, complete version of a feature, then deepen it.
- **Decide and log.** Any non-trivial choice goes in `docs/DECISIONS.md` under a new heading **"Run three decisions"**, with one line of reason. Never stop to ask.
- **Git:**
  - Commit as `git -c user.name=Ben -c user.email=ben@thegreffs.com commit ...`, every message ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Run `tools/stamp.sh` before any commit that touches `js/` or `index.html`.
  - Push to `main` (the live site) only after the smoke test passes.
  - Tag each finished milestone `v0.8`, `v0.9`, …, and the final release `v1.0`; push the tags.
  - Never force-push, never rewrite history, never delete branches.
- **Leave other projects alone:** anything outside `~/glome` and `~/bengreff.github.io`. Other sessions may be running heavy jobs on this Mac (Python pools, node scripts): never touch their processes. They can slow the boot to about 11 s and skew performance numbers; check `sysctl -n vm.loadavg` before trusting a measurement.
- **Mac memory safety:** 16 GB. Before launching headless Chrome check `memory_pressure | tail -1` and keep at least 3 GB free. One headless Chrome at a time; never leave one running (`pgrep -f glome-chrome`).
- **Waiting:** no foreground `sleep` longer than a few seconds; long runs go in the background or a watchdog loop.
- **No accounts, no logins.** itch.io upload is the owner's job.
- **Licences:** CC0 or public-domain assets only, credited in `docs/CREDITS.md`.
- **Subagents:** at most 2 at once, `model: sonnet`, told not to spawn their own. Good uses: read-only code review of a finished milestone (three reviews last time each found real bugs); self-contained new modules with tests in their own files. Never two agents on one file.

## 4. Tools

- **`tools/serve.sh`** serves the repo at http://127.0.0.1:8650/ (start it in the background if it is not running).
- **`tools/cdp.mjs`** drives headless Chrome: `CDP_PORT=9341 node tools/cdp.mjs <url> <outPrefix> '<steps json>' [--gpu]`.
  - Steps are `[{"eval": "<js>", "wait": ms, "snap": "name"}]`; screenshots land at `<outPrefix>-<name>.png`. Look at them.
  - `--gpu` is the real M2 Pro over Metal at 1512×982, dpr 2. Use it for everything visual and for performance.
  - The game's handle is `window.__glome` (`.dbg` exposes internals; `.G.debug` sets the shader's `uDebug` bits, listed at the top of `shaders.js`, for one-run A/B timing).
  - Wrap runs in a watchdog. After "New world" wait at least 20 s before evaluating.
- **Tests:** `node tools/test-so4.mjs`, `test-bodies.mjs`, `test-rope.mjs`, `test-audio.mjs`, `test-creatures.mjs`.
- **Playthroughs:** `tools/playthrough/` (README there): mirror key, knot gate, antipode, orbit. All four solved on day two; they must solve again after your changes.
- **Measuring performance:** fix the resolution (`__glome.dyn.auto = false; __glome.dyn.scale = 0.55`), then toggle features with debug bits in the same run and compare `1000 / __glome.prof.interval`. Separate runs drift with the machine's load. The settle test is auto resolution at the default view after about 25 s.

## 5. Gates: every milestone

1. **Smoke:** loads with no shader or JS errors; `__glome.G.errors` stays 0.
2. **Visual:** screenshot every new feature and look at it critically, against the reference of a natural, believable world. A correct formula is not a legible picture.
3. **Performance (`--gpu`):** auto resolution at the default view settles at **60 fps at 50% or more**. Also check the costliest views: looking down at near ground, inside a forest, and among a herd.
4. **Physics:** numbers match PHYSICS.md; unit tests pass.
5. **Persistence:** save and reload, export and import round-trip (new state included).
6. **Playthroughs:** all four solve.

## 6. Milestones, in order

Each ends with the gates, a docs update (README, the help panel, PHYSICS.md for any number, DECISIONS.md), a commit, a push and a tag.

### N1. Gravity: Earth on the summit

- **The target:** raise `G_SURF` in `laws.js` until the summit's **measured** gravity is 9.8 m/s². Measure it with the game's own exact field, including the hoop images and the spin; it should come out at about 16 m/s² at sea level.
- **Re-derive and re-test everything that depends on it.** Log each new number with its derivation.
  - **Launcher tiers** (now 24/35/43/52 m/s). Escape speeds scale roughly as √g, but re-derive by integration as before: a hop, a 200 m arc, an orbit flat across the hoop that stays bounded (tier III), and a trip that lands on B (tier IV). Update PHYSICS.md's launcher table.
  - **The jump** (5.2 m/s): keep a natural apex, about 1.2–1.4 m where you mostly walk.
  - **Holding strength** (2600 N): a 163 kg block must still come up at sea level, and the 171 kg raft must still be carriable.
  - **Throw caps:** throws still feel right.
  - **The raft:** it still floats square and sails.
  - **The rope:** still behaves.
  - **The space map:** still predicts correctly (it uses the same integrator).
  - **The playthroughs,** especially the orbit.
  - Planet B's gravity is separate (6 m/s² at its surface): leave it unless it now feels wrong by comparison, and log the choice.
- **README and PHYSICS.md** state gravity's numbers (they say 6 m/s² on the massif against 9.8 at sea level today): update them.

### N2. The radar: layers, a legend panel, a fading trail

- **Layers,** each a toggle:

  | Layer | Default |
  |---|---|
  | Things (carryable objects, parts, raft, sail) | **on** |
  | Landmarks (trees, the cave mouth, the launcher, artifacts found, and the nearest unsolved artifact) | **on** |
  | Creatures | off |
  | Water and coast | off |
  | Solid mountains | off |
  | Height shells | off |
  | Summit peaks | off |
  | Boulders and rocks | off |
  | Trail | on, fading |

  The disc (the ground your slice shows) is always there.
- **The legend panel:** a small list beside the radar with on/off toggles. Click a toggle with the mouse free (after Esc), or press keys 1–9; check those keys are free first. Remember the toggles with the settings. It replaces L's cycling of presets.
- **Declutter:** the caption and the long legend text only while the panel is open or help is up. The radar should read at a glance: where things are, where you have been, what is ahead.
- **The trail** fades out over 2 minutes (by age, not count).

### N3. A full world (the main work)

The goal: walking in any direction for a minute turns up several things worth stopping for, and the slice is rarely empty. The ground is a 3-sphere, and your slice shows a 2D sheet of it, so density must be far higher than on a 3D planet. Work out the numbers (how much ground a minute's walk sweeps in the slice and on the radar) and log the targets.

- **Groves and forests:** dozens of trees near the start, hundreds over the planet, grouped in groves and woods on suitable ground (grassland, river banks), with variety in size and form. The current tree path draws at most 6 trees cut by the slice from one capsule texture; it must scale:
  - cull on the CPU to trees the slice cuts within range;
  - give far trees a simpler form;
  - add trunk collisions for the walker and for bodies;
  - add trees to the radar's Landmarks layer.
- **4D rock shapes:** rocks that are not balls:
  - tesseract slabs and blocks, 16-cell and 24-cell crystals, duocylinder stones, scree fields, outcrops;
  - each traced analytically (as objects and planet B's 120-cell already are), shaded and shadowed, solid to the walker and to bodies, climbable where big;
  - their slices change shape as you turn, which is the point;
  - spherical boulders stay, as one kind among several.
- **Creatures you meet:**
  - more walkers and rollers, living near the start and along likely paths;
  - herds that do not all vanish the moment you approach: some walkers curious enough to stay in or near your slice, while others stay shy;
  - the owner's instruction: **render and simulate creatures only when they are visible.** Step and draw near ones in or near the slice every frame; others only coarsely, through the 2 Hz think and the ecosystem.
- **Things to find:** cairns, ruins and caches (balls, blocks, lanterns, impulse stones) along the way, at a density that keeps a walk rewarding; a few that tie into the artifacts.
- **Performance:** everything new is culled on the CPU before it reaches the GPU, by slice and by range. Hold the 50% gate in the costliest views (inside a forest, among rocks, in a herd), not only at the start.

### N4. Wordless guidance

- **The launcher pad** shows four empty sockets round it, each glowing as its part arrives in the ring; a full set lights the pad.
- **Parts and artifacts are visible from afar.** Something that reads as a beacon in a slice view: remember a thin beam is seen only when your slice cuts it. Glowing forms above the site, light on the ground, or the radar's Landmarks layer may serve better. Choose by screenshot.
- **The radar marks the nearest unsolved artifact** (Landmarks), in the wordless style of the existing marks.

### N5. Polish, final gates, v1.0

- **A polish pass:** the new content's look and sound, the help text (the radar panel, the new things), the credits.
- **A read-only review subagent** on the run's diff, then fix what it finds.
- **All gates,** then tag **v1.0**, push it, and build the itch.io zip (`tools/package.sh` → `dist/glome-v1.0.zip`). Update `docs/ITCH.md` if the page text needs it.

## 7. At the end

- **The report:** append a **"Run three"** section to `docs/NIGHT_REPORT.md`:
  - what shipped per milestone;
  - what was cut and why;
  - known issues;
  - the decisions (with a pointer to DECISIONS.md);
  - performance numbers;
  - how to try the new things;
  - the owner's to-dos.
- **A one-screen summary** in chat: the live links (https://bengreff.github.io/glome/, https://bengreff.github.io/), what to try first, the to-dos (the itch.io upload of `dist/glome-v1.0.zip`, approving the hub copy if still pending).
- **Update the project memory file** with the new state.
