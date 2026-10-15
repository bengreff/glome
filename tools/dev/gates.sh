#!/bin/sh
# gates.sh: every gate in turn (unit tests, smoke, settle in five views, persistence, finds persistence, the
# playthroughs). About 25 minutes; run it in the background and read the log.
D=$(cd "$(dirname "$0")" && pwd)
cd "$D/../.."
echo "== unit tests"; for t in test-so4 test-bodies test-rope test-audio test-creatures test-tides; do printf "%s: " $t; node tools/$t.mjs 2>&1 | tail -1; done
echo "== load"; sysctl -n vm.loadavg
echo "== smoke"; "$D/run.sh" smoke 90 --gpu 2>&1 | grep -v '^eval: 1$\|^status'
echo "== settle (start, inwood, herd, down, outcrop)"; "$D/run.sh" sv2 400 --gpu 2>&1 | grep -v '^eval: 1$\|^status\|tour ready'
echo "== persistence"; "$D/run.sh" persist 150 --gpu 2>&1 | grep -v '^eval: 1$\|^status'
echo "== finds persistence"; "$D/run.sh" fp 150 --gpu 2>&1 | grep -v '^eval: 1$\|^status'
echo "== stones (a pedestal's stone: take, stow, draw, forming)"; "$D/run.sh" stones 120 --gpu 2>&1 | grep -v '^eval: 1$\|^status'
echo "== sandbox (150 s of taking, throwing, setting down, jumping and twisting with things in hand)"; "$D/run.sh" sandbox 400 --gpu 2>&1 | grep -v '^eval: 1$\|^status'
echo "== on B: walk to the console and open it"; "$D/run.sh" bconsole 300 --gpu 2>&1 | grep -v '^eval: 1$\|^status'
echo "== the overhang: dropped on its floor, out of it on foot"; "$D/run.sh" overhang 400 --gpu 2>&1 | grep -v '^eval: 1$\|^status'
echo "== crabs (kinds, a bump, a run-in, one carried and set down, a ball chased)"; "$D/run.sh" crabs9 200 --gpu 2>&1 | grep -v '^eval: 1$\|^status'
echo "== space (the path follows a lever, timewarp 10x, back to the pad)"; "$D/run.sh" seg9c 300 --gpu 2>&1 | grep -v '^eval: 1$\|^status'
echo "== playthroughs"; printf "stones: "; "$D/run.sh" pt_stones 400 --gpu 2>&1 | grep -v '^status\|^eval: 1$' | grep .
for n in caveout aim; do printf "%s: " $n; "$D/run.sh" pt_$n 150 --gpu 2>&1 | grep -v '^status\|^eval: 1$' | grep .; done
printf "orbit: "; "$D/run.sh" pt_orbit 1500 --gpu 2>&1 | grep -v '^status\|^eval: 1$' | grep .
printf "landB: "; "$D/run.sh" pt_landB 800 --gpu 2>&1 | grep -v '^status\|^eval: 1$' | grep .
echo "== load"; sysctl -n vm.loadavg
