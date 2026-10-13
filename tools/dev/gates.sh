#!/bin/sh
# gates.sh: every gate in turn (unit tests, smoke, settle in five views, persistence, finds persistence, the
# playthroughs). About 25 minutes; run it in the background and read the log.
D=$(cd "$(dirname "$0")" && pwd)
cd "$D/../.."
echo "== unit tests"; for t in test-so4 test-bodies test-rope test-audio test-creatures; do printf "%s: " $t; node tools/$t.mjs 2>&1 | tail -1; done
echo "== load"; sysctl -n vm.loadavg
echo "== smoke"; "$D/run.sh" smoke 90 --gpu 2>&1 | grep -v '^eval: 1$\|^status'
echo "== settle (start, inwood, herd, down, outcrop)"; "$D/run.sh" sv2 400 --gpu 2>&1 | grep -v '^eval: 1$\|^status\|tour ready'
echo "== persistence"; "$D/run.sh" persist 150 --gpu 2>&1 | grep -v '^eval: 1$\|^status'
echo "== finds persistence"; "$D/run.sh" fp 150 --gpu 2>&1 | grep -v '^eval: 1$\|^status'
echo "== built things persistence (the gate's leaf, the fold's plates, the sliders)"; "$D/run.sh" pbuilt 150 --gpu 2>&1 | grep -v '^eval: 1$\|^status'
echo "== playthroughs"; for n in room caveout mirror knot fold aim; do printf "%s: " $n; "$D/run.sh" pt_$n 150 --gpu 2>&1 | grep -v '^status\|^eval: 1$' | grep .; done
printf "orbit: "; "$D/run.sh" pt_orbit 700 --gpu 2>&1 | grep -v '^status\|^eval: 1$' | grep .
printf "landB: "; "$D/run.sh" pt_landB 800 --gpu 2>&1 | grep -v '^status\|^eval: 1$' | grep .
echo "== load"; sysctl -n vm.loadavg
