# Glome: handoff (written 12 October 2026, after v1.3)

## 0. How the next session starts: an interview

Before writing any code, interview the owner. Many questions need answers (section 4). Ask them in batches of at most four, each with concrete options and a recommendation, and follow up where an answer opens new questions. Then write the plan into section 3 of this file, confirm it with the owner, and only then build. The owner also decides in the interview how the session runs (autonomous to a release, as runs three to six were, or in steps with check-ins).

## 1. Where things stand

- **Live:** v1.3 at https://bengreff.github.io/glome/ (repo `~/glome`, tags v0.0 to v1.3). The itch.io zip is `dist/glome-v1.3.zip`, built by `tools/package.sh`; uploading it is the owner's job.
- **Reports:** `docs/NIGHT_REPORT.md` has a section per run (three to six); every choice and its reason is in `docs/DECISIONS.md`.
- **Since v1.0:**
  - **v1.1, the way:** one goal at a time. A column of light in your slice, a diamond mark, and key-cap cues: E/Q with a distance to step through ana, and F, Z C or Space for what to do. Walkers look like animals, the radar is decluttered with stalks, and fixed stone is dark.
  - **v1.2:** plants grown near you (`flora.js`), 31,000 trees, and the radar's layers renamed for what they hold.
  - **v1.3:** shaders compile in the background (Windows), creatures are found where they live (`creatures.js`: procedural herds on leashes, none follows you), and the cave can be left again.
- **Windows is untested.** v1.3 fixed the two known causes of a freeze while loading: synchronous shader checks at page load, and texture reads with automatic mip levels inside loops, which Direct3D unrolls. The owner should report whether it loads, and the loading text or error if not.

## 2. The owner's playtest of v1.3, in their words

> I solved the cave puzzle and got the first key, but the second puzzle I had no idea on, I managed to find one stone and stack it on top of another immovable stone that was on top of another stone, but past that I don't know. Was that stone a key? Make sure something indicates keys, and also momentum stones should be a renewable resource, you get them maybe from creatures or monuments. A key should indicate when you pick it up that it is a key, and a momentum stone should indicate that you can press a button to stow it in your pouch. The launcher should have clear spots to put each of the keys. The creatures should have some better graphics built at some point. Many questions need to be asked.

**What happened, as far as I can tell:**
- **The owner calls the launcher's parts "keys".** The cave gave part I, their "first key". The second puzzle, the mirror key, has its own key, so there are two kinds of "key" and nothing tells them apart.
- **Yes, that stone was a key: the mirror key.** It's the only carryable tesseract at the second artifact, with one teal cell and one dark cell. The owner set it on the model, the small block on top of the pillar. The model only shows how the key must sit.
- **The intended solution:** hold the key and turn half a turn through ana (Z or C, or right-drag). That makes it its own mirror image. Then set it down in the metal socket sunk in the ground beside the pillar.
- **The cue didn't explain it.** Near the socket the guide shows "Z C ↻ 180°", which said nothing about why or where.

## 3. To do (the owner's list, to be shaped by the interview)

1. **Keys must be recognisable.** Something indicates which objects are keys. Picking one up shows that it is a key.
2. **Momentum (impulse) stones are renewable.** Perhaps you get them from creatures or from monuments.
3. **Stowing a momentum stone is indicated.** When you look at or pick up one, a cue shows the button that stows it in your pouch.
4. **The launcher has clear spots for each key.**
5. **Better creature graphics** (later).
6. **The second puzzle must be something a player can work out.** It is implied by the playtest; the interview should confirm how explicit to be.

## 3a. Run seven plan (from the interview, 12 October)

**How it runs:** the owner is here for a few hours. Work in segments of 20–40 minutes. Each segment ends with a check-in and is pushed live once the smoke test passes. Every push must leave the game playable from start to launch, with no half-built puzzle on the live site. Tag v1.4 when the four puzzles are done and the gates pass.

**Decisions:**
- **Keys:** anything that fits a socket is a key. All keys share one material that nothing else uses. When you pick one up, the socket it fits lights and hums, and the column of light moves to that socket.
- **No tutorials:** at puzzles the guide shows where (column, mark, distance), never what to do. The "Z C ↻ 180°" cue and the knot's "E" cue go; the F under the dot on carryable things stays.
- **Every puzzle is a real built structure** on open, dry ground (check every site: none in water), with its mechanism in plain sight and nothing but geometry for cause and effect. Fixed chain I → IV, as now.
  - **I. The closed room** (replaces the cave): a small stone house you can see into through a grille, with key I on a plinth inside. In your slice it is walled on every side, roof included. Its walls stop short toward ana, which is the only way in and out.
  - **II. The mirror house:** the key is a handed 4D block (a chiral tetracube thickened into 4D). The door has a hole cut in its mirror image. As found, the key jams; turned half a turn through ana, it slides in and the door opens.
  - **III. The knot gate:** a heavy gate leaf on a hinge, hung so its weight swings it open, held shut by a rope looped over a post with a cap. Lift the loop through ana: it falls slack and the gate swings open.
  - **IV. The fold** (replaces the antipode, which is not a 4D idea: a 2-sphere has antipodes too): a 3D cross of eight hinged metal cubes, like Dalí's *Corpus Hypercubus*. Lift each arm on its hinge; the arms toward ana need a turn to see. When all are up they close into a tesseract and the vault opens.
- **Launcher:**
  - **Rings:** keys I–IV are thick 4D rings with holes of four sizes. A stepped pillar stands beside the pad, and each ring drops to its own step, in any order. A ring surrounds the pillar in all three ground directions, so every slice through the pillar shows every ring. The tier is the number of rings seated, counted from the bottom.
  - **Aim:** a launch barrel on a 4D gimbal, aimed by three sliders you grab. It can point in any direction above the horizon, ana and kata included, and stays where it is set.
- **Impulse stones:**
  - **Sources:** ruins and cairns regrow them, one at a time per monument, as a glow that grows over a few minutes.
  - **Stowing:** F takes a stone into your hand. G stows it (cue: G and a pouch glyph), or draws one when your hand is empty.
  - **Pouch:** holds 9, shown as a pouch glyph with dots.
  - **Flight:** facing is free; stones only change velocity.
- **Creatures** (after the puzzles, if time): one smooth skin each, a continuous blended 4D surface, animal and visibly 4D, polished. Render 2–3 concepts as turntables for the owner to choose from before building.
- **Investigate and report with numbers:**
  - **The star:** the owner sees one sun fading in and out, sometimes a row that fades. Is that correct?
  - **Jumping:** is the drift through ana during a jump Coriolis, or an error? Physics realism comes first.
  - **Seeing yourself round the hoop:** where, when and for how long? It is real: with the hoop direction level where you stand, a level ray along it grazes the copy's edge at your own image after one hoop-length. Bring a proposal.
- **Windows:** untested; the owner will report.

**Segments, in order:**
1. Investigations (star, jump drift, hoop sight). Impulse stones (hold, stow and draw; the cap and glyph; regrowing monuments). The "what to do" cues removed.
2. Compound bodies: unions of blocks, including ones with holes, needed by the ring keys, the handed key and the gate. The key material. Ring keys and the stepped pillar; the socket answering on pickup.
3. II, the mirror house.
4. Hinges (4D joints that turn in one plane), then III, the knot gate.
5. IV, the fold.
6. I, the closed room.
7. The launcher's barrel, gimbal and sliders.
8. Creature concepts.
9. **Tides** (owner, after segment 1): model the sea's tide from A's copies round the hoop. The equilibrium range is about 15 m, and it turns with the day; the real sea sloshes, because the forcing turns in minutes. New puzzle sites must sit above high water.
10. **The hoop lighthouse puzzle** (owner, after segment 1): a lit tower whose own light you see blink on the copy's rim when the hoop lies level there, and a beam fired round the hoop into a detector, like a laser puzzle. Maybe with an element of what the owner called "the waves-as-gradients 4D mechanic": in an even number of space dimensions a pulse of light or sound does not arrive sharp but leaves a fading tail behind its front, because Huygens' principle fails. (At light's speed the tail is far too short to see; sound's lasts long enough to hear but needs air, and there is none between the copies.) The copies must draw the tower.

That is about four hours of segments. At a check-in, ask whether to continue autonomously after the owner leaves.

(Section 3 above is the owner's original list; 3a supersedes it where they differ.)

## 4. Interview questions (a draft: add, cut, reorder)

**A. Words and things**
1. The launcher's four parts: should they become "keys" in look and in the help text? Should the mirror puzzle's key then become something else (a piece, a token, a seal) so there is one kind of key?
2. A small icon language on screen, without words: a key glyph while you hold a key, the pouch with its count, the launcher's four spots? Or keep everything in the world itself?

**B. The second puzzle (the mirror key)**
3. How to show what to do? For example:
   - a ghost of the key in the socket, in the shape it must take;
   - a socket shaped so only the mirrored key fits;
   - a demonstration nearby (something turning through ana and coming out mirrored);
   - an animated cue of the key turning.
4. Should the guide spell out every step (no "aha" left), or point the way and leave the idea to the player?

**C. Keys on the launcher**
5. The pad: four marked spots, one per key? Shape-coded to each key, outlined or lit until filled? Must each key go in its own spot, or in any?
6. What should happen as each key is set? Today a socket lights and chimes.

**D. Momentum stones**
7. Where they come from:
   - creatures: which ones, and when (a roller that knocks a ball leaves one; a herd you meet?);
   - monuments: ruins or cairns that grow a new one over time, and how fast;
   - a spring by the launcher;
   - a cap on the pouch?
8. Stowing: keep it automatic on F (as now) with a cue, or a separate key? What should the cue look like (a key cap and a pouch glyph)?
9. What are they for, in your mind: steering in flight, launching, puzzles, something else?

**E. Creatures**
10. "Better graphics": more animal (markings, ears, tails, a moving head), more alien, or more visibly 4D? How soon, against the puzzles?

**F. Windows**
11. Does v1.3 load on Windows? Which browser and GPU? If not, what does the loading screen say?

**G. Everything else**
12. Have you reached the third and fourth puzzles (the knot gate, the antipode) and the flight to planet B? Anything confusing there?
13. Anything else unclear or missing: the radar, the guide, the controls, the help?
14. How should the next session run (autonomous to a release, or in steps), and what version should it end at?

## 5. Facts the next session needs

**Code map:**
- `guide.js`: the goal chain, cues and the column of light.
- `hud.js`: the marks and key caps.
- `artifacts.js`: the puzzles, vaults and sockets.
- `launcher.js`: the pad, its sockets and the tiers.
- `objects.js`: object kinds (`stone`, `part`, `key`, ...) and picking up.
- `finds.js`: ruins, caches and cairns.
- `creatures.js`, `flora.js`, `trees.js`, `props.js` (rocks), `radar.js`.
- `render.js` and `shaders.js`; see `programsReady` for the background compile.

**Impulse stones today:**
- Some lie in caches, and two appear beside each vault when it opens.
- F on one stows it in the pouch at once. The only cue is the general F under the dot.
- G throws one from the pouch (80 m/s, with recoil). The pouch shows as dots under the radar.
- None are ever made again.

**The launcher today:**
- A pad on the summit with four metal sockets flush in its top, at the corners of a tetrahedron in the ground's three directions. Your slice shows some of them at a time.
- A socket lights, with a chime, when a part lies within 3.6 m of the pad's centre. Parts aren't tied to particular sockets.
- The tier is the highest k such that parts I to k are all present.

**The mirror puzzle (`artifacts.js`, II):**
- A vault: a dark 1 m block sunk in the ground, with part II inside.
- A metal socket 3.2 m away, sunk in the ground.
- A pillar 1.4 m from the socket, with the model on top: the key as it must sit.
- The key, 2.4 m from the socket on the other side, lying as the model's mirror image.
- Solved when the key lies within 1 m of the socket with its first two axes within about 37° of the model's.

**Budgets:** the settle gate is 60 fps at 50% resolution or more on the M2 Pro. v1.3 settles at 55–60%, and the main thread's frame work is about 3.8 ms.

**Tests:**
- Unit tests: `node tools/test-*.mjs`.
- Playthroughs in `tools/playthrough/` (README there): room, caveout, mirror, knot, anti, orbit, landB.
- The dev kit in `tools/dev/` (README there): `run.sh` for one headless run, `gates.sh` for all gates (about 25 minutes, in the background), and density and creature counts.
- Serve the repo with `tools/serve.sh` (port 8650).

## 6. Ground rules (unchanged, except that the session starts with the interview)

**Pillars:** exact physics (integrate the true laws, never swap one in), wordless, minimal, self-contained (a static site, no server, no build step), ships.

- **After the interview, decide and log.** Non-trivial choices go in `docs/DECISIONS.md` under "Run seven decisions", each with one line of reason.
- **Git:**
  - Commit as `git -c user.name=Ben -c user.email=ben@thegreffs.com commit ...`, with every message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Run `tools/stamp.sh` before any commit that touches `js/` or `index.html`.
  - Push to `main` (the live site) only after the smoke test passes. Tag each release and push the tags.
  - Never force-push, never rewrite history, never delete branches.
- **Leave other projects alone:** anything outside `~/glome` and `~/bengreff.github.io`. Other sessions may be running heavy jobs on this Mac; never touch their processes, and check `sysctl -n vm.loadavg` before trusting a measurement.
- **Mac memory safety:** 16 GB. Before launching headless Chrome, check `memory_pressure | tail -1` and keep at least 3 GB free. Run one headless Chrome at a time and never leave one running (`pgrep -f glome-chrome`).
- **Waiting:** no foreground `sleep` longer than a few seconds; long runs go in the background.
- **No accounts, no logins.** Uploading to itch.io is the owner's job.
- **Licences:** CC0 or public-domain assets only, credited in `docs/CREDITS.md`.
- **Subagents:** at most 2 at once, `model: sonnet`, told not to spawn their own. Never two agents on one file.
- **Lessons from runs four to six:**
  - Play as a new player first and measure before changing anything.
  - Test leaving places, not only reaching them.
  - Check any claim that something is "visible in any slice" (thin things vanish when the slice is half a metre off).
  - The owner wants creatures spread naturally where they live, not drawn to the player.
  - Look at every screenshot critically.
