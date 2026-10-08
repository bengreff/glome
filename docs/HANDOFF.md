# Glome: overnight build handoff

You are building **Glome v1.0** overnight, alone, while the owner sleeps. Work until everything below is done and verified. Then write the morning report and stop. Nobody will answer questions tonight: make decisions from the docs, and log them.

## 1. Read first, in this order

1. **Your memory index** (loaded automatically), especially `project_4d_physics_sandbox.md`: the project's history, what was tried and rejected, and the owner's taste. Note the feedback memories too: visual self-check, Mac memory safety, no unverified numbers.
2. **`docs/DECISIONS.md`:** every decision the owner made. **It overrides DESIGN.md where they differ.**
3. **`docs/DESIGN.md`** (the vision, pillars and cut lines) and **`docs/PHYSICS.md`** (the laws, formulas and numbers; never contradict it without re-deriving and updating it).
4. **The code** in `~/glome`:
   - `js/main.js` (about 1100 lines: input, radar, boulders, contacts, profiler, HUD, boot);
   - `js/shaders.js` (the 4D ray marcher, radar, bake, upscale);
   - `js/world.js` (terrain on the cubed 3-sphere, the CPU height field);
   - `js/player.js` (the walker, the 4D frame);
   - `js/noise.js`, `js/terrain-worker.js`.

What exists already: a 3-sphere planet with terrain and sea; double-rotation day and night; 4D soft shadows; analytic 4D boulders with 4D friction and climbing; the radar ball (zoom to the whole planet, pin, layers, inspect and face); the gaze link; automatic resolution with a probe; save of radar settings only; a profiler (`__hoop.prof`); a debug handle `window.__hoop` (`.dbg` exposes internals).

## 2. Ground rules

**Pillars:** exact physics (integrate the true laws, never swap one in), wordless, minimal, self-contained (a static site, no server, no build step), ships.

- **No spiralling.** Build only what DECISIONS.md and DESIGN.md describe. Prefer a thin, complete version of a feature, then deepen it. If you are behind, cut in the order DESIGN.md gives, but **the space arc and feel/polish are the priorities and are never cut**.
- **Decide and log.** Any non-trivial choice the docs don't settle goes in `docs/DECISIONS.md` under "Night decisions", with one line of reason. Never stop to ask.
- **Git:**
  - Commit as `git -c user.name=Ben -c user.email=ben@thegreffs.com commit ...`.
  - End every commit message with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Run `tools/stamp.sh` before any commit that touches `js/` or `index.html` (it version-stamps module URLs so caches never mix files).
  - **Push continuously** to `main` (the live site), but only after the smoke test passes.
  - Tag each finished milestone `v0.N` and push the tag.
  - Never force-push, never rewrite history, never delete branches.
- **Leave other projects alone:** `~/director`, `~/fly-emulation`, `~/crucible`, the inquiry project and anything else outside `~/glome` (and, for the hub, the new `bengreff.github.io` repo).
- **Mac memory safety:**
  - The machine has 16 GB. Before launching headless Chrome, check `memory_pressure | tail -1` and keep at least 3 GB free.
  - Run one headless Chrome at a time, and never leave one running (the harness cleans up, but check `pgrep -f glome-chrome` afterwards).
- **Waiting:** never use a foreground `sleep` longer than a few seconds. Long runs go in the background or in a watchdog loop: `cmd & P=$!; for i in $(seq 1 40); do sleep 3; kill -0 $P || break; done; kill $P`.
- **No accounts, no logins.** itch.io is the owner's job in the morning: prepare the zip and the page text.
- **Licences:** CC0 or public-domain audio only. Record the source URL and licence for every asset in `docs/CREDITS.md`.

## 3. Subagents (at most 2 at once)

- Use `model: sonnet`, and tell them not to spawn subagents of their own.
- **Good uses:**
  - **(a) Research and sourcing:** find and verify CC0 Bach recordings (download small OGG or MP3 files, at most about 3 MB each, into `audio/`, with credits).
  - **(b) Review:** a fresh pair of eyes on a finished milestone. They read the diff, run `tools/cdp.mjs`, and report bugs with file:line. They don't edit.
  - **(c) Self-contained modules** with a fixed interface and tests, each in its own new file, for example `js/so4.js` (SO(4) as quaternion pairs: compose, apply, the exponential of a bivector, with numeric tests) or `js/audio.js` (the WebAudio engine: r^-1.5 falloff, the convolution tail, music cues).
- **Never let two agents edit the same file.** You integrate everything.

## 4. Tools

- **`tools/serve.sh`** serves the repo at http://127.0.0.1:8650/ (run it in the background).
- **`tools/cdp.mjs`** is the headless test driver:
  - `node tools/cdp.mjs <url> <outPrefix> '<steps json>' [--gpu]`
  - Steps: `[{"eval": "<js>", "wait": ms, "snap": "name"}]`. Screenshots are written to `<outPrefix>-<name>.png`; look at them with the Read tool.
  - Without `--gpu`: SwiftShader at 1280×800. Use it for logic and screenshots; it is slow, so expect about 2–20 fps.
  - With `--gpu`: the real M2 Pro over Metal at 1512×982, devicePixelRatio 2. Use it for performance; `__hoop.prof.gpu` gives GPU ms per frame.
  - Evals run with `awaitPromise`. Don't await `requestAnimationFrame` inside them (it can hang); drive the simulation with direct calls instead (see `__hoop.dbg`).
- **`tools/stamp.sh`** version-stamps module URLs.
- **For physics checks,** write small Python or Node scripts in your scratchpad (numpy is available) that integrate the same equations, and compare.

## 5. Gates: run them every milestone

1. **Smoke:** the page loads with no shader or JS errors (the harness prints errors and exceptions).
2. **Visual:** screenshot every new feature and look at it. Check it against what DESIGN.md says it should look like. A correct formula is not the same as a legible picture: say what is off and fix it.
3. **Performance (`--gpu`):** with automatic resolution at the default view, it settles at 60 fps and a resolution of at least 60%. Slice, radar and everything else together stay at or under about 15 ms of GPU time. Profile any new shader cost with `__hoop.prof` and the sync-timing pattern (readPixels after each pass).
4. **Physics:** the numbers match PHYSICS.md (see the per-milestone tests below).
5. **Persistence:** the new state survives a save and reload, and an export and import round-trip.

## 6. Milestones, in order

Each one ends with the gates, a doc update (README features and controls, the help panel, PHYSICS.md if any number changed), a commit, a push and a tag.

**M0. Housekeeping**
- **Rename Hoop to Glome** everywhere: title, loading screen, README, docs, the help text. Add `window.__glome` and keep `__hoop` as an alias.
- **Split `main.js` into modules**, without changing behaviour: `render.js`, `radar.js`, `boulders.js`, `input.js`, `hud.js`, `save.js` and `laws.js`. `laws.js` holds every physical constant in one object, so the console can edit them later.
- Verify with before-and-after screenshots that nothing changed.

**M1. Physics core and saves**
- **Exact hoop gravity** from `laws.js`: the closed form in PHYSICS.md, for planet A and its images. It applies to the walker and to every body.
- **Gravity checks:** surface about 9.8 m/s²; a 40 m peak about 6.3; 8.5% lighter where up points along the hoop.
- **Player as a 4D capsule** (feet to head). Test: walk into boulders and under overhangs; the camera must never be inside rock (sample the distance at the eye).
- **No swimming:** wade to chest depth, then fade back to where you stepped in.
- **Saves:**
  - autosave every few seconds and on unload, versioned JSON in localStorage;
  - export and import a `.hoop` file in the help panel;
  - "new world" in the help panel.
- **Settings:** mouse sensitivity, volume, graphics quality.
- **HUD:** radar and a centre dot only; numbers only while help is open.

**M2. Objects**
- **SO(4) rigid bodies** as quaternion pairs. Glomes and tesseracts, two sizes each.
- **Handling:**
  - hold one object, which turns with you;
  - F picks up and drops; hold F for a ghost, release to set it down gently;
  - hold the mouse to charge a throw.
- **Contacts:** analytic between bodies, signed distance against terrain and boulders. Coulomb friction, sequential impulses, sleeping.
- **Impulse stones:** a pouch, a key to draw one, a throw that gives recoil (momentum conserved).
- **Lanterns:** 1/r³ point light, a small number at once.
- **Buoyancy:** from the displaced 4-volume, needed later for rafts.
- **Tests:** three tesseracts stack and stand for 30 s; a thrown tesseract shows changing slices; the recoil Δv equals m_stone·v_throw / m_you to within 1%.

**M3. Landscape and places**
- **A crafted planet**, deterministic from the seed and generated as fast as now. Heights must stay identical between CPU and GPU.
  - one great massif, highest by a clear margin;
  - an archipelago with islands, some linked only through ana;
  - rivers from the highlands to the sea;
  - distinct but natural regions.
- **Landforms:** caves, arches and overhangs as signed-distance carvings at a few designed sites, at least one enterable only from ana. Contacts and the radar must respect them.
- **About three landmark trees.**
- **Rope:** a chain of particles with distance constraints (position-based dynamics). Test: knots can't hold.
- **4D audio:** r^-1.5 falloff, the tail, ambient wind and water.

**M4. Space (priority)**
- **The star, planet B and the hoop sky.** Rays wrap in w. The copies are visible. The sun is a row of images, and sunlight is their sum (choose blended or a few sharp sources by look and cost; log it).
- **Launcher** on the highest summit, aimed by hand, tiers I–IV. Parts are carry-able objects placed now, guarded by puzzles in M6.
- **Flight:** integrate the exact gravity of the star, both planets and their images (fixed step, symplectic).
- **Space map:** replaces the radar above a height threshold and shows the predicted trajectory.
- **Soft reset:** after hitting the star, or after drifting long enough.
- **Planet B:** crystalline plus built structures, landable.
- **Tests:**
  - apex heights match PHYSICS.md (30 m/s gives about 62 m);
  - at tier III, an orbit across the hoop stays bounded for at least 3 orbits, and one tilted into it fails;
  - tier IV reaches B;
  - the music cue fires at first escape.

**M5. Creatures**
- **Walkers:** eight legs, alternating tetrapods, shy (they drift through ana away from you).
- **Rollers:** duocylinders rolling by double rotation, curious.
- **Hidden ecosystem:** grazing, herding, births and deaths, saved.
- **A radar layer** for creatures.
- **Test:** herds move over a day, and populations persist.

**M6. Puzzles, boats and the console**
- **Artifacts on planet A,** chosen from DESIGN.md's table (closed room, knot gate, mirror key, double dial, linked rails, antipode), with escalating difficulty and hints only in the world.
  - They guard launcher parts I–IV and some impulse stones.
  - Some sit on islands. Some point wordlessly toward others.
  - Each must be solvable without words: play through every one by script and confirm it is possible.
- **Raft, then sail:** real 4D buoyancy, wind and keel.
- **Planet B:** the orbit puzzle plus one or two more, leading to **the console**:
  - dials for gravity (strength and law), L, time, and you;
  - the real source view (fetch the JS files);
  - the world-in-the-console recursion (render a small copy of the universe inside its screen);
  - reset to the true laws.
- **Bach cues** at the moments in DECISIONS.md.

**M7. Release**
- **A polish pass:** feel, the audio mix, performance, help text, credits.
- **README:** the title Glome, features, controls, physics claims linking to PHYSICS.md.
- **itch.io:** `docs/CREDITS.md`; `tools/package.sh` to make an itch.io zip into `dist/` (gitignored); `docs/ITCH.md` with the page text.
- **The hub:** create the `bengreff/bengreff.github.io` repo (public), a minimal and elegant page, handle only, listing Glome and the SAT practice app. Enable Pages from main. Verify it is live.
- **Final gates** on everything, then tag `v1.0`.

## 7. Morning

- **`docs/NIGHT_REPORT.md`:**
  - what shipped, per milestone, with links;
  - what was cut and why;
  - known issues;
  - every night decision, with a pointer to DECISIONS.md;
  - performance numbers;
  - how to try each feature;
  - the owner's to-do list (itch.io upload, approving the hub copy).
- **A one-screen summary** in chat: the live links (https://bengreff.github.io/glome/ and https://bengreff.github.io/), the top things to try, and the to-dos.
- **Update the project memory file** with the new state.
