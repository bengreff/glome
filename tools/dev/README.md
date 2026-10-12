# Dev test kit

What the runs used to check every change, kept here so the next session needn't rebuild it.

- `run.sh <name> <secs> [--gpu]`: runs `t/<name>.json` (a list of `{eval|file, wait, snap}` steps) in headless Chrome against `tools/serve.sh` (http://127.0.0.1:8650/). Output goes to `out/` (gitignored). It refuses to start with under 25% memory free or with another glome Chrome running, and kills Chrome at the end.
- `gates.sh`: every gate (unit tests, smoke, settle in five views, persistence, finds persistence, all playthroughs). About 25 minutes: run it in the background and read the log.
- Useful one-offs: `empty` (what your slice cuts within 100 m at 300 random places: trees, shrubs, rocks, creatures), `meet4` (creatures in your slice and view at 12 random places), `tilecap` (busiest screen tile against its cap), `bench.js` (GPU time of the slice pass with `B_BITS` debug toggles; the reliable A/B), `t/tour.js` (standard views: start, inwood, herd, down, outcrop, ruin, cairn, night, ...), `t/u.js` (moves along the frame).
- Settle: `sv2` runs auto resolution in five views; the gate is 60 fps at 50% or more on the M2 Pro.
