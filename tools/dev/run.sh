#!/bin/sh
# run.sh <name> <secs> [--gpu]: build t/<name>.json into steps and run the game in headless Chrome under a watchdog.
# Screenshots and step files land in tools/dev/out/ (gitignored). Needs tools/serve.sh running (http://127.0.0.1:8650/).
D=$(cd "$(dirname "$0")" && pwd); mkdir -p "$D/out"
cd "$D" && node mk.mjs t/$1.json > out/$1.steps || exit 1
free=$(memory_pressure | tail -1 | sed 's/[^0-9]//g')
if [ "$free" -lt 25 ]; then echo "memory low ($free% free), not starting Chrome"; exit 1; fi
if pgrep -f glome-chrome >/dev/null; then echo "a glome Chrome is already running"; exit 1; fi
cd "$D/../.." && CDP_PORT=9341 perl -e 'alarm shift; exec @ARGV' ${2:-120} node tools/cdp.mjs http://127.0.0.1:8650/ "$D/out/$1" "$(cat "$D/out/$1.steps")" $3
pkill -9 -f glome-chrome 2>/dev/null; true
