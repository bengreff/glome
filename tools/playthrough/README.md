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

Run three (gravity raised so the summit measures 9.8 m/s², tiers 28/43/53/72 m/s): mirror key, knot gate, antipode
and orbit all solved again (the orbit at tier III after 19 tries of the space map's predictor, a full turn, at most
625 m out). New, `pt_landB.js`: all four parts on the pad, a tier IV launch aimed by the predictor lands on B after
85 s (predicted 83).

Run three, N3 (the full world: forests, rocks, ruins, creatures): all five solved again. The flight playthroughs now
search at the moment they jump (the world turns on while a search runs otherwise), and pt_landB aims as a player does
with the map (tries directions and refines the one passing nearest B): random aiming hits B about once in a thousand.
Two real bugs were found this way: rocks and trees near the summit could catch a nearly level launch (the summit is now
clear for 45 m), and the space map counted grazing passes near B as landings (it now lands on B's floors exactly). The
orbit completed a full turn at most 505 m out; the tier IV launch landed on B after 148 s.

Run three, N4 (sockets set into the launcher's pad, beacons): all five solved. pt_orbit now also wants room to spare at
the orbit's low point (at least 40 m above the highest ground: the orbit is marginal by nature, and the flight drifts
from the map's prediction by a few metres a minute at first, so a path that skims the hills can be lost) and waits up
to 300 s for the turn. Two runs: full turns at 553 and 572 m out. Tier IV: landed on B after 69 s (predicted 68).
