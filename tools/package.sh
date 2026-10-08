#!/bin/sh
# Build the itch.io upload: a zip of the static site with index.html at its root, in dist/ (gitignored).
# Upload it on itch.io as an HTML game ("This file will be played in the browser"), viewport 1280×800, fullscreen button on.
cd "$(dirname "$0")/.." || exit 1
tools/stamp.sh >/dev/null
v=$(git describe --tags --always 2>/dev/null || date +%Y%m%d)
mkdir -p dist
out="dist/glome-$v.zip"
rm -f "$out"
zip -qr "$out" index.html style.css LICENSE README.md js audio docs/CREDITS.md docs/PHYSICS.md -x '*.DS_Store'
echo "$out ($(du -h "$out" | cut -f1))"
