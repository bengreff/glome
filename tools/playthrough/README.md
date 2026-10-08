# Scripted playthroughs

Each artifact was confirmed solvable by script, using the real controls where they are the puzzle (F to pick up
and set down, the ana twist, stepping through ana with E, the launcher's jump) and teleporting only for long walks.
Run one in the headless driver after `pt_common.js` (wait for the world to load after New world: about 10 s, longer
if the machine is busy), e.g.:

    node tools/cdp.mjs http://127.0.0.1:8650/ /tmp/pt '[{"eval":"__glome.dbg.save.newWorld(); 1","wait":8000},
      {"eval": <pt_common.js as a string>}, {"eval": <pt_mirror.js as a string>}]' --gpu

Results on 2026-10-08 (M2 Pro): mirror key solved (key axes match the model exactly after half a turn through ana);
knot gate solved (grab the loop, step through ana for 4 s, walk off: the rope ends 9.6 m from the post); orbit
solved at tier III (aim found by the space map's predictor after waiting 6 s, maximum 554 m from A's centre, the
flight completed a full turn). The closed room: walking down the tunnel reaches the chamber floor (14 m under the
hill). The antipode: anything resting in the summit's bowl opens the vault (the scripted set-down landed short of
the bowl; the mechanism itself was confirmed by placing a ball in it).

Day two (held things now physical, the bowl carved): mirror key, knot gate and antipode all solved by script again;
the antipode's ball, set down from the bowl's rim with the ghost, rests 0.26 m from its centre.
